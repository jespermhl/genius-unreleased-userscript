# Genius Userscripts

A collection of userscripts that extend the [Genius](https://genius.com) web experience. Each script is self-contained, unobtrusive, and styled to match Genius' native interface.

## Table of Contents

- [Scripts](#scripts)
- [Features](#features)
- [Compatibility](#compatibility)
- [Installation](#installation)
- [Usage](#usage)
- [Development](#development)
- [License](#license)

## Scripts

| Script | Description |
| --- | --- |
| [Genius Song Unreleased Tag](genius-unreleased/) | Appends **" (Unreleased)"** to every track in a tracklist that carries the *Unreleased* tag — works on album pages and song pages with an embedded album tracklist. |
| [Genius YouTube URL Finder](genius-youtube/) | Searches YouTube from the *YouTube URL* field in the song metadata popup, using the song's title and artists, and inserts the matching video URL on click. |

## Features

- **Native look & feel** – The injected UI reuses Genius' own CSS classes, so it blends seamlessly into the page instead of sticking out.
- **Keyboard friendly** – YouTube suggestions can be navigated and selected entirely with the keyboard (arrows, Enter, Escape).
- **No API keys required** – Search is performed through YouTube's public web endpoint, no registration needed.
- **Lightweight** – Plain JavaScript, no runtime dependencies, no build step.

## Compatibility

- **Browser**: Chrome, Firefox, Safari, and Edge (with a userscript manager)
- **Userscript manager**: [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)
- **Sites**: `genius.com` and `genius-staging.com`

## Installation

1. Install a userscript manager ([Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)).
2. Click one of the links below – your manager will offer to install the script:

   - [genius-unreleased.user.js](https://github.com/jespermhl/genius-userscripts/raw/refs/heads/main/genius-unreleased/genius-unreleased.user.js)
   - [genius-youtube.user.js](https://github.com/jespermhl/genius-userscripts/raw/refs/heads/main/genius-youtube/genius-youtube.user.js)

Both scripts self-update automatically via Tampermonkey/Violentmonkey once installed.

## Usage

**Genius Song Unreleased Tag** – no configuration required; annotation is applied automatically wherever the *Unreleased* tag is present.

**Genius YouTube URL Finder** – open the metadata popup on any song page. As soon as you type in the *YouTube URL* field, live suggestions appear above the song cover. Click a suggestion (or select it with the arrow keys and press Enter) to insert the video URL.

## Development

1. Clone the repository:

   ```sh
   git clone https://github.com/jespermhl/genius-userscripts.git
   ```

2. Edit the script under `genius-youtube/` or `genius-unreleased/`.
3. Validate the syntax before publishing:

   ```sh
   node --check genius-youtube/genius-youtube.user.js
   ```

## License

[MIT](LICENSE) © [Jesper Mahel](https://github.com/jespermhl)