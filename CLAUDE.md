# Festival Buddy – Hinweise für Claude-Sessions

Timetable-Planer für Festival-Crews: Next.js (App Router), PostgreSQL,
Web Push. Produktion läuft auf Coolify unter `https://festivalbuddy.app`.
Setup und Befehle stehen in der [README](README.md), das Verhalten der
einzelnen Funktionen im [Wiki](docs/wiki/README.md). Im Repo wird Deutsch
geschrieben – Kommentare, Commit-Messages, Doku.

## Lineups und Bands: welcher Weg wofür

Fast jede Bitte rund um Bands fällt in eine dieser Zeilen. Lies den
genannten Skill, bevor du loslegst – dort steht, was schiefgehen kann.

| Anliegen | Weg |
| --- | --- |
| „Trag diese Bands nach", Festival hat noch **keine** Running Order | Lineup-Ergänzung, siehe unten |
| „Schau, ob Festival X neue Bands announced hat" | Skill `lineup-watch` |
| Angekündigte Band heißt jetzt anders („benenn X um in Y") | `npm run lineup:rename`, siehe unten |
| Festival soll automatisch beobachtet werden (oder nicht mehr) | Watchlist, siehe unten |
| Neues Festival anlegen (mit oder ohne Running Order) | Skill `lineup-import`, dann `npm run festival:create` – siehe unten |
| Running Order für ein Festival einspielen, das es **schon gibt** | Skill `lineup-import` (Voll-Import, braucht `DATABASE_URL`) |
| Einzelne Zeit oder Bühne bei einem Festival ändern, das live ist | Veranstalter-Editor unter `/veranstalter`, kein Import |

### Neue Bands nachtragen

Für Festivals ohne Running Order – der Normalfall zwischen Ankündigung
und Timetable. Vier Schritte, alle ohne Datenbank-Zugang:

```bash
npm run lineup:add -- lineups/<id>.txt "Band A" "Band B"   # hängt nur wirklich Neues an [announced] an
npm run lineup -- lineups/<id>.txt --festival <id>         # Spotify-IDs, data/<id>.json bauen, prüfen
npm run lineup:announce -- --festival <id> --dry-run       # zeigt, was die App als neu einpflegen würde
npm run lineup:announce -- --festival <id>                 # pflegt ein + Mitteilung + Push
```

- **Der letzte Schritt schickt eine Push-Nachricht an alle Mitglieder
  aller Gruppen dieses Festivals** und lässt sich nicht zurückholen.
  Zeig vorher das Ergebnis des Probelaufs und hol dir ein Okay – außer
  es wurde ausdrücklich gesagt, dass es rausgehen soll. Mit `--no-push`
  wird still eingepflegt.
- Lies den Bericht von `lineup:add`: `=` (andere Schreibweise) und `?`
  (verdächtig ähnlich) werden bewusst nicht übernommen. Details im
  Skill `lineup-watch`.
- Danach `lineups/<id>.txt` und `data/<id>.json` committen.
- Hat das Festival schon eine Running Order, lehnt die App ab (409).
  Dann ist `lineup-import` bzw. der Editor zuständig.

### Angekündigte Band umbenennen

Die Quelle führt eine Band unter neuem Namen – die Lineup-Watch meldet
das als „verdächtig ähnlich" und fasst es nicht an. Entscheidet der
Betreiber, dass umbenannt wird:

```bash
npm run lineup:rename -- lineups/<id>.txt --festival <id> "Alter Name" "Neuer Name" --dry-run
npm run lineup:rename -- lineups/<id>.txt --festival <id> "Alter Name" "Neuer Name"
npm run lineup -- lineups/<id>.txt --festival <id>     # Importdatei neu bauen, dann committen
```

- Nie den Namen einfach in der Textdatei ändern: Das ergäbe einen neuen
  Slug, und wer die Band gemerkt hat, verlöre die Merkung. Das Script
  benennt zuerst in der App um – dort ziehen die Merkungen mit – und
  passt danach die Datei an.
- Es geht keine Mitteilung raus. Der Probelauf nennt, wie viele
  Merkungen betroffen sind.
- Die App merkt sich den alten Namen als Verweis. Bis die geänderte
  Textdatei in `main` ist, wertet sie ihn deshalb nicht als neue Band,
  und `lineup:announce --status` zeigt ihn als „in der App umbenannt".
  Trotzdem zeitnah committen und nach `main` bringen.
- Nur für Bands ohne Spielzeit und nur auf ausdrückliche Ansage: Ob es
  dieselbe Band unter neuem Namen ist oder doch eine andere, entscheidet
  ein Mensch. Zwei bestehende Einträge zusammenlegen kann der Weg nicht.

### Neues Festival anlegen

Datei bauen wie im Skill `lineup-import` beschrieben, dann ohne
Datenbank-Zugang anlegen:

```bash
npm run lineup -- lineups/<id>.txt --festival <id>     # Spotify-IDs, data/<id>.json bauen, prüfen
npm run festival:create -- --festival <id> --dry-run   # prüft die App: gültig, ID noch frei?
npm run festival:create -- --festival <id>             # legt an
npm run festival:create -- --list                      # welche Festivals gibt es schon?
```

- Angelegt wird nur, was es noch nicht gibt. Bei einer bestehenden ID
  antwortet die App mit 409 und ändert nichts – ein Festival ersetzen
  kann dieser Weg nicht, und das ist Absicht.
- Mindestens ein Festivaltag muss feststehen. Ein ganz leeres Gerüst
  für einen Veranstalter, der alles selbst aufbaut (`"days": []`, siehe
  `docs/wiki/veranstalter.md`), geht weiter nur per `import:db` – dort
  braucht es die Datenbank ohnehin für den Veranstalter-Code.
- Ein neues Festival hat noch keine Gruppen, es geht keine Mitteilung
  raus. Trotzdem ist es sofort für alle sichtbar, die eine Gruppe
  gründen: Name, Termin und Bandliste vorher zeigen und ein Okay holen.
- Spotify-Treffer gegenprüfen, bevor etwas live geht (siehe Skill
  `lineup-import`): Die Suche nimmt bei gleichnamigen Künstlern den
  ersten Treffer.
- Danach `lineups/<id>.txt` und `data/<id>.json` committen – und das
  Festival bei Bedarf auf die Watchlist setzen.

### Watchlist

`lineups/watch.json` nennt die Festivals, die der tägliche Lauf
„Lineup-Watch Festival Buddy" (geplante Aufgabe im Claude-Konto, 19:12
Uhr Europe/Berlin) prüft. Ein Festival aufnehmen heißt:

