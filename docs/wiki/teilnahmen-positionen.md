# Teilnahmen & Positionen

Das Herz der App: Wer geht zu welcher Band – und wo steht ihr im
Publikum? Serverseitig: `setSelection`/`setPosition` in
`src/lib/db.ts`, Routen `POST /api/selection` und `POST /api/position`.

## Teilnahmen (Selections)

Eine Teilnahme ist `(user_id, festival_id, slot_id)` mit Status:

- **`going`** – feste Zusage („Ich bin dabei!"), zählt für den
  Feuerrahmen und die Personenanzahl.
- **`interested`** – unverbindliches Interesse, wird getrennt
  angezeigt (`splitAttendees` in `src/lib/types.ts`).
- **`null`** – austragen.

Wichtige Regeln:

- Teilnahmen hängen am **Nutzer + Festival, nicht an der Gruppe**
  (Details und Konsequenzen: [Gruppen](gruppen.md),
  [Architektur](architektur.md)). Wer in zwei Gruppen desselben
  Festivals ist, hat in beiden dieselben Zusagen – fachlich korrekt.
- `POST /api/selection` prüft Session, **Mitgliedschaft in der
  angegebenen Gruppe** und validiert den Slot gegen den Timetable des
  Gruppen-Festivals; geschrieben wird die `festival_id` der Gruppe.
- **Wer sich austrägt, verliert auch seine Positionsmarkierung** für
  diesen Slot – `setSelection(null)` löscht Selection und Position in
  einer Transaktion.

## Positionen (✕ auf dem Blueprint)

„Hier stehe ich": ein Marker in **Prozent-Koordinaten (0–100)** auf dem
schematischen Bühnen-Grundriss (Blueprint), sichtbar für die ganze
Gruppe.

- Eine Position gibt es **nur mit Teilnahme**: `setPosition` schreibt
  per `INSERT … WHERE EXISTS (SELECT … FROM selections …)` – ohne
  Eintragung antwortet die API mit `not-attending`.
- Jede Position trägt `updated_at`. Die UI zeigt das relativ an
  („vor 5 Min.") und markiert Marker **älter als 90 Minuten** als
  veraltet („vielleicht längst weitergezogen", `isStalePosition`).

## Feuerrahmen 🔥

Bands mit vielen festen Zusagen brennen: Erreicht die Anzahl der
`going`-Teilnahmen die **pro Gruppe einstellbare Schwelle**
(`groups.hot_threshold`, Default 5, 0 = aus), bekommt der Slot einen
animierten Feuerrahmen (`isHotSlot` in `src/lib/types.ts`).

Die Optik ist eine klassische **Doom-Fire-Simulation**
(`src/lib/client/fireEngine.ts`): Die Rahmenlinie der Karte dient als
Brennstoff und wird jeden Frame mit wandernden Hotspots neu gezündet,
die Hitze steigt mit seitlichem Jitter auf und kühlt zufällig ab. Ein
einziger `requestAnimationFrame`-Loop (30 FPS) treibt alle sichtbaren
Rahmen auf einem groben Pixelraster – das kostet fast nichts. Bei
`prefers-reduced-motion` bleibt stattdessen ein statischer
CSS-Glut-Fallback stehen.
