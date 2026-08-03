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
| 5     | Band-Erinnerungen (Push), Offline/Funkloch, Veranstalter-Durchsagen |
| 6     | CTA: in drei Schritten dabei, „Link in Bio" |

Die fertigen PNGs liegen in [`out/`](out/), ein Caption-Vorschlag in
[`caption.md`](caption.md).

## Wichtig: echte Bands, beispielhafte Zeiten

Die Handy-Mockups sind **keine Screenshots**, sondern im App-Design
nachgebaute Ansichten (analog zu `src/components/AppScreenshot.tsx`).
Die gezeigten Bands, Tage (Do 6.8. – Sa 8.8.2026) und Bühnen
(Mainstage/Tentstage) entsprechen der **offiziellen Running Order 2026**
(party-san.de/bands-2026/running-order, abgerufen über Presse-Spiegel am
03.08.2026, u. a. vampster.com und time-for-metal.eu, da die Seite selbst
Bot-Zugriffe blockt). Die **Uhrzeiten sind beispielhaft** gesetzt – exakte
Set-Zeiten waren nicht maschinenlesbar verfügbar, und die Slot-Reihenfolge
am Freitagabend (Sacred Reich → Dark Funeral → Alcest → Amorphis) ist
plausibel geschätzt. Jeder Mockup-Slide trägt deshalb den Randvermerk
„Lineup 2026 · Zeiten beispielhaft". Vor dem Posten idealerweise die
Zeiten in `slides.html` mit der finalen Running Order abgleichen.

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