1. Es muss in der App existieren (anlegen wie oben beschrieben).
2. Eintrag mit `id`, `lineup` und der offiziellen Quelle ergänzen. Ruf
   die Quelle einmal ab und halte in `notes` fest, wo die Bandliste
   steht – eine falsche URL fällt sonst erst im geplanten Lauf auf.
3. Der Host der Quelle muss in der Cloud-Umgebung `festival-buddy`
   freigegeben sein. Schlag die Freigabe vor, wenn sie fehlt.

Festivals mit Running Order und vergangene Festivals kommen raus.

## Regeln, die Daten echter Leute schützen

- **Schreibweisen nie „korrigieren".** Aus dem Bandnamen entsteht der
  Slug, an dem gemerkte Bands und Slot-Eintragungen der Nutzer hängen.
  Eine andere Schreibweise ist eine andere Band. Der Kopf jeder
  `lineups/*.txt` sagt, welche Schreibweise gilt.
- **Importdateien nie von Hand schreiben.** `data/<id>.json` entsteht
  immer aus `lineups/<id>.txt` über `npm run lineup`.
- **Kein Push zum Ausprobieren gegen Produktion.** Testen geht lokal:
  Postgres per `docker-compose.yml`, `LINEUP_API_URL` auf den lokalen
  Server.
- **Absagen entscheidet ein Mensch.** Verschwindet eine Band aus der
  Quelle, wird sie gemeldet, nicht gelöscht.

## Zugänge in Cloud-Sessions

Für dieses Repo ist die Cloud-Umgebung `festival-buddy` eingerichtet.
Läuft eine Session in einer anderen Umgebung, sind die Hosts unten
gesperrt – dann das sagen, statt drumherum zu arbeiten.

- Erreichbar sind die Festival-Seiten der Watchlist, Spotify und
  `festivalbuddy.app`. Die Secrets dafür (`LINEUP_API_SECRET`,
  Spotify) sind als Netzwerk-Secrets hinterlegt; der Proxy setzt sie
  ein. In den Variablen stehen höchstens Platzhalter – das ist richtig
  so, nicht nach den echten Werten suchen und nie im Chat danach fragen.
- Über die Betreiber-API der App (`/api/operator/*`) geht von hier
  aus: ein neues Festival anlegen (`festival:create`), neue Bands
  einpflegen (`lineup:announce`) und eine angekündigte Band umbenennen
  (`lineup:rename`). Mehr nicht – insbesondere nichts löschen.
- **Die Datenbank ist von hier aus nicht erreichbar.** Alles, was
  `DATABASE_URL` braucht (`import:db`, `organizer`, `push:broadcast`),
  läuft nur beim Betreiber – also auch jede Änderung an der Running
  Order eines bestehenden Festivals. Mach in dem Fall die Datei fertig,
  prüf sie und sag, welches Kommando noch auszuführen ist.

## Vor dem Commit

```bash
npm run typecheck
npm run build
```

Eine Testsuite gibt es nicht. Wer Verhalten ändert, zieht die passende
Wiki-Seite nach.
