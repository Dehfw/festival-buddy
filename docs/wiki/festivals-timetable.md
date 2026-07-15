# Festivals & Timetable

Die Timetables liegen **pro Festival in der Datenbank** (Tabelle
`festivals`, Spalte `timetable` als JSONB mit `days`/`stages`/`slots`).
`data/timetable.json` dient nur noch als Seed für Wacken beim
allerersten Schemalauf – danach ist die DB die Wahrheit, und ein
Lineup-Update braucht **keinen Redeploy** (Import-Kommandos: siehe
[README](../../README.md#timetable-daten)).

## Slot-IDs – der wichtigste Vertrag

Slot-IDs haben das Format **`tag-buehne-bandslug`** und sind nur **pro
Festival** eindeutig. An ihnen hängen alle Teilnahmen und Positionen
(`(user_id, festival_id, slot_id)`). Daraus folgt die zentrale Regel
für jeden Import: **Slot-IDs müssen über Re-Importe stabil bleiben**,
sonst verlieren die Crews ihre Eintragungen. Der Wacken-Import filtert
deshalb Alt-Events und hält die IDs stabil; ein Import ersetzt immer
den kompletten Timetable-Block eines Festivals.

## Zeiten nach Mitternacht

Sets nach Mitternacht zählen zum Vortag und werden mit Stunden ≥ 24
notiert (01:00 Uhr nachts → `25:00`). `toMinutes()` in
`src/lib/types.ts` interpretiert Stunden vor 08:00 als
Nach-Mitternacht-Sets; `formatTime()` zeigt sie wieder als normale
Uhrzeit an. So sortiert das Timetable-Grid die Nacht-Slots korrekt ans
Ende des Festivaltags.

## Auslieferung an den Client

`getTimetable(festivalId)` liest aus der DB und cached das Ergebnis
**15 Sekunden pro Prozess** – `/api/data` wird alle 7 s pro Client
gepollt, das JSONB muss nicht jedes Mal von der Platte. Welchen
Timetable ein Client bekommt, entscheidet seine aktive Gruppe: Der
Payload enthält immer den Timetable **des Gruppen-Festivals**.

Festivals ohne importiertes Lineup (`slots: []`, z. B. Summer Breeze
vor dem Import) sind trotzdem gründbar – die App zeigt „Lineup folgt",
der Import füllt später. `GET /api/festivals` liefert dafür das Flag
`hasLineup`.

## Woher kommen die Daten?

- **Wacken:** offizieller W:O:A-Datenexport (`wackenlineup.json`),
  inklusive Spotify-Artist-IDs für den „Auf Spotify anhören"-Button.
- **Fallback:** Scraper (`npm run scrape`) mit mehreren Strategien
  (JSON-LD, eingebettete JSON-Blobs, referenzierte API-URLs, zuletzt
  der Clashfinder-Export).
- **Andere Festivals:** jede Datei im App-Timetable-Format über
  `scripts/import-festival.mjs`.
