# Genius Userscripts

A small collection of userscripts for [Genius](https://genius.com), each styled to match the native interface.

| Script | Description |
| --- | --- |
| [Genius Song Unreleased Tag](genius-unreleased/) | Appends **" (Unreleased)"** to every track that carries the *Unreleased* tag, on album pages and song pages with an embedded tracklist. |
| [Genius YouTube URL Finder](genius-youtube/) | Searches YouTube from the *YouTube URL* field in the song metadata popup, using the song's title and artists, and inserts the video URL on click. |

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Click a link below — your manager will offer to install the script.

- [genius-unreleased.user.js](https://github.com/jespermhl/genius-userscripts/raw/refs/heads/main/genius-unreleased/genius-unreleased.user.js)
- [genius-youtube.user.js](https://github.com/jespermhl/genius-userscripts/raw/refs/heads/main/genius-youtube/genius-youtube.user.js)

Both scripts update themselves automatically once installed.

## Usage

**Genius Song Unreleased Tag** requires no setup — the annotation is applied automatically wherever the *Unreleased* tag is present.

**Genius YouTube URL Finder** — open the metadata popup on any song page and type in the *YouTube URL* field. Suggestions appear next to the song cover; click one (or use arrows + Enter) to insert the video URL. No API keys required.

## License

[MIT](LICENSE) © [Jesper Mahel](https://github.com/jespermhl)