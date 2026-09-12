// ==UserScript==
// @name         Genius Song Unreleased Tag
// @namespace    https://github.com/jespermhl/genius-unreleased-userscript
// @version      2.2.0
// @description  Zeigt "(Unreleased)" hinter jedem Song in einer Tracklist auf genius.com (Album-Seiten sowie Song-Seiten mit eingebetteter Album-Tracklist), der den "Unreleased"-Tag trägt.
// @author       jespermahel
// @match        https://genius.com/albums/*
// @match        https://genius.com/*-lyrics
// @match        https://genius-staging.com/albums/*
// @match        https://genius-staging.com/*-lyrics
// @run-at       document-idle
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const PROCESSED_ATTR = 'data-genius-unreleased-done';
    const BATCH = 6;

    // Layouts:
    //  - 'old'   Alte Album-Seite  (.chart_row)
    //  - 'album' Neue React-Album-Seite  (a.Track__Container-*)
    //  - 'song'  React-Song-Seite mit eingebetteter Tracklist  (ol.AlbumTracklist__Container-*)
    const LAYOUTS = {
        old: {
            row: '.chart_row',
            anchor: '.chart_row-content a',
            title: 'h3.chart_row-content-title',
            subtitle: '.chart_row-content-title-subtitle',
        },
        album: {
            row: 'a[class*="Track__Container-sc-"]',
            title: 'span[class*="Track__TitleText-sc-"]',
            subtitle: 'span[class*="Track__Type-sc-"]',
        },
        song: {
            row: 'li[class*="AlbumTracklist__Track-sc-"]',
            title: 'div[class*="AlbumTracklist__TrackName-sc-"]',
        },
    };

    const ANY_ROW_SELECTOR = Object.values(LAYOUTS).map((l) => l.row).join(', ');

    function getLayout() {
        if (document.querySelector(LAYOUTS.album.row)) return 'album';
        if (document.querySelector(LAYOUTS.song.row)) return 'song';
        if (document.querySelector(LAYOUTS.old.row)) return 'old';
        return null;
    }

    // ---------------------------------------------------------------- preloaded state

    function getPreloadedState() {
        const scripts = document.querySelectorAll('script:not([src])');
        const stateRe = /window\.__PRELOADED_STATE__\s*=\s*JSON\.parse\((['"])([\s\S]*?)\1\)/;

        for (const script of scripts) {
            const match = script.textContent.match(stateRe);
            if (!match) continue;

            const raw = match[2]
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, '\\')
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '\r')
                .replace(/\\t/g, '\t')
                .replace(/\\(?!["\\/bfnrtu])/g, '')
                .replace(/[\u0000-\u001F]+/g, '');

            try {
                return JSON.parse(raw);
            } catch (err) {
                // Fallback: Regex-Kartierung unten
            }
        }

        return null;
    }

    // Durchsucht ein Objekt nach dem ersten Vorkommen eines Keys (max. Tiefe 5).
    function findIn(obj, key, depth = 0) {
        if (obj == null || depth > 5) return undefined;
        if (Array.isArray(obj)) {
            for (const value of obj) {
                const result = findIn(value, key, depth + 1);
                if (result !== undefined) return result;
            }
            return undefined;
        }
        if (typeof obj === 'object') {
            if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
            for (const value of Object.values(obj)) {
                if (value && typeof value === 'object') {
                    const result = findIn(value, key, depth + 1);
                    if (result !== undefined) return result;
                }
            }
        }
        return undefined;
    }

    function asList(value) {
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object') return Object.values(value);
        return [];
    }

    // Baut Song-Mapping aus dem Preloaded-State:
    //  pathToId  (Song-Pfad -> ID), titleToId (Titel -> ID), orderedIds (Track-Reihenfolge),
    //  preloadedUnreleased (IDs, die bereits im State als "Unreleased" erkannt wurden).
    function collectSongs() {
        const state = getPreloadedState();
        if (!state) return null;

        const pathToId = new Map();
        const titleToId = new Map();
        const orderedIds = [];
        const preloadedUnreleased = new Set();

        const songsEntity = findIn(state, 'songs');
        if (songsEntity && typeof songsEntity === 'object') {
            for (const [idKey, song] of Object.entries(songsEntity)) {
                const id = Number(idKey);
                if (!song || typeof song !== 'object' || !Number.isInteger(id)) continue;
                if (typeof song.path === 'string' && song.path.startsWith('/')) pathToId.set(song.path, id);
                if (typeof song.url === 'string') {
                    try {
                        pathToId.set(new URL(song.url, 'https://genius.com').pathname, id);
                    } catch (err) { /* ignore */ }
                }
                if (typeof song.title === 'string') titleToId.set(song.title.trim(), id);
            }
        }

        // Tag-IDs aus entities.tags auflösen (Name "Unreleased" oder /tags/unreleased).
        const tagsEntity = findIn(state, 'tags');
        if (tagsEntity && typeof tagsEntity === 'object') {
            const isUnreleasedTag = (tagId) => {
                const tag = tagsEntity[tagId];
                return tag && (
                    String(tag.name || '').toLowerCase() === 'unreleased'
                    || String(tag.url || '').toLowerCase().includes('/tags/unreleased')
                );
            };
            for (const [idKey, song] of Object.entries(songsEntity || {})) {
                const id = Number(idKey);
                if (!song || typeof song !== 'object' || !Number.isInteger(id)) continue;
                if (Array.isArray(song.tags) && song.tags.some(isUnreleasedTag)) {
                    preloadedUnreleased.add(id);
                }
            }
        }

        const appearances = findIn(state, 'albumAppearances');
        const appearanceEntries = appearances ? asList(appearances) : [];

        for (const entry of appearanceEntries) {
            let song = null;
            if (entry && entry.song != null) {
                if (typeof entry.song === 'number') song = { id: entry.song };
                else if (typeof entry.song === 'object') song = entry.song;
            }
            if (!song || !Number.isInteger(Number(song.id))) continue;

            const id = Number(song.id);
            if (typeof song.path === 'string' && song.path.startsWith('/')) pathToId.set(song.path, id);
            if (typeof song.title === 'string') titleToId.set(song.title.trim(), id);
        }

        // Track-Reihenfolge: bevorzugt albums[].tracklist, sonst Reihenfolge der albumAppearances.
        const albumsEntity = findIn(state, 'albums');
        if (albumsEntity && typeof albumsEntity === 'object') {
            for (const album of asList(albumsEntity)) {
                if (album && Array.isArray(album.tracklist)) {
                    for (const id of album.tracklist) orderedIds.push(Number(id));
                    break;
                }
            }
        }
        if (!orderedIds.length) {
            for (const entry of appearanceEntries) {
                const song = entry && entry.song;
                if (song && Number.isInteger(Number(song && song.id))) orderedIds.push(Number(song.id));
            }
        }

        if (!pathToId.size && !titleToId.size && !orderedIds.length) return null;

        return { pathToId, titleToId, orderedIds, preloadedUnreleased };
    }

    // ---------------------------------------------------------------- DOM & Mapping

    function resolveSongId(href, title, index, songs) {
        let id = null;

        if (href) {
            try {
                const url = new URL(href, window.location.href);
                const host = url.hostname;
                if (host === 'genius.com' || host === 'genius-staging.com' || host === window.location.hostname) {
                    id = songs.pathToId.get(url.pathname) || null;
                }
            } catch (err) {
                id = null;
            }
        }

        if (id == null && title) id = songs.titleToId.get(title) || null;
        if (id == null) id = songs.orderedIds[index] ? Number(songs.orderedIds[index]) : null;

        return id;
    }

    function getRowSongInfo(rows, songs, layout) {
        const infos = [];

        rows.forEach((row, index) => {
            if (row.hasAttribute(PROCESSED_ATTR)) return;

            const cfg = LAYOUTS[layout];
            let anchor = null;
            let beforeRef = null;
            let songId = null;

            if (layout === 'old') {
                anchor = row.querySelector(cfg.anchor);
                const title = row.querySelector(cfg.title);
                if (!anchor || !title) return;
                beforeRef = anchor.querySelector(cfg.subtitle);
                songId = resolveSongId(anchor.href || anchor.getAttribute('href'), null, index, songs);
            } else if (layout === 'album') {
                anchor = row.querySelector(cfg.title);
                if (!anchor) return;
                beforeRef = anchor.querySelector(cfg.subtitle);
                songId = resolveSongId(row.href, null, index, songs);
            } else if (layout === 'song') {
                const name = row.querySelector(cfg.title);
                if (!name) return;
                const songLink = name.querySelector('a[href]');
                anchor = songLink || name;
                songId = resolveSongId(songLink ? songLink.href : null, name.textContent.trim(), index, songs);
            }

            if (songId == null || !Number.isInteger(songId)) return;

            infos.push({ row, anchor, beforeRef, songId });
        });

        return infos;
    }

    // ---------------------------------------------------------------- Tag-Check

    const tagResultCache = new Map();

    async function songHasUnreleasedTag(songId, songs) {
        if (tagResultCache.has(songId)) return tagResultCache.get(songId);
        if (songs && songs.preloadedUnreleased.has(songId)) {
            tagResultCache.set(songId, true);
            return true;
        }

        try {
            const response = await fetch(`https://genius.com/api/songs/${songId}`);
            if (!response.ok) return false;
            const json = await response.json();
            const song = json && json.response && json.response.song;
            if (!song) return false;

            const isUnreleased = (tag) => tag
                && (
                    String(tag.name || '').toLowerCase() === 'unreleased'
                    || String(tag.url || '').toLowerCase().includes('/tags/unreleased')
                );

            const result = isUnreleased(song.primary_tag)
                || (Array.isArray(song.tags) && song.tags.some(isUnreleased));
            tagResultCache.set(songId, result);
            return result;
        } catch (err) {
            tagResultCache.set(songId, false);
            return false;
        }
    }

    const UNRELEASED_TEXT = '(Unreleased)';

    function addUnreleasedBadge(info) {
        if (!info.anchor || info.anchor.textContent.includes(UNRELEASED_TEXT)) return;

        const textNode = document.createTextNode(` ${UNRELEASED_TEXT} `);

        if (info.beforeRef && info.anchor.contains(info.beforeRef)) info.beforeRef.before(textNode);
        else info.anchor.appendChild(textNode);
    }

    // ---------------------------------------------------------------- Hauptlogik

    async function processRows(rows, songs, layout) {
        const infos = getRowSongInfo(rows, songs, layout);
        if (!infos.length) return;

        for (let i = 0; i < infos.length; i += BATCH) {
            const chunk = infos.slice(i, i + BATCH);
            const results = await Promise.all(chunk.map((info) => songHasUnreleasedTag(info.songId, songs)));

            chunk.forEach((info, j) => {
                info.row.setAttribute(PROCESSED_ATTR, 'true');
                if (results[j]) addUnreleasedBadge(info);
            });
        }
    }

    async function run() {
        const layout = getLayout();
        if (!layout) return;

        const songs = collectSongs();
        if (!songs) return;

        const rows = document.querySelectorAll(LAYOUTS[layout].row);
        if (!rows.length) return;

        await processRows(rows, songs, layout);
    }

    let startTimer = null;

    function schedule() {
        clearTimeout(startTimer);
        startTimer = setTimeout(run, 400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', schedule);
    } else {
        schedule();
    }

    // Neu gerenderte Zeilen (z.B. nach SPA-Navigation oder React-Re-Render) nachziehen.
    const observer = new MutationObserver((mutations) => {
        let needsRun = false;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                if (node.matches && (node.matches(ANY_ROW_SELECTOR) || node.querySelector(ANY_ROW_SELECTOR))) {
                    needsRun = true;
                    break;
                }
            }
            if (needsRun) break;
        }
        if (needsRun) schedule();
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();