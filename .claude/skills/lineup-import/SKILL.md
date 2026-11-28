---
name: lineup-import
description: Lineup bzw. Running Order eines Festivals in Festival-Buddy einspielen – Importdatei im App-Timetable-Format bauen, prüfen und in die Datenbank importieren. Nutze diesen Skill immer, wenn es um Lineups, Running Order, Timetable, Spielzeiten, Bühnen oder Festivaltage geht: neues Festival anlegen, Lineup nachtragen oder aktualisieren, angekündigte Bands ohne Spielzeit einpflegen, Spielzeiten korrigieren, Daten von einem Plakat, einer Website, einem PDF oder Clashfinder übernehmen, eine Datei in data/ bauen oder `npm run import:db` laufen lassen. Auch dann verwenden, wenn jemand nur eine Bandliste schickt – mit oder ohne Uhrzeiten – und sinngemäß "spiel das ein" oder "kannst du das ins Festival-Buddy übernehmen" sagt, ohne Import oder Timetable ausdrücklich zu nennen.
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

Dasselbe gilt für den **Band-Slug** (`bands[].slug`, der letzte Teil
jeder Slot-ID): Daran hängen die gemerkten Bands aus der
Lineup-Ansicht. Eine geänderte Schreibweise ist ein neuer Slug – und
damit sind die Merkungen weg.

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
- **Nur eine Bandliste ohne Zeiten**: der Normalfall im Winter, wenn ein
  Festival announced hat und die Running Order noch fehlt. Die Bands
  gehören in einen `[announced]`-Abschnitt (nur Namen, eine pro Zeile);
  dazu die Tage, sobald die Termine feststehen. Ergebnis ist eine Datei
  mit `slots: []`, aber gefülltem `bands` – die App zeigt dann die
  Lineup-Ansicht: durchhören, merken, sehen wer aus der Crew mitwill.
  Ohne `[announced]` bliebe es ein leeres Gerüst mit „Lineup folgt",
  also: Wenn Bands bekannt sind, gehören sie rein.

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

**Zur Spotify-Suche.** Ohne `spotifyArtistId` fehlt der „Auf Spotify
anhören"-Button – der Normalfall, sobald ein Lineup von Hand gepflegt
wird. Bei angekündigten Bands wiegt das schwerer als beim fertigen
Timetable: Reinhören ist dort die einzige Funktion, die die Band
überhaupt hat. Die Zugangsdaten (`SPOTIFY_CLIENT_ID`,
`SPOTIFY_CLIENT_SECRET`) kommen aus `.env.local`; fehlen sie, wird der
Schritt übersprungen und der Rest läuft weiter.

Spotify liefert zu einem Künstler nur noch Name und ID – keine Follower,
keine Genres, keine Popularität. Das Script kann den „bekannteren" von
zwei Namensvettern also nicht mehr erkennen und rät auch nicht.
Übernommen wird nur, wer exakt so heißt wie die Band **und** unter den
ersten 20 Suchergebnissen der einzige gleichnamige Künstler mit
Veröffentlichungen ist (leere Profile zählen nicht). Der einzige Kontext,
den es noch gibt, sind Alben und Singles – sie stehen im Bericht, und
der will gelesen werden:

- **Zugeordnet** – zu jeder neuen ID die jüngsten Titel mit Jahr. Der
  einzige Namensvetter ist nicht zwingend die gemeinte Band: Für die
  Thrash-Band „Victim" lieferte die Suche vorn nur ein anderes „victim".
  Passen Titel und Jahre nicht zur Band (falsches Genre, seit 20 Jahren
  nichts erschienen, nur eine Single), ersetz die ID durch die richtige
  oder durch `spotify=-`. Nur löschen hilft nicht – der nächste Lauf
  trüge sie wieder ein.
- **Mehrere gleichnamige Künstler** – „Emperor", „Invasion", „Europe"
  gibt es mehrfach. Hier wird **nichts** übernommen; der Bericht nennt
  die Kandidaten mit ID und Alben. Entscheide anhand der Alben und der
  Festival-Seite (Bandinfo, verlinktes Spotify-Profil) und trag die ID
  von Hand ein: `| spotify=<ID>`. Die Reihenfolge der Kandidaten ist die
  der Spotify-Suche und sagt nichts – in einer Stichprobe war der erste
  Treffer bei Namensgleichheit in jedem fünften Fall der falsche. Passt
  keiner sicher: `| spotify=-`.
