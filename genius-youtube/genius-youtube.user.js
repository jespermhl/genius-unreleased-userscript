// ==UserScript==
// @name         Genius YouTube URL Finder
// @namespace    https://github.com/jespermhl
// @version      1.4.2
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

    const RESULTS_CLASS = 'genius-yt-results';
    const HEADER_CLASS = 'genius-yt-results__header';
    const LIST_CLASS = 'genius-yt-results__list';
    const ROW_CLASS = 'genius-yt-results__row';
    const THUMB_CLASS = 'genius-yt-results__thumb';
    const TITLE_CLASS = 'genius-yt-results__title';
    const META_CLASS = 'genius-yt-results__meta';
    const MSG_CLASS = 'genius-yt-results__msg';

    const SEARCHED_ATTR = 'data-genius-yt-searched';

    let currentInput = null;
    let resultsEl = null;
    let activeIndex = -1;
    let results = [];
    let inputTimer = null;
    let searchSeq = 0;
    const cache = new Map();
    let native = { fieldLabel: '', option: '', input: '' };

    injectStyles();

    let observerTimer = null;

    function onDomMutation() {
        ensureBound();
        clearTimeout(observerTimer);
        observerTimer = setTimeout(maybeAutoSearch, 300);
    }

    const observer = new MutationObserver(onDomMutation);
    observer.observe(document.body, { childList: true, subtree: true });
    log('script loaded, MutationObserver started');
    ensureBound();
    setTimeout(maybeAutoSearch, 400);

    // ---------------------------------------------------------------- binding

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
        log(
            'bound to youtube_url input (placeholder=',
            JSON.stringify(input.placeholder),
            ', value=',
            JSON.stringify(input.value.slice(0, 40)),
            ')'
        );
    }

    function captureNativeClasses() {
        const modal = document.querySelector('#edit-metadata-body');
        if (!modal) return;
        const label = modal.querySelector('span[class*="FieldLabel"]');
        if (label) native.fieldLabel = label.className;
        if (currentInput) native.input = currentInput.className;
        const option = modal.querySelector('[class*="-option"]');
        if (option) native.option = option.className;
        if (!native.fieldLabel && !native.input && !native.option) {
            log('no native classes found yet, will retry');
        }
    }

    function teardown() {
        if (currentInput) {
            currentInput.removeEventListener('focus', onFocus);
            currentInput.removeEventListener('input', onInput);
            currentInput.removeEventListener('keydown', onKeydown);
        }
        removeResults();
        currentInput = null;
        resultsEl = null;
        results = [];
        activeIndex = -1;
    }

    function bindInput(input) {
        captureNativeClasses();
        input.addEventListener('focus', onFocus);
        input.addEventListener('input', onInput);
        input.addEventListener('keydown', onKeydown);
        maybeAutoSearch();
    }

    function alreadySearched() {
        const modal = document.querySelector('#edit-metadata-body');
        return !!(modal && modal.getAttribute(SEARCHED_ATTR));
    }

    function markSearched() {
        const modal = document.querySelector('#edit-metadata-body');
        if (modal) modal.setAttribute(SEARCHED_ATTR, 'true');
    }

    function maybeAutoSearch() {
        if (!currentInput) return;
        if (alreadySearched()) return;
        if (!isVisible(currentInput)) return;
        if (currentInput.value.trim() && !looksLikeUrl(currentInput.value)) return;
        const query = buildQuery();
        if (!query) return;
        log('auto-search (first time) query=', JSON.stringify(query));
        startSearch(query);
    }

    function isVisible(el) {
        if (!el || !el.isConnected) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    }

    // ---------------------------------------------------------------- input events

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
            clearResults();
            return;
        }
        inputTimer = setTimeout(() => startSearch(currentInput.value.trim() || buildQuery()), DEBOUNCE_MS);
    }

    function onKeydown(event) {
        if (!resultsEl || !resultsEl.isConnected || results.length === 0) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            clearResults();
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

    // ---------------------------------------------------------------- search

    function startSearch(query) {
        clearTimeout(inputTimer);

        if (!query) {
            clearResults();
            return;
        }

        markSearched();

        if (cache.has(query)) {
            renderCached(cache.get(query));
            return;
        }

        log('search start, query=', JSON.stringify(query));
        const seq = ++searchSeq;
        showLoading();
        searchYouTube(query)
            .then((parsed) => {
                log('search success, query=', JSON.stringify(query), 'results=', parsed.items.length);
                if (seq !== searchSeq || !currentInput) return;
                cache.set(query, parsed);
                render(parsed);
            })
            .catch((err) => {
                console.error(PREFIX, 'search failed', err);
                if (seq !== searchSeq || !currentInput) return;
                showMessage('YouTube-Suche fehlgeschlagen. Bitte erneut versuchen.');
            });
    }

    function renderCached(parsed) {
        if (parsed.blocked) {
            showMessage('YouTube hat die Suche blockiert (Altersbeschränkung oder Consent). Versuche eine andere Suchanfrage.');
        } else if (parsed.items.length === 0) {
            showMessage('Keine Ergebnisse von YouTube gefunden.');
        } else {
            renderResults(parsed.items);
        }
    }

    function render(parsed) {
        if (parsed.blocked) {
            showMessage('YouTube hat die Suche blockiert (Altersbeschränkung oder Consent). Versuche eine andere Suchanfrage.');
        } else if (parsed.items.length === 0) {
            showMessage('Keine Ergebnisse von YouTube gefunden.');
        } else {
            renderResults(parsed.items);
        }
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
            || responseText.toLowerCase().includes('consent')
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

    // ---------------------------------------------------------------- results UI (native Genius classes)

    function rowBaseClass() {
        return (native.option || native.input || ROW_CLASS).trim();
    }

    function ensureResultsEl() {
        if (resultsEl && resultsEl.isConnected) return resultsEl;
        if (!currentInput) return null;

        const artInput = document.querySelector('#edit-metadata-body input[name="custom_song_art_image_url"]');
        const artRow = artInput ? artInput.closest('div[class*="MetadataRow"]') : null;
        if (artRow) {
            resultsEl = document.createElement('div');
            resultsEl.className = RESULTS_CLASS;
            artRow.insertAdjacentElement('afterbegin', resultsEl);
            return resultsEl;
        }

        const row = currentInput.closest('div[class*="MetadataRow"]');
        const anchor = row || currentInput.closest('label').parentElement;
        if (!anchor) return null;

        resultsEl = document.createElement('div');
        resultsEl.className = RESULTS_CLASS;
        anchor.insertAdjacentElement('afterend', resultsEl);
        return resultsEl;
    }

    function removeResults() {
        if (resultsEl && resultsEl.isConnected) resultsEl.remove();
        resultsEl = null;
        results = [];
        activeIndex = -1;
    }

    function clearResults() {
        if (resultsEl && resultsEl.isConnected) resultsEl.innerHTML = '';
        results = [];
        activeIndex = -1;
    }

    function headerHtml() {
        const cls = (native.fieldLabel || HEADER_CLASS).trim();
        return '<span class="' + cls + '" style="display:block;font-size:13px;text-transform:none;letter-spacing:0;color:#111;font-weight:600;line-height:1.4;">Vorschläge von YouTube</span>';
    }

    function showLoading() {
        const el = ensureResultsEl();
        if (!el) return;
        activeIndex = -1;
        el.innerHTML = headerHtml()
            + '<div class="' + LIST_CLASS + '"><div class="' + MSG_CLASS + '">Suche auf YouTube…</div></div>';
    }

    function showMessage(text) {
        const el = ensureResultsEl();
        if (!el) return;
        activeIndex = -1;
        el.innerHTML = headerHtml()
            + '<div class="' + LIST_CLASS + '"><div class="' + MSG_CLASS + '">' + esc(text) + '</div></div>';
    }

    function renderResults(items) {
        const el = ensureResultsEl();
        if (!el) return;
        results = items;
        activeIndex = -1;

        const base = rowBaseClass();
        const rowsHtml = items.map((r, i) => {
            const meta = [r.channel, r.duration].filter(Boolean).join(' · ');
            const thumb = 'https://i.ytimg.com/vi/' + encodeURIComponent(r.id) + '/mqdefault.jpg';
            return '<div class="' + base + '" data-index="' + i + '" style="display:flex;align-items:center;gap:10px;">'
                + '<img class="' + THUMB_CLASS + '" src="' + thumb + '" alt="" loading="lazy">'
                + '<div class="genius-yt-results__body"><div class="' + TITLE_CLASS + '">' + esc(r.title) + '</div>'
                + '<div class="' + META_CLASS + '">' + esc(meta) + '</div></div>'
                + '</div>';
        }).join('');

        el.innerHTML = headerHtml() + '<div class="' + LIST_CLASS + '">' + rowsHtml + '</div>';

        el.addEventListener('mouseover', (event) => {
            const row = event.target.closest('[data-index]');
            if (!row) return;
            setActive(Number(row.getAttribute('data-index')));
        });

        el.addEventListener('mousedown', (event) => event.preventDefault());

        el.addEventListener('click', (event) => {
            const row = event.target.closest('[data-index]');
            if (!row) return;
            selectResult(Number(row.getAttribute('data-index')));
        });
    }

    function setActive(index) {
        if (index < 0 || index >= results.length) return;
        activeIndex = index;
        const base = rowBaseClass();
        const rows = resultsEl ? resultsEl.querySelectorAll('[data-index]') : [];
        rows.forEach((el, i) => {
            el.className = base;
            if (i === index) el.style.background = '#f5f5f5';
            else el.style.background = '';
        });
        const active = rows[activeIndex];
        if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
    }

    function selectResult(index) {
        const result = results[index];
        if (!result || !currentInput) return;
        const url = 'https://www.youtube.com/watch?v=' + result.id;
        setNativeValue(currentInput, url);
        currentInput.dispatchEvent(new Event('input', { bubbles: true }));
        removeResults();
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

    // ---------------------------------------------------------------- styles

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = [
            'div[class*="AudioAndMedia__Container"] > div[class*="MetadataRow"]{grid-template-columns:minmax(0,1fr) minmax(0,1fr);}',
            '.' + RESULTS_CLASS + '{grid-column:1;grid-row:1;margin:0;width:100%;min-width:0;align-self:start;}',
            'div[class*="AudioAndMedia__ImageFieldContainer"]{grid-column:2;grid-row:1;width:100%;min-width:0;}',
            '.genius-yt-results .' + LIST_CLASS + '{width:100%;box-sizing:border-box;}',
            'div[class*="AudioAndMedia__Gradient"]{display:none;}',
            '.' + HEADER_CLASS + '{display:block;padding:0 0 4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#757575;font-family:"Inter","Helvetica Neue",Arial,sans-serif;font-weight:600;}',
            '.' + ROW_CLASS + '{display:flex;align-items:center;gap:10px;padding:6px 8px;cursor:pointer;border-bottom:1px solid #eee;background:#fff;}',
            '.' + THUMB_CLASS + '{width:64px;height:36px;object-fit:cover;border-radius:2px;flex:none;}',
            '.genius-yt-results__body{min-width:0;flex:1;}',
            '.' + TITLE_CLASS + '{font-weight:700;color:#111;font-size:13px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
            '.' + META_CLASS + '{color:#666;font-size:12px;font-weight:500;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:"Inter","Helvetica Neue",Arial,sans-serif;}',
            '.' + MSG_CLASS + '{padding:8px 10px;color:#666;font-size:13px;font-family:"Inter","Helvetica Neue",Arial,sans-serif;}',
            '.' + LIST_CLASS + '{max-height:168px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;}',
            '.' + LIST_CLASS + '::-webkit-scrollbar{width:6px;}',
            '.' + LIST_CLASS + '::-webkit-scrollbar-thumb{background:#d5d5d5;border-radius:3px;}',
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