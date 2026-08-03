# Instagram-Bilderstrecke: Festival Buddy fürs Party.San

Sechs Slides (Carousel) im Instagram-Hochformat **1080 × 1350 px (4:5)**,
die die wichtigsten Features der App für Festival-Besucher zeigen. Gedacht
für den Account des Party.San Open Air, um die App als Festival-App
vorzustellen.

| Slide | Inhalt |
| ----- | ------ |
| 1     | Cover/Hook: „Wer geht zu welcher Band?" + App-Teaser |
| 2     | Timetable-Grid: alle Bühnen, ein Tap = eingetragen |
| 3     | „Unsere Bands"-Liste: wer ist wo dabei + Hot Slot 🔥 |
| 4     | Bühnenplan: ✕-Standort-Marker + POIs (Toiletten, Wasser, Merch, Erste Hilfe) |
| 5     | Offline/Funkloch, Passkey-Login, Veranstalter-Durchsagen |
| 6     | CTA: in drei Schritten dabei, „Link in Bio" |

Die fertigen PNGs liegen in [`out/`](out/), ein Caption-Vorschlag in
[`caption.md`](caption.md).

## Wichtig: Beispieldaten

Die Handy-Mockups sind **keine Screenshots**, sondern im App-Design
nachgebaute Ansichten (analog zu `src/components/AppScreenshot.tsx`).
Timetable-Inhalte (Bands, Zeiten, Bühnen, Tage) sind **erfundene
Demo-Daten** – kein angekündigtes Lineup. Jeder Slide trägt deshalb den
Randvermerk „Demo-Ansicht · Beispieldaten". Vor dem Posten prüfen, ob die
gezeigten Bandnamen fürs Party.San unproblematisch sind, oder sie in
`slides.html` austauschen.

## Neu rendern

```bash
node render.mjs   # braucht Playwright + Chromium (lokal oder global installiert)
```

`slides.html` ist die einzige Quelle: Jeder Slide ist eine 1080×1350-Sektion,
`?slide=N` blendet für den Screenshot genau einen ein. Ohne Parameter zeigt
die Datei alle sechs untereinander – praktisch zum Bearbeiten im Browser.

Design-Tokens (Farben, Anton/Inter, Grid-Overlay, Feuerrahmen) entsprechen
`src/app/globals.css`; die Fonts liegen als lokale WOFF2-Kopien in
[`fonts/`](fonts/) (Anton & Inter, via Google Fonts, SIL Open Font License),
damit der Render offline läuft.
