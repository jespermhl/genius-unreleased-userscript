// ==UserScript==
// @name         Genius YouTube URL Finder
// @namespace    https://github.com/jespermhl
// @version      1.0.1
// @description  Searches YouTube from the "YouTube URL" field in the Genius song metadata popup (using the song title and artists) and inserts the video URL on click.
// @author       jespermhl
// @match        https://genius.com/*-lyrics
// @match        https://genius-staging.com/*-lyrics
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      youtube.com
// @downloadURL  https://raw.githubusercontent.com/jespermhl/genius-userscripts/main/genius-youtube/genius-youtube.user.js
// @updateURL    https://raw.githubusercontent.com/jespermhl/genius-userscripts/main/genius-youtube/genius-youtube.user.js
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const PREFIX = '[GeniusYouTubeURLFinder]';
    const log = (...args) => console.info(PREFIX, ...args);

    const INNERTUBE_API = 'https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
    const INNERTUBE_CONTEXT = {
        context: { client: { hl: 'en', gl: 'DE', clientName: 'WEB', clientVersion: '2.20250101.00.00' } },
    };
    const DEBOUNCE_MS = 350;
    const MAX_RESULTS = 8;

    const OVERLAY_CLASS = 'genius-yt-suggest';
    const LIST_CLASS = 'genius-yt-suggest__list';
    const ITEM_CLASS = 'genius-yt-suggest__item';
    const ITEM_ACTIVE_CLASS = 'genius-yt-suggest__item is-active';
    const THUMB_CLASS = 'genius-yt-suggest__thumb';
    const TITLE_CLASS = 'genius-yt-suggest__title';
    const META_CLASS = 'genius-yt-suggest__meta';
    const MSG_CLASS = 'genius-yt-suggest__msg';

    let currentInput = null;
    let overlay = null;
    let activeIndex = -1;
    let results = [];
    let inputTimer = null;
    let closeTimer = null;

    injectStyles();

    let observerTimer = null;

    function onDomMutation() {
        ensureBound();
        clearTimeout(observerTimer);
        observerTimer = setTimeout(maybeAutoSearch, 250);
    }

    const observer = new MutationObserver(onDomMutation);
    observer.observe(document.body, { childList: true, subtree: true });
    log('script loaded, MutationObserver started');
    ensureBound();
    setTimeout(maybeAutoSearch, 500);

    function ensureBound() {
        const input = document.querySelector('#edit-metadata-body input[name="youtube_url"]');
        if (!input) {
            if (currentInput) teardown();
            return;
        }
        if (input === currentInput) return;
        teardown();
        currentInput = input;
        bindInput(input);
        log('bound to youtube_url input (type=',
            input.type,
            ', placeholder=',
            JSON.stringify(input.placeholder),
            ', value=',
            JSON.stringify(input.value.slice(0, 40)),
            ')');
    }

    function teardown() {
        hideOverlay();
        if (currentInput) {
            currentInput.removeEventListener('focus', onFocus);
            currentInput.removeEventListener('input', onInput);
            currentInput.removeEventListener('keydown', onKeydown);
            currentInput.removeEventListener('blur', onBlur);
        }
        currentInput = null;
    }

    function bindInput(input) {
        input.addEventListener('focus', onFocus);
        input.addEventListener('input', onInput);
        input.addEventListener('keydown', onKeydown);
        input.addEventListener('blur', onBlur);
        maybeAutoSearch();
    }

    function maybeAutoSearch() {
        if (!currentInput) return;
        if (!isVisible(currentInput)) return;
        if (currentInput.value.trim() && !looksLikeUrl(currentInput.value)) return;
        const query = buildQuery();
        if (!query) return;
        log('auto-search (modal open, field visible) query=', JSON.stringify(query));
        startSearch(query);
    }

    function isVisible(el) {
        if (!el || !el.isConnected) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    }

    function onFocus() {
        if (!currentInput) return;
        startSearch(currentQuery());
    }

    function currentQuery() {
        const value = currentInput.value.trim();
        const typed = value && !looksLikeUrl(value) ? value : '';
        return typed || buildQuery();
    }

    function onInput() {
        clearTimeout(inputTimer);
        if (!currentInput) return;
        if (looksLikeUrl(currentInput.value)) {
            hideOverlay();
            return;
        }
        inputTimer = setTimeout(() => startSearch(currentInput.value.trim() || buildQuery()), DEBOUNCE_MS);
    }

    function onBlur() {
        clearTimeout(closeTimer);
        closeTimer = setTimeout(hideOverlay, 120);
    }

    function onKeydown(event) {
        if (!overlay || overlay.hidden) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            hideOverlay();
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive(Math.min(activeIndex + 1, results.length - 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(Math.max(activeIndex - 1, 0));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (activeIndex >= 0) selectResult(activeIndex);
        }
    }

    function looksLikeUrl(value) {
        return /^(https?:\/\/|youtu\.?be|www\.)/i.test(value.trim());
    }

    function buildQuery() {
        const title = (document.querySelector('#edit-metadata-body input[name="title"]') || {}).value || '';
        const artists = getArtists();
        return [title, ...artists].map(s => s.trim()).filter(Boolean).join(' ');
    }

    function getArtists() {
        const artists = [];
        const labels = document.querySelectorAll('#edit-metadata-body label');
        for (const label of labels) {
            const labelSpan = label.querySelector('span[class*="FieldLabel"]');
            if (!labelSpan) continue;
            const text = labelSpan.textContent.replace(/\s+/g, ' ').replace(/\s*\*$/, '').trim();
            if (text !== 'Artists') continue;
            label.querySelectorAll('.css-a69xu0-multiValue').forEach((chip) => {
                const name = chip.textContent.trim();
                if (name) artists.push(name);
            });
            break;
        }
        return artists;
    }

    let searchSeq = 0;
    const cache = new Map();

    function startSearch(query) {
        clearTimeout(inputTimer);

        if (!query) {
            hideOverlay();
            return;
        }

        if (cache.has(query)) {
            const cached = cache.get(query);
            results = cached.items;
            activeIndex = -1;
            if (cached.blocked) {
                showMessage('YouTube hat die Suche blockiert (Altersbeschränkung oder Consent). Versuche eine andere Suchanfrage.');
            } else if (results.length === 0) {
                showMessage('Keine Ergebnisse von YouTube gefunden.');
            } else {
                renderResults();
            }
            return;
        }

        log('search start, query=', JSON.stringify(query));
        const seq = ++searchSeq;
        showLoading();
        searchYouTube(query)
            .then((parsed) => {
                const items = parsed.items;
                log('search success, query=', JSON.stringify(query), 'results=', items.length);
                if (seq !== searchSeq || !currentInput) return;
                results = parsed.items;
                activeIndex = -1;
                cache.set(query, parsed);
                if (parsed.blocked) {
                    showMessage('YouTube hat die Suche blockiert (Altersbeschränkung oder Consent). Versuche eine andere Suchanfrage.');
                } else if (results.length === 0) {
                    showMessage('Keine Ergebnisse von YouTube gefunden.');
                } else {
                    renderResults();
                }
            })
            .catch((err) => {
                console.error(PREFIX, 'search failed', err);
                if (seq !== searchSeq || !currentInput) return;
                results = [];
                activeIndex = -1;
                showMessage('YouTube-Suche fehlgeschlagen. Bitte erneut versuchen.');
            });
    }

    function searchYouTube(query) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: INNERTUBE_API,
                headers: {
                    'Content-Type': 'application/json',
                    Cookie: 'SOCS=CAI',
                },
                data: JSON.stringify(Object.assign({}, INNERTUBE_CONTEXT, { query })),
                onload: (response) => {
                    log('GM_xmlhttpRequest status=', response.status, 'len=', response.responseText.length);
                    try {
                        resolve(parseResults(response.responseText));
                    } catch (err) {
                        reject(err);
                    }
                },
                onerror: (resp) => {
                    console.error(PREFIX, 'GM_xmlhttpRequest onerror', resp && resp.error);
                    reject(resp);
                },
                ontimeout: () => reject(new Error('timeout')),
                timeout: 15000,
            });
        });
    }

    function parseResults(responseText) {
        const data = JSON.parse(responseText);
        const items = [];
        let blockedByAgeGate = false;
        walk(data, (node) => {
            const video = node.videoRenderer;
            if (!video) return false;
            const id = video.videoId;
            if (!id) return false;
            const title = readRuns(video.title) || readSimpleText(video.title);
            if (!title) return false;
            let channel = '';
            if (video.ownerText) channel = readRuns(video.ownerText) || '';
            items.push({
                id,
                title,
                channel,
                duration: readSimpleText(video.lengthText),
                views: readSimpleText(video.viewCountText),
                published: readSimpleText(video.publishedTimeText),
            });
            return false;
        });
        const blocked = items.length === 0 && (
            responseText.includes('Confirm your age')
            || responseText.includes('backgroundPromoRenderer')
            || responseText.includes('consent')
        );
        if (blocked) {
            log('YouTube blocked the search (age gate / consent)');
            return { items: [], blocked: true };
        }
        return { items: items.slice(0, MAX_RESULTS), blocked: false };
    }

    function walk(node, visit) {
        if (Array.isArray(node)) {
            for (const value of node) walk(value, visit);
            return;
        }
        if (node && typeof node === 'object') {
            if (visit(node)) return;
            for (const value of Object.values(node)) walk(value, visit);
        }
    }

    function readRuns(node) {
        if (!node || !Array.isArray(node.runs)) return '';
        return node.runs.map(r => r.text || '').join('');
    }

    function readSimpleText(node) {
        if (!node || typeof node.simpleText !== 'string') return '';
        return node.simpleText;
    }

    // ---------------------------------------------------------------- overlay UI

    function ensureOverlay() {
        if (overlay && overlay.isConnected) return;
        overlay = document.createElement('div');
        overlay.className = OVERLAY_CLASS;
        overlay.hidden = true;
        document.body.appendChild(overlay);

        overlay.addEventListener('mousedown', (event) => event.preventDefault());

        overlay.addEventListener('click', (event) => {
            const item = event.target.closest('.' + ITEM_CLASS);
            if (!item) return;
            selectResult(Number(item.getAttribute('data-index')));
        });

        document.addEventListener('mousedown', onDocumentMousedown, true);
        window.addEventListener('resize', repositionOverlay);
    }

    function onDocumentMousedown(event) {
        if (!overlay || overlay.hidden) return;
        if (currentInput && currentInput.contains(event.target)) return;
        if (overlay.contains(event.target)) return;
        hideOverlay();
    }

    function showOverlay() {
        ensureOverlay();
        overlay.hidden = false;
        repositionOverlay();
    }

    function hideOverlay() {
        clearTimeout(inputTimer);
        if (overlay) {
            overlay.hidden = true;
            overlay.innerHTML = '';
        }
        results = [];
        activeIndex = -1;
    }

    function showLoading() {
        activeIndex = -1;
        showOverlay();
        overlay.innerHTML = '<ul class="' + LIST_CLASS + '"><li class="' + MSG_CLASS + '">Suche auf YouTube…</li></ul>';
    }

    function showMessage(text) {
        activeIndex = -1;
        showOverlay();
        overlay.innerHTML = '<ul class="' + LIST_CLASS + '"><li class="' + MSG_CLASS + '">' + esc(text) + '</li></ul>';
    }

    function renderResults() {
        activeIndex = -1;
        showOverlay();
        overlay.innerHTML = '<ul class="' + LIST_CLASS + '">' + results.map((r, i) => {
            const meta = [r.channel, r.duration, r.views].filter(Boolean).join(' · ');
            const thumb = 'https://i.ytimg.com/vi/' + encodeURIComponent(r.id) + '/mqdefault.jpg';
            return '<li class="' + ITEM_CLASS + '" data-index="' + i + '">'
                + '<img class="' + THUMB_CLASS + '" src="' + thumb + '" alt="" loading="lazy">'
                + '<div><div class="' + TITLE_CLASS + '">' + esc(r.title) + '</div>'
                + '<div class="' + META_CLASS + '">' + esc(meta) + '</div></div>'
                + '</li>';
        }).join('') + '</ul>';
        overlay.querySelector('li').classList.add('is-active');
        activeIndex = 0;
    }

    function setActive(index) {
        if (index < 0 || index >= results.length) return;
        activeIndex = index;
        const items = overlay.querySelectorAll('.' + ITEM_CLASS);
        items.forEach((el, i) => {
            el.className = i === index ? ITEM_ACTIVE_CLASS : ITEM_CLASS;
        });
    }

    function selectResult(index) {
        const result = results[index];
        if (!result || !currentInput) return;
        const url = 'https://www.youtube.com/watch?v=' + result.id;
        setNativeValue(currentInput, url);
        currentInput.dispatchEvent(new Event('input', { bubbles: true }));
        hideOverlay();
        currentInput.focus();
    }

    function setNativeValue(input, value) {
        const proto = window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) {
            descriptor.set.call(input, value);
        } else {
            input.value = value;
        }
    }

    function repositionOverlay() {
        if (!overlay || overlay.hidden || !currentInput) return;
        const rect = currentInput.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();
        const width = Math.max(rect.width, 360);
        const gap = 4;
        let top = rect.bottom + gap;
        if (top + overlayRect.height > window.innerHeight) {
            top = rect.top - gap - overlayRect.height;
        }
        if (top < 0) top = rect.bottom + gap;
        overlay.style.width = width + 'px';
        overlay.style.left = rect.left + 'px';
        overlay.style.top = top + 'px';
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = [
            '.' + OVERLAY_CLASS + '{position:fixed;z-index:2147483000;background:#fff;color:#111;border:1px solid #e0e0e0;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.16);font:13px/1.45 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;overflow:hidden;}',
            '.' + OVERLAY_CLASS + '[hidden]{display:none;}',
            '.' + LIST_CLASS + '{margin:0;padding:4px;list-style:none;max-height:340px;overflow-y:auto;}',
            '.' + ITEM_CLASS + '{display:flex;gap:10px;align-items:center;padding:6px 8px;border-radius:6px;cursor:pointer;}',
            '.' + ITEM_CLASS + '.is-active{background:#eef2ff;}',
            '.' + THUMB_CLASS + '{width:80px;height:45px;object-fit:cover;border-radius:4px;flex:none;background:#eee;}',
            '.' + TITLE_CLASS + '{font-weight:600;color:#111;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
            '.' + META_CLASS + '{color:#606060;font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.' + MSG_CLASS + '{padding:10px 12px;color:#606060;}',
            '@media (prefers-color-scheme: dark){.' + OVERLAY_CLASS + '{background:#282828;color:#fff;border-color:#404040;}.' + TITLE_CLASS + '{color:#fff;}.' + META_CLASS + ',.' + MSG_CLASS + '{color:#aaa;}.' + ITEM_CLASS + '.is-active{background:#3c4257;}}',
        ].join('');
        document.head.appendChild(style);
    }

    function esc(text) {
        return String(text).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        }[c]));
    }
})();