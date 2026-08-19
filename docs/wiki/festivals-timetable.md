# Festivals & Timetable

Die Timetables liegen **pro Festival in der Datenbank** (Tabelle
`festivals`, Spalte `timetable` als JSONB mit
`days`/`stages`/`slots`/`bands`).
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

Dieselbe Regel gilt im [Veranstalter-Editor](veranstalter.md), dem
zweiten Schreibpfad neben dem Import: IDs werden nur beim **Anlegen**
generiert (`slugify` + `-2`-Suffix bei Kollision) und ändern sich bei
Edits nie – erst echtes Löschen entfernt die daran hängenden
Teilnahmen/Positionen (in derselben Transaktion, mit Warn-Dialog im
Editor).

## Der Band-Pool: Lineup vor dem Timetable

Festivals announcen ihre ersten Bands Monate vor der Running Order.
Deshalb gibt es neben den Slots eine zweite Liste im selben JSONB-Block:
`bands` – Einträge aus `slug`, `name` und optional `spotifyArtistId`.
Sie füllt die **Lineup-Ansicht** in der App, in der man Bands durchhören
und sich merken kann, lange bevor es einen Timetable gibt.

Der `slug` ist derselbe, den `slugify()` ans Ende jeder Slot-ID setzt
(`bandSlug()` in `src/lib/types.ts`, von `db.ts` und den Import-Scripts
gemeinsam benutzt). Das ist Absicht und die zweite wichtige Vertragsregel
neben den Slot-IDs:

- Merkungen liegen in `band_interests (user_id, festival_id, band_slug)`
  und hängen damit **nicht** am Timetable. Sie überleben den Import der
  Running Order, bei dem alle Slot-IDs überhaupt erst entstehen.
- Über den gemeinsamen Slug findet die Lineup-Ansicht später die Slots
  ihrer Bands (`slotsForBand()`), zeigt die Spielzeiten an und führt ins
  normale Band-Sheet, wo die verbindliche Zusage passiert.
- Ändert sich die **Schreibweise** einer Band, ändert sich ihr Slug –
  dann ist die Merkung weg. `validate-timetable.mjs` warnt beim
  Vergleich mit dem Live-Stand, welche Bands aus dem Pool verschwinden.

`getTimetable()` mischt beim Lesen jede Band, die nur im Timetable steht,
in den Pool (`mergeBands`). So taucht auch ein Slot, den ein
Veranstalter frisch im Editor angelegt hat, sofort in der Lineup-Ansicht
auf – und alte Importe ohne `bands`-Feld funktionieren unverändert.

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

Festivals ohne importierten Timetable (`slots: []`) sind trotzdem
gründbar. Was die App dann zeigt, hängt am Band-Pool:

- `bands` gefüllt → die **Lineup-Ansicht** ist der einzige Tab; Grid und
  „Unsere Bands" wären ohne Slots leer.
- `bands` leer → wie bisher „Lineup folgt".

`GET /api/festivals` liefert dafür `hasLineup` (gibt es Slots?) und
`bandCount` (wie viele Bands stehen im Pool?). Bei der Gruppengründung
steht damit „· 30 Bands announced" statt „· Lineup folgt".

## Woher kommen die Daten?

- **Wacken:** offizieller W:O:A-Datenexport (`wackenlineup.json`),
  inklusive Spotify-Artist-IDs für den „Auf Spotify anhören"-Button.
- **Fallback:** Scraper (`npm run scrape`) mit mehreren Strategien
  (JSON-LD, eingebettete JSON-Blobs, referenzierte API-URLs, zuletzt
  der Clashfinder-Export).
- **Nur angekündigte Bands:** ein `[announced]`-Abschnitt in der
  Running-Order-Textdatei, eine Band pro Zeile. `npm run lineup` sucht
  auch für diese Zeilen die Spotify-IDs und schreibt sie in `bands`.
- **Andere Festivals:** jede Datei im App-Timetable-Format über
  `scripts/import-festival.mjs`. Ohne Export wird die Running Order als
  Textdatei unter `lineups/` gepflegt und mit
  `scripts/build-timetable.mjs` in die Importdatei übersetzt – das
  Script vergibt die Slot-IDs nach derselben `slugify`-Regel wie der
  Editor, `scripts/validate-timetable.mjs` prüft die Datei vorab und
  zeigt beim Re-Import, welche IDs entfallen (und damit welche
  Eintragungen verloren gingen). Der komplette Ablauf liegt als Skill
  unter `.claude/skills/lineup-import/`.
