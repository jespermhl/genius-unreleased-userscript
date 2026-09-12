# Genius Song Unreleased Tag

A userscript that appends the marker **“(Unreleased)”** directly to the song title of every track in a tracklist on [genius.com](https://genius.com) that carries the **Unreleased** tag.

## Why?

Albums often contain tracks that have not been officially released yet. On Genius these songs are marked with the tag `Unreleased` – but you cannot see that in the tracklist. This script fetches the tag information and shows the status right in the title.

## Features

- Supports **all three rendering variants** of Genius:
  - Legacy album pages (`.chart_row`)
  - New React album pages (`Track__Container-*`)
  - Song pages with an embedded album tracklist (`AlbumTracklist__Track-*`)
- Fetches tag information through the official Genius API (`/api/songs/{id}`)
- Uses the page’s embedded `__PRELOADED_STATE__` as a **fast path** (no API call for the current song)
- Result cache to avoid duplicate fetches on React re-renders
- Inserts plain text – no intrusive styling, adapts to light and dark themes

## Installation

1. Install a userscript manager ([Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)).
2. Install directly: [genius-unreleased.user.js](https://github.com/jespermhl/genius-unreleased-userscript/raw/refs/heads/main/genius-unreleased.user.js) – your manager will offer to install the script.
3. Go to an album or song page – done.

## Usage

No configuration required. The script runs on:

- `https://genius.com/albums/*`
- `https://genius.com/*-lyrics`
- `https://genius-staging.com/albums/*`
- `https://genius-staging.com/*-lyrics`

## How it works

1. **Layout detection**: The script detects which variant the page uses based on the DOM classes.
2. **Song mapping**: Song paths, titles, and track order are extracted from the page’s `__PRELOADED_STATE__` and each tracklist row is mapped to a song ID (href → title → order).
3. **Tag check**: Songs whose ID already resolved to `Unreleased` (tag ID `2883`) in the preloaded state get the label immediately. All others are checked in batches (6 parallel) via the Genius API.
4. **Insertion**: The text `(Unreleased)` is written directly into the song title link, before the “Lyrics” subtitle.

E2E DOM tests run with `jsdom` (real saved pages for the legacy album layout and the React song layout, plus a synthetic new-album page).

## License

[MIT](LICENSE)