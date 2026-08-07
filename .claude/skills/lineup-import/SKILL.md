---
name: lineup-import
description: Lineup bzw. Running Order eines Festivals in Festival-Buddy einspielen – Importdatei im App-Timetable-Format bauen, prüfen und in die Datenbank importieren. Nutze diesen Skill immer, wenn es um Lineups, Running Order, Timetable, Spielzeiten, Bühnen oder Festivaltage geht: neues Festival anlegen, Lineup nachtragen oder aktualisieren, Spielzeiten korrigieren, Daten von einem Plakat, einer Website, einem PDF oder Clashfinder übernehmen, eine Datei in data/ bauen oder `npm run import:db` laufen lassen. Auch dann verwenden, wenn jemand nur eine Bandliste mit Uhrzeiten schickt und sinngemäß "spiel das ein" oder "kannst du das ins Festival-Buddy übernehmen" sagt, ohne Import oder Timetable ausdrücklich zu nennen.
---

# Lineup importieren

Ziel ist immer dasselbe Endergebnis: eine Datei im App-Timetable-Format
unter `data/<festivalId>.json`, die anschließend per
`scripts/import-festival.mjs` in die Tabelle `festivals` wandert. Ein
Import ersetzt **den kompletten Timetable eines Festivals** – ein
Redeploy ist nicht nötig, die Clients ziehen den neuen Stand beim
nächsten Poll.

## Warum hier Sorgfalt zählt

An jeder Slot-ID hängen die Eintragungen der Crews (`going`/
`interested`) und ihre Positionsmarker. Verschwindet eine ID beim
Re-Import, verlieren echte Leute stillschweigend ihre Planung – niemand
bekommt eine Fehlermeldung, die Band ist einfach nicht mehr angehakt.
Deshalb sind Slot-IDs ein Vertrag: `tag-buehne-bandslug`, stabil über
alle Re-Importe hinweg. Genau darauf zielt der Ablauf unten ab, und
genau das prüft der Validator, bevor irgendetwas in die DB geht.

## Der Ablauf

### 1. Zielfestival klären

Frage (oder leite aus dem Kontext ab): Welche `festivalId`? Bestehende
stehen in der DB bzw. als Seed in `src/lib/db.ts` – z. B. `woa2026`,
`sb2026`, `psoa2026`. Ein neues Festival braucht nur eine neue ID
(Kleinbuchstaben/Ziffern/Bindestrich, z. B. `pellmell2026`); der Import
legt die Zeile an, wenn sie fehlt.

Klär außerdem, ob es ein **Erstimport** ist oder ein **Update** eines
Lineups, das schon live ist. Beim Update ist Schritt 4 Pflicht, nicht
Kür – dort zeigt sich, ob Eintragungen verloren gingen.

### 2. Running Order als Textdatei erfassen

Schreibe die Running Order in `lineups/<festivalId>.txt`. Das ist ein
kompaktes Zeilenformat, das direkt vom Plakat abtippbar und später gut
diffbar ist – die Datei gehört mit ins Repo, sie ist die lesbare Quelle
hinter dem generierten JSON:

```
festival: Pell-Mell Festival 2026
edition: 04.–06.09.2026 · Hillesheim
dataVersion: 2026-07-16 (Running Order laut Plakat)

stage: sparkasse | Sparkasse-Bitburger Stage | SBS | #f77f00
stage: moonshine | Moonshine Stage | MOON | #2a9d8f

day: fri | 2026-09-04
day: sat | 2026-09-05

[fri/sparkasse]
14:45-15:30 Palebloom
16:00-16:45 Never Back Down
23:15-00:30 Raised Fist

[fri/moonshine]
18:10-18:55 Treptow
```

Die vollständige Feldreferenz samt Optionen (`unbestaetigt`,
`spotify=`, `id=`) steht in `references/format.md`. Lies sie, sobald ein
Fall auftaucht, der über die einfachen Zeilen hinausgeht.

Zur Quelle je nach Material:

- **Plakat/Screenshot/Foto**: Bild lesen und abtippen. Zeiten und
  Bühnenzuordnung sind das, was schiefgeht – lieber einmal mehr
  hinschauen. Ist eine Endzeit nicht angegeben, frag nach oder leite sie
  aus dem Beginn des nächsten Sets ab und sag dazu, dass du das getan
  hast.
- **Website/PDF**: Inhalt holen und übertragen. Falls es für dieses
  Festival schon einen Parser gibt (`scripts/scrape-wacken.mjs`), nutze
  lieber den.
- **Wacken**: nicht abtippen. Für den offiziellen Export gibt es
  `npm run import` (`wackenlineup.json` → `data/timetable.json`), danach
  weiter bei Schritt 4.
- **Nur eine Bandliste ohne Zeiten**: dann entsteht ein Gerüst (Tage und
  Bühnen, `slots: []`). Das ist ein legitimer Zwischenstand – die App
  zeigt „Lineup folgt", Gruppen lassen sich trotzdem gründen.

