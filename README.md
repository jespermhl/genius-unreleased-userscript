# Genius Song Unreleased Tag

Ein Userscript, das auf [genius.com](https://genius.com) hinter jedem Song einer Tracklist den Zusatz **„(Unreleased)"** in den Songtitel schreibt, sobald der Song mit dem Tag **Unreleased** versehen ist.

![Magic](https://img.shields.io/badge/magic-%E2%9C%A8-purple)

## Warum?

Neu veröffentlichte Alben (z. B. von Künstlern wie VICKY) enthalten oft Tracks, die noch nicht als „offiziell released" gelten. Genius markiert diese Songs mit dem Tag `Unreleased` – in der Tracklist sieht man das aber nicht. Dieses Script holt die Tag-Informationen und zeigt den Status direkt im Titel: `Hass-Mann* (Unreleased)`.

## Features

- Unterstützt **alle drei Rendering-Varianten** von Genius:
  - Alte Album-Seiten (`.chart_row`)
  - Neue React-Album-Seiten (`Track__Container-*`)
  - Song-Seiten mit eingebetteter Album-Tracklist (`AlbumTracklist__Track-*`)
- Holt die Tag-Infos über die offizielle Genius-API (`/api/songs/{id}`)
- Nutzt den eingebetteten `__PRELOADED_STATE__` des Styles für eine **Schnellprüfung** (kein API-Call für den aktuellen Song)
- Ergebnis-Cache gegen Mehrfach-Fetches bei React-Re-Renders
- HTML/Text wird nativ eingefügt – kein Obtrusive Styling, passt sich an helles und dunkles Theme an

## Installation

1. Userscript-Manager installieren ([Tampermonkey](https://www.tampermonkey.net/) oder [Violentmonkey](https://violentmonkey.github.io/)).
2. `genius-unreleased.user.js` öffnen – der Manager bietet automatisch an, das Script zu installieren.
3. Auf ein V3\*-Album oder eine VICKY-Song-Seite gehen – fertig.

## Verwendung

Keine Konfiguration nötig. Das Script läuft auf:

- `https://genius.com/albums/*`
- `https://genius.com/*-lyrics`
- `https://genius-staging.com/albums/*`
- `https://genius-staging.com/*-lyrics`

## Wie es funktioniert

1. **Layout-Erkennung**: Das Script erkennt anhand der DOM-Klassen, welche Variante die Seite nutzt.
2. **Song-Mapping**: Aus dem `__PRELOADED_STATE__` des Styles werden Song-Pfade, -Titel und die Track-Reihenfolge extrahiert und jeder Tracklist-Zeile eine Song-ID zugeordnet (Href → Titel → Reihenfolge).
3. **Tag-Check**: Songs, deren ID im Preloaded-State bereits als `Unreleased` (Tag-ID `2883`) erkannt wurde, bekommen sofort das Label. Alle anderen werden batched (6 parallel) über die Genius-API geprüft.
4. **Einfügen**: Der Text `(Unreleased)` wird direkt in den Songtitel-Link geschrieben, vor dem „Lyrics"-Subtitle.

## Entwicklung

Tests liegen unter `temp`im Arbeitsverzeichnis des Autors:

```bash
node --check genius-unreleased.user.js
```

E2E-DOM-Tests laufen mit `jsdom` (echte gespeicherte Seiten für altes Album-Layout und React-Song-Layout plus synthetische neue-Album-Seite).

## Lizenz

[MIT](LICENSE)