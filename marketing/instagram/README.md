# Instagram-Grafiken

Fertige Grafiken für den Festival-Buddy-Instagram-Auftritt, im
DEFƎKT-Look der App (Signal-Orange auf Tiefschwarz, Anton-Headlines,
Kratzer-Logo wie im App-Icon).

| Datei | Format | Zweck |
| --- | --- | --- |
| `profile.png` | 1080×1080 | Profilbild – Kratzer-Logo, mittig im runden Zuschnitt |
| `ad-1-hero.png` | 1080×1350 (4:5) | Feed-Anzeige: „Wer geht zu welcher Band?" |
| `ad-2-timetable.png` | 1080×1080 (1:1) | Feed-Anzeige: Timetable-Grid mit Crew-Punkten & Hot Slot |
| `ad-3-story.png` | 1080×1920 (9:16) | Story-Anzeige: Offline-Modus („Kein Netz? Kein Problem.") |

Die Bandnamen im Timetable-Motiv sind frei erfunden (keine echten Bands,
keine Rechte-Probleme). Die Story lässt oben/unten Platz für die
Instagram-UI (Profilzeile, „Link"-Sticker).

## Neu rendern

Die PNGs entstehen aus den HTML-Vorlagen in `src/` per
Chromium-Screenshot:

```bash
cd marketing/instagram/src
npm i playwright-core
node render.js            # schreibt die PNGs eine Ebene höher
```

Ohne vorinstalliertes Chromium (`/opt/pw-browsers`) den Browserpfad über
`CHROME_PATH` mitgeben. Texte/Farben einfach in den HTML-Dateien bzw.
`base.css` anpassen und neu rendern.

## Schrift

`src/fonts/anton.woff2` ist die Display-Schrift **Anton** (Vernon Adams),
lizenziert unter der [SIL Open Font License 1.1](https://openfontlicense.org) –
Weitergabe und kommerzielle Nutzung sind erlaubt.