### 3. Importdatei bauen

```bash
node scripts/build-timetable.mjs lineups/<festivalId>.txt --festival <festivalId>
```

Das erzeugt `data/<festivalId>.json` und vergibt die Slot-IDs nach der
Konvention – derselbe `slugify`-Algorithmus wie in `src/lib/db.ts`,
damit Import und Veranstalter-Editor dieselben IDs treffen. Schreib die
JSON-Datei nicht von Hand; die IDs von Hand zu vergeben ist genau die
Stelle, an der Eintragungen verloren gehen.

### 4. Prüfen – der wichtigste Schritt

```bash
# Erstimport
node scripts/validate-timetable.mjs data/<festivalId>.json

# Update eines Lineups, das schon live ist
DATABASE_URL=... node scripts/validate-timetable.mjs data/<festivalId>.json --festival <festivalId>
```

Der Validator spiegelt die Regeln aus `upsertDay`/`upsertStage`/
`upsertSlot` und vergleicht mit dem bisherigen Stand. Fehler (`✗`)
blockieren den Import. Warnungen (`⚠`) sind Hinweise, die du **lesen und
einordnen** musst, statt sie durchzuwinken:

- **„N Slot-IDs verschwinden"** – die zentrale Warnung. Ist die Band
  wirklich aus dem Lineup geflogen? Dann ist das korrekt. Spielt sie
  weiter und nur die Schreibweise, der Tag oder die Bühne hat sich
  geändert, gehört die alte ID per `id=` in der Textdatei erhalten
  (siehe `references/format.md`), sonst verlieren die Crews ihre
  Eintragung.
- **Überschneidungen auf einer Bühne** – meist ein Tippfehler bei den
  Zeiten, gelegentlich echt (Umbau, Aftershow).
- **Ungewöhnliche Spielzeiten** (unter 10 Min., über 4 Std.) – fast
  immer ein vertauschtes Zeitpaar.

Berichte dem Nutzer, was der Vergleich sagt: wie viele Slots neu,
entfallen und verschoben sind. Bei entfallenen IDs hol dir eine
Bestätigung, bevor du importierst – das ist der Punkt, an dem Daten
anderer Leute verloren gehen.

### 5. Importieren

```bash
DATABASE_URL=... npm run import:db -- --festival <festivalId> data/<festivalId>.json
```

Das Script macht ein UPSERT auf die `festivals`-Zeile und erhöht
`db_rev`, damit die Clients den neuen Stand ziehen. Ohne
`DATABASE_URL` läuft nichts – wenn sie nicht gesetzt ist, brich ab und
sag Bescheid, statt zu raten. Alles bis Schritt 4 lässt sich ohne
Datenbank erledigen; du kannst die Datei also fertig und geprüft
übergeben, damit jemand mit Zugang sie einspielt.

Danach: `lineups/<festivalId>.txt` und `data/<festivalId>.json`
committen, damit der nächste Import auf demselben Stand aufsetzt.

## Regeln, die man im Kopf haben muss

- **Sets nach Mitternacht gehören zum Vortag.** Ein Set um 01:00 Uhr
  nachts steht beim Freitag, nicht beim Samstag. Notation: `01:00` oder
  `25:00` – beides funktioniert, weil `toMinutes()` Stunden vor 08:00 dem
  Vortag zurechnet. Folge daraus: Es gibt **keine Slots vor 08:00
  morgens**; wer 07:00 schreibt, meint 31:00 Uhr.
- **`confirmed: false`** heißt „Zeit steht noch nicht fest", nicht
  „Band ist unsicher". Für Slots, die im Plakat als TBA markiert sind.
- **Bühnenfarben** unterscheiden die Spalten im Timetable-Grid. Nimm
  kräftige, gut unterscheidbare Hex-Werte; orientiere dich an
  `data/partysan2026.json` oder den Wacken-Bühnen in
  `scripts/import-lineup.mjs`.
- **Grenzen**: 30 Tage, 40 Bühnen, 2000 Slots, Bandname ≤ 80 Zeichen,
  Bühnenkürzel ≤ 5 Zeichen, Tages-Kurzlabel ≤ 8 Zeichen.

## Wann dieser Weg nicht der richtige ist

Für **einzelne Korrekturen** an einem Festival, das schon live ist –
eine Band verschiebt sich um eine halbe Stunde, ein Act fällt aus – ist
der Veranstalter-Editor unter `/veranstalter` der bessere Weg: Er hält
die IDs von selbst stabil, warnt vor dem Löschen mit der Zahl der
betroffenen Eintragungen und schickt den betroffenen Besuchern eine
Push-Nachricht über die Verschiebung. Ein Import ersetzt dagegen immer
den kompletten Timetable und schickt keine Benachrichtigungen. Wenn
jemand also eine kleine Änderung will, weise auf den Editor hin, statt
das ganze Lineup neu einzuspielen.
