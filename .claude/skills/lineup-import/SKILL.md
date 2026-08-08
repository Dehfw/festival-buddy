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
Lineups, das schon live ist. Beim Update zählt vor allem der
Vergleich mit dem Live-Stand in Schritt 3 – dort zeigt sich, ob
Eintragungen verloren gingen.

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
  `npm run import` (`wackenlineup.json` → `data/timetable.json`). Danach
  fehlen nur noch Spotify-Suche und Prüfung, beide nehmen die JSON-Datei
  direkt: `npm run lineup:spotify -- data/timetable.json` und
  `npm run lineup:check -- data/timetable.json --festival woa2026`.
- **Nur eine Bandliste ohne Zeiten**: dann entsteht ein Gerüst (Tage und
  Bühnen, `slots: []`). Das ist ein legitimer Zwischenstand – die App
  zeigt „Lineup folgt", Gruppen lassen sich trotzdem gründen.

### 3. Bauen, anreichern, prüfen

```bash
npm run lineup -- lineups/<festivalId>.txt --festival <festivalId>
```

Ein Kommando, drei Schritte: Spotify-IDs ergänzen → `data/<festivalId>.json`
bauen → die Datei prüfen. Sie hängen in dieser Reihenfolge zusammen, denn
die Spotify-Suche schreibt in die Textdatei und muss deshalb vor dem
Bauen laufen. Ruf die Einzelscripts (`lineup:spotify`, `lineup:build`,
`lineup:check`) nur auf, wenn du wirklich einen Schritt isoliert brauchst.

Schreib die JSON-Datei nie von Hand: Slot-IDs von Hand zu vergeben ist
genau die Stelle, an der Eintragungen verloren gehen. Das Script nutzt
denselben `slugify`-Algorithmus wie `src/lib/db.ts`, damit Import und
Veranstalter-Editor dieselben IDs treffen.

**Zur Spotify-Suche.** Ohne `spotifyArtistId` fehlt im Band-Sheet der
„Auf Spotify anhören"-Button – der Normalfall, sobald ein Lineup von
Hand gepflegt wird. Die Zugangsdaten (`SPOTIFY_CLIENT_ID`,
`SPOTIFY_CLIENT_SECRET`) kommen aus `.env.local`; fehlen sie, wird der
Schritt übersprungen und der Rest läuft weiter. Übernommen wird nur, was
exakt auf den Bandnamen passt, alles andere landet im Bericht. Zwei
Dinge daraus gehören angesehen:

- **Mehrere gleichnamige Künstler** – „Sacrifice", „Nirvana", „Sacred
  Reich" gibt es auf Spotify mehrfach. Das Script nimmt den mit den
  meisten Followern und nennt die Alternativen. Bei einer Nischenband
  auf einem Underground-Festival ist der bekannteste Treffer nicht
  automatisch der richtige.
- **Ohne Treffer** – Tribute-Projekte, Lesungen, DJ-Sets und lokale
  Bands sind oft nicht auf Spotify oder anders geschrieben. Der Bericht
  gibt zu jedem einen Suchlink; wer sich findet, bekommt seine ID von
  Hand nachgetragen (`| spotify=<ID>` in der Textdatei). Wer nicht,
  bleibt ohne Button – das ist kein Fehler.

**Zur Prüfung.** Fehler (`✗`) brechen die Strecke ab, die Datei geht
nicht in die DB. Warnungen (`⚠`) musst du **lesen und einordnen**:

- **„N Slot-IDs verschwinden"** – die zentrale Warnung; sie erscheint
  nur beim Vergleich mit dem Live-Stand (`DATABASE_URL` gesetzt). Ist
  die Band wirklich aus dem Lineup geflogen? Dann ist das korrekt.
  Spielt sie weiter und nur Schreibweise, Tag oder Bühne haben sich
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

### 4. Importieren

```bash
npm run import:db -- --festival <festivalId> data/<festivalId>.json
```

Das Script macht ein UPSERT auf die `festivals`-Zeile und erhöht
`db_rev`, damit die Clients den neuen Stand ziehen. Ohne
`DATABASE_URL` läuft nichts – wenn sie nicht gesetzt ist, brich ab und
sag Bescheid, statt zu raten. Alles bis Schritt 3 lässt sich ohne
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