- **Ohne Treffer** – Tribute-Projekte, Lesungen, DJ-Sets und lokale
  Bands sind oft nicht auf Spotify oder anders geschrieben; Bands mit
  Allerweltsnamen stehen manchmal erst weit hinten („Seth" an Stelle 31)
  und finden sich über den Suchlink im Bericht. Wer sich findet, bekommt
  seine ID von Hand, wer nicht, `| spotify=-`. Das ist kein Fehler.
- **Nicht geprüft** – eine Abfrage ist gescheitert, das Budget des Laufs
  war aufgebraucht oder Spotify hat gesperrt. Diese Bands sind weder
  gefunden noch ausgeschlossen; ein späterer Lauf holt sie nach.

`| spotify=-` heißt „bewusst ohne Button": Die Band wird nicht mehr
gesucht, auch nicht mit `--force`. Setz es, sobald entschieden ist, dass
es keinen passenden Künstler gibt – sonst fragt jeder weitere Lauf
Spotify erneut nach derselben Band. Nach Korrekturen von Hand reicht
`npm run lineup -- lineups/<id>.txt --festival <id> --no-spotify`: Das
baut und prüft, ohne noch einmal zu suchen.

**Das Spotify-Kontingent ist knapp.** Die App läuft im Development Mode
mit einem Kontingent pro Entwicklerkonto, dessen Größe Spotify nicht
nennt; am 28.11.2026 haben rund 500 Abfragen in einer Viertelstunde für
eine Sperre von knapp 24 Stunden gereicht (HTTP 429, `QUOTA_EXCEEDED`).
In der Zeit bekommt auch der tägliche Lineup-Watch-Lauf keine IDs. Eine
Band kostet etwa drei bis vier Abfragen; das Script beginnt deshalb nach
250 Abfragen keine weitere Band mehr und meldet den Rest als „nicht
geprüft". Ein großes Lineup braucht also zwei Läufe an zwei Tagen (oder
einmalig `npm run lineup:spotify -- lineups/<id>.txt --budget 400` vor
der Strecke). Ruf die Spotify-API nicht in eigenen Schleifen ab, lass
die Suche nicht „zum Testen" mehrfach laufen und geh mit `--force` und
`--pages` sparsam um.

**Zur Prüfung.** Fehler (`✗`) brechen die Strecke ab, die Datei geht
nicht in die DB. Warnungen (`⚠`) musst du **lesen und einordnen**:

- **„N Bands verschwinden aus dem Lineup"** – dieselbe Frage wie unten,
  eine Ebene höher: abgesagt (dann korrekt) oder nur anders
  geschrieben (dann gehen Merkungen verloren)?
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

**Erstimport ohne Datenbank-Zugang.** Für ein Festival, das es in der
App noch nicht gibt, braucht es die `DATABASE_URL` nicht:

```bash
npm run festival:create -- --festival <festivalId> --dry-run
npm run festival:create -- --festival <festivalId>
```

Das schickt dieselbe Importdatei per HTTPS an die Betreiber-API der App
(Secret wie bei `lineup:announce`) – der Weg für Cloud-Sessions. Er legt
ausschließlich neu an: Existiert die ID schon, antwortet die App mit 409
und ändert nichts. Ein **Update** eines bestehenden Festivals bleibt
deshalb beim Import oben, mit dem Vergleich aus Schritt 3 davor – genau
dort können Eintragungen verloren gehen, und genau dort soll ein Mensch
hinschauen. Die App prüft die Datei beim Anlegen noch einmal selbst und
ist dabei strenger als der Validator: Warnungen gibt es nicht, nur
angenommen oder abgelehnt. Mindestens ein Festivaltag muss drinstehen;
ein ganz leeres Gerüst ohne Tage (für Veranstalter, die alles selbst im
Editor aufbauen) nimmt nur der Import oben.

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
