# Formatreferenz

Zwei Formate sind im Spiel: die **Textdatei** in `lineups/`, die von
Hand gepflegt wird, und das **App-Timetable-JSON** in `data/`, das
daraus entsteht und importiert wird.

- [Textformat für `lineups/*.txt`](#textformat)
- [App-Timetable-Format (`data/*.json`)](#app-timetable-format)
- [Wiederkehrende Fälle](#wiederkehrende-fälle)

## Textformat

Eingelesen von `scripts/build-timetable.mjs`. Zeilen mit `#` am Anfang
sind Kommentare, Leerzeilen egal. Kommentare gehen nur am Zeilenanfang –
mitten in der Zeile wäre `#` nicht von einer Bühnenfarbe zu
unterscheiden.

### Kopfzeilen

| Zeile | Pflicht | Bedeutung |
| --- | --- | --- |
| `festival: <Name>` | ja | Anzeigename, z. B. `Party.San Metal Open Air 2026` |
| `edition: <Text>` | ja | Untertitel: Datum, Ort, Jubiläum |
| `dataVersion: <Text>` | nein | Woher der Stand kommt, z. B. `2026-08-03 (offizielle Running Order laut Plakat)` – die App zeigt das an |

### Bühnen und Tage

```
stage: <id> | <Name> | <Kürzel> | <#farbe>
day:   <id> | <JJJJ-MM-TT> [| <Kurz> | <Lang>]
```

- Bühnen-`id` und Tages-`id` sind Teil jeder Slot-ID – einmal gewählt,
  bleiben sie. Kurze Slugs verwenden: `main`, `tent`, `moonshine`;
  `fri`, `sat`, `thu`.
- Die Reihenfolge der `stage:`-Zeilen ist die Spaltenreihenfolge im
  Timetable-Grid.
- Labels beim Tag sind optional; ohne Angabe entstehen die deutschen
  Wochentage aus dem Datum (`Fr` / `Freitag`).
- Bei mehrtägigen Festivals mit zwei gleichen Wochentagen (selten,
  z. B. zwei Samstagen) die Labels explizit setzen.

### Slots

Ein Abschnitt `[tagId/buehnenId]`, darunter eine Zeile pro Set:

```
[fri/sparkasse]
14:45-15:30 Palebloom
23:15-00:30 Raised Fist
```

Optionen hinter dem Bandnamen, mit `|` getrennt:

| Option | Wirkung |
| --- | --- |
| `unbestaetigt` (auch `tba`) | `confirmed: false` – Zeit steht noch nicht fest |
| `spotify=<id>` | Spotify-Artist-ID für den „Auf Spotify anhören"-Button; nur die ID, nicht die URL. Meist nicht von Hand nötig – `npm run lineup:spotify -- lineups/<id>.txt` trägt sie nach |
| `id=<slotId>` | Erzwingt eine bestimmte Slot-ID statt der generierten – für umbenannte Bands, siehe unten |

```
19:00-20:00 Special Guest | unbestaetigt
21:10-22:10 Itchy | spotify=1a2b3c4d5e6f7g8h9i0j1k
18:00-19:00 Neuer Bandname | id=fri-sparkasse-alter-bandname
```

Reihenfolge und Sortierung in der Textdatei sind egal – das Script
sortiert nach Tag, Bühne und Beginn.

### Announcte Bands ohne Spielzeit

Ein Abschnitt `[announced]`, darunter eine Zeile pro Band – nur der
Name, optional mit `spotify=`:

```
[announced]
Amon Amarth | spotify=6vg9BW5gHSjidGbypXQku2
Sabaton
Heaven Shall Burn
```

Das ist der Normalfall im Winter: Das Festival hat announced, die
Running Order kommt erst kurz vorher. Diese Bands landen im Feld
`bands` der Importdatei und füllen in der App die **Lineup-Ansicht**
(durchhören, merken, sehen wer aus der Crew mitwill) – ganz ohne
Timetable.

`unbestaetigt` und `id=` gibt es hier nicht: Ohne Spielzeit ist nichts
zu bestätigen, und die Kennung entsteht aus dem Namen (siehe unten).

Sobald eine Band ihre Spielzeit bekommt, wandert sie in den
`[tag/buehne]`-Abschnitt und wird aus `[announced]` gelöscht – ihr Slug
bleibt derselbe, gemerkte Bands gehen also nicht verloren. Stehenlassen
schadet auch nicht (das Script führt beide Quellen zusammen), doppelt
gepflegt heißt aber doppelte Arbeit bei jeder Korrektur.

## App-Timetable-Format

Das ist das Format, das `scripts/import-festival.mjs` erwartet und das
in der Spalte `festivals.timetable` (JSONB) landet. Die Typen stehen in
`src/lib/types.ts`, die Validierung in `src/lib/db.ts`.

```json
{
  "festival": "Pell-Mell Festival 2026",
  "edition": "04.–06.09.2026 · Hillesheim",
  "dataVersion": "2026-07-16 (Running Order laut Plakat)",
  "days": [
    { "id": "fri", "label": "Fr", "longLabel": "Freitag", "date": "2026-09-04" }
  ],
  "stages": [
    { "id": "sparkasse", "name": "Sparkasse-Bitburger Stage", "short": "SBS", "color": "#f77f00" }
  ],
  "bands": [
    { "slug": "palebloom", "name": "Palebloom", "spotifyArtistId": "1a2b3c4d5e6f7g8h9i0j1k" }
  ],
  "slots": [
    {
      "id": "fri-sparkasse-palebloom",
      "dayId": "fri",
      "stageId": "sparkasse",
      "band": "Palebloom",
      "start": "14:45",
      "end": "15:30",
      "confirmed": true,
      "spotifyArtistId": "1a2b3c4d5e6f7g8h9i0j1k"
    }
  ]
}
```

Regeln, die der Server durchsetzt (und `validate-timetable.mjs`
vorwegnimmt):

| Feld | Regel |
| --- | --- |
| `days[].label` | 1–8 Zeichen |
| `days[].longLabel` | 1–20 Zeichen |
| `days[].date` | `JJJJ-MM-TT`, gültiges Datum, pro Festival eindeutig |
| `stages[].name` | 1–40 Zeichen |
| `stages[].short` | 1–5 Zeichen |
| `stages[].color` | `#rrggbb` |
| `slots[].band` | 1–80 Zeichen |
| `slots[].start`/`end` | `HH:MM`, Stunde ≤ 31, Ende nach Beginn |
| `slots[].dayId`/`stageId` | müssen auf vorhandene Einträge zeigen |
| `slots[].confirmed` | Pflichtfeld, boolean |
| `slots[].spotifyArtistId` | optional, `[A-Za-z0-9]{1,40}` |
| `bands[].name` | 1–80 Zeichen |
| `bands[].slug` | `slugify(name)`, pro Festival eindeutig |
| `bands[].spotifyArtistId` | optional, `[A-Za-z0-9]{1,40}` |
| Mengen | ≤ 30 Tage, ≤ 40 Bühnen, ≤ 2000 Slots, ≤ 2000 Bands |

Slot-IDs entstehen als `${dayId}-${stageId}-${slugify(band)}`; bei
Kollision hängt `uniqueId()` `-2`, `-3` an. `slugify` bildet Umlaute auf
`ae/oe/ue/ss` ab, entfernt Akzente und ersetzt alles Übrige durch
Bindestriche.

`bands[].slug` ist genau dasselbe `slugify(band)` – der letzte Teil der
Slot-ID. Das ist die Klammer zwischen beiden Listen: Über ihn findet die
App zu einer gemerkten Band ihre Spielzeiten, und deshalb überlebt eine
Merkung den Timetable-Import. `bands` enthält alle Bands des Festivals,
die announcten wie die aus dem Timetable; `build-timetable.mjs` führt
beides zusammen.

## Wiederkehrende Fälle

**Band wird umbenannt, spielt aber denselben Slot.** Neuer Name, alte
ID behalten – sonst verlieren alle Eingetragenen den Slot:

```
20:00-21:00 Neuer Name | id=fri-main-alter-name
```

**Zwei Sets derselben Band am selben Tag auf derselben Bühne.** Die
zweite ID bekommt automatisch `-2`. Das ist stabil, solange die
Reihenfolge nach Uhrzeit gleich bleibt – das Script vergibt die IDs
bewusst erst nach dem Sortieren.

**Aftershow, Lesung, Signierstunde.** Ganz normale Slots. Wenn der
Zusatz in den Bandnamen soll (`Damn It! (Aftershow)`), landet er auch im
Slug – bei einem späteren Umbenennen also wieder `id=` verwenden.

**Festival ohne Zeiten („Lineup folgt").** Tage anlegen, keine
Slot-Abschnitte. Ergebnis ist ein Gerüst mit `slots: []`; `GET
/api/festivals` meldet `hasLineup: false`, Gruppen lassen sich trotzdem
gründen. Ob das eine leere Hülle ist oder schon etwas taugt, entscheidet
der `[announced]`-Block: Mit Bands zeigt die App die Lineup-Ansicht und
bei der Gruppengründung „· 30 Bands announced", ohne bleibt es bei
„Lineup folgt". Wenn also überhaupt Bands bekannt sind, gehören sie in
die Datei – das ist der Unterschied zwischen einem Festival, das man
schon planen kann, und einem Namen ohne Inhalt.

**Band wird announced, spielt aber erst später.** Zeile in
`[announced]` anhängen, `npm run lineup` laufen lassen, importieren. Der
Diff der Bandliste sagt gleich, welche Bands neu dazugekommen sind –
Material für eine Mitteilung an die Crews.

**Band fällt ersatzlos aus.** Zeile löschen. Der Validator meldet die
verschwundene ID – das ist hier die richtige Antwort, nicht der Fehler.
Wenn viele Leute eingetragen waren, ist das Löschen aber eine Nachricht
wert; der Veranstalter-Editor kann so etwas per Push begleiten, der
Import nicht.

**Band ist nicht auf Spotify zu finden.** Tribute-Projekte
(`Schirenc plays Pungent Stench`), Lesungen, DJ-Sets und lokale
Newcomer haben oft kein Artist-Profil oder heißen dort anders. Das
Anreicherungs-Script übernimmt nur exakte Namenstreffer und listet den
Rest mit Suchlink auf – wer sich dort doch findet, bekommt die ID aus
der URL (`open.spotify.com/artist/<ID>`) von Hand als `spotify=`
eingetragen. Der Rest bleibt ohne Button, und das ist in Ordnung.

**Ganze Bühne umbenannt.** Nur `name`/`short` in der `stage:`-Zeile
ändern, die `id` unangetastet lassen – sonst ändern sich alle Slot-IDs
dieser Bühne auf einen Schlag. (Im Veranstalter-Editor zieht ein
Umbenennen zusätzlich die Beschriftung des Blueprints mit; beim Import
passiert das nicht.)
