# 🤘 Festival Buddy

Timetable-Planer für Festival-Crews: Wer geht zu welcher Band – und wo
steht ihr im Publikum? Mandantenfähig über **Gruppen**: Nach dem Login
gründet man eine Gruppe (mit Festival-Auswahl, Name und Gruppenbild) oder
tritt per **Einladungscode** bei – als Link (`/join/<code>`) oder zum
Abtippen. Aktuell angelegte Festivals: **Wacken Open Air 2026** und
**Summer Breeze 2026** (Lineup folgt per Import).

Login per **Passkey** (Face ID / Fingerabdruck): Beim ersten Mal Namen
eintippen und Passkey anlegen, danach bietet das Gerät den Passkey beim
Öffnen von selbst an (WebAuthn Conditional UI). Der Name ist nur der
Anzeigename – die Identität hängt am Passkey. Kein Passwort, kein IdP.

## Features

- **Gruppen (Mandantenfähigkeit)** – jede Gruppe gehört zu einem Festival
  und sieht nur ihre eigenen Mitglieder, Auswahlen und Positionen. Ein
  mehrfach nutzbarer Einladungscode pro Gruppe (rotierbar durch den
  Owner), teilbar als Link oder manuell eintippbar. Owner können die
  Gruppe umbenennen, ein Gruppenbild setzen (clientseitig auf 512 px
  verkleinert, in der DB gespeichert), Mitglieder entfernen und die
  Feuerrahmen-Schwelle 🔥 einstellen (0 = aus). Verwaltet wird alles auf
  der Gruppen-Seite `/gruppe` (Tap aufs Profilbild oder den Gruppen-Chip
  im Header); dort wechselt man auch zwischen mehreren Gruppen.
- **Passkey-Login mit Autodiscovery** – kein Passwort: einmal registrieren,
  danach schlägt iPhone/Android den Passkey am Namensfeld automatisch vor
  (`@simplewebauthn`, discoverable Credentials). Alt-Accounts aus der
  Nur-Name-Ära werden bei der ersten Passkey-Registrierung mit gleichem
  Namen übernommen (Auswahlen bleiben erhalten; abschaltbar über
  `LEGACY_NAME_ADOPTION=off`, empfohlen sobald alle migriert sind).
  Passkeys syncen über iCloud-Schlüsselbund bzw. Google Passwortmanager;
  für ein fremdes Gerät gibt es beim Login den QR-Code-Flow.
- **Timetable-Grid** – alle 8 Bühnen nebeneinander (X-Achse), Zeit auf der
  Y-Achse, Tabs für die vier Festivaltage. In den Band-Slots zeigen bunte
  Kreise mit Initialen, wer hingeht. Band antippen → eintragen.
- **„Unsere Bands“-Liste** – kompakte Ansicht nur mit Bands, bei denen
  mindestens ein Crew-Mitglied dabei ist, inkl. Personenanzahl.
- **Positions-Markierung** – wer bei einer Band eingetragen ist, kann auf dem
  schematischen Bühnen-Blueprint ein ✕ setzen: „Hier stehe ich.“
- **Bühnen-Karten mit POIs** – Toiletten 🚻, Wasser 💧, Merch 🛍️,
  Erste Hilfe ⛑️ und Eingänge 🚪 auf jedem Blueprint, für alle sichtbar.
- **Admin-Panel** (`/admin`, Passwort) – Blueprints bearbeiten und POIs
  platzieren/verschieben/löschen.
- **PWA mit Offline-Modus** – App auf dem Homescreen installierbar. Der
  Service Worker cached Shell + Daten; die App pollt alle paar Sekunden neue
  Daten. Ohne Netz (Wacken-Funkloch!) läuft alles aus dem Cache weiter, und
  Eintragungen landen in einer Warteschlange, die automatisch synct, sobald
  wieder Verbindung da ist.

## Los geht's

```bash
docker compose up -d          # lokale PostgreSQL (oder eigene DB nutzen)
cp .env.example .env.local    # DATABASE_URL & ADMIN_PASSWORD
npm install
npm run dev        # Entwicklung: http://localhost:3000
npm run build && npm start   # Produktion
```

Festivals (inkl. Timetable), Gruppen, Nutzer, Band-Auswahlen, Positionen
und Blueprints liegen in **PostgreSQL** (`DATABASE_URL`). Das Schema wird
beim ersten Zugriff automatisch angelegt bzw. migriert und die Defaults
werden geseedet: Wacken-Timetable aus `data/timetable.json`, Summer Breeze
als Gerüst, Blueprints – und **Bestandsnutzer landen automatisch in der
Default-Gruppe „DEFEKT“** (Name über `DEFAULT_GROUP_NAME` überschreibbar),
damit beim Umstieg auf Gruppen nichts verloren geht. Backup: `pg_dump`.
Wer noch Daten aus der früheren Datei-Datenbank hat:
`DATABASE_URL=... node scripts/migrate-db-json.mjs` überträgt `data/db.json`.

Fürs Handy: Seite im Browser öffnen → „Zum Startbildschirm hinzufügen“.
Damit Service Worker **und Passkeys** laufen, muss die App über **HTTPS**
(oder localhost) ausgeliefert werden.

### Auth-Umgebungsvariablen (alle optional)

| Variable          | Zweck                                                     |
| ----------------- | --------------------------------------------------------- |
| `AUTH_SECRET`     | HMAC-Schlüssel für Session-/Challenge-Cookies. Ohne die   |
|                   | Variable wird er aus der `DATABASE_URL` abgeleitet (alle  |
|                   | Serverless-Instanzen rechnen gleich). Setzen = empfohlen. |
| `WEBAUTHN_RP_ID`  | Relying-Party-ID (Domain). Default: Hostname des Requests.|
| `WEBAUTHN_ORIGIN` | Erwartete Origin (`https://…`). Default: Request-Origin.  |
| `DEFAULT_GROUP_NAME` | Name der Migrations-Gruppe für Bestandsnutzer          |
|                   | (Default: `DEFEKT`). Greift nur beim allerersten Anlegen. |
| `LEGACY_NAME_ADOPTION` | `off` = Alt-Accounts ohne Passkey können nicht mehr  |
|                   | per Namensgleichheit übernommen werden. Empfohlen, sobald |
|                   | die ganze Crew ihren Passkey hat (sonst könnte sich ein   |
|                   | Fremder per Namen in die Bestands-Gruppe setzen).         |

Achtung: Passkeys sind an die Domain (RP ID) gebunden. Zieht die App auf
eine andere Domain um, sind bestehende Passkeys dort nicht mehr nutzbar.

### Deployment auf Vercel mit Neon

1. Neon-Datenbank über den Vercel-Marketplace anlegen – die Integration
   setzt `DATABASE_URL` (bzw. `POSTGRES_URL`, beides wird erkannt)
   automatisch als Env-Variable. Den **pooled** Connection-String verwenden
   (Host mit `-pooler`), mit `?sslmode=require` am Ende.
2. `ADMIN_PASSWORD` als Env-Variable setzen.
3. Deploy – fertig. Der Wacken-Timetable wird beim ersten Schemalauf aus
   `data/timetable.json` in die DB geseedet; danach laufen Lineup-Updates
   über `npm run import:db` direkt gegen die Datenbank (kein Redeploy).

## Admin

- URL: `/admin` (auch über das ⚙️ in der unteren Navigation)
- Passwort: über die Umgebungsvariable `ADMIN_PASSWORD` setzen – am besten
  ein langes, zufälliges. **In der Produktion gibt es keinen Default:** ist
  `ADMIN_PASSWORD` nicht gesetzt, ist der Admin-Bereich deaktiviert (fail
  closed), Login und Speichern werden abgelehnt. Nur in der lokalen
  Entwicklung greift der Fallback `wacken2026`.
- Nach dem Login setzt der Server eine signierte, `httpOnly`-Session
  (Cookie `fb_admin`, 12 h gültig). Das Passwort landet nie im Browser-Storage
  und wird nicht bei jedem Request mitgeschickt. „Abmelden" beendet die
  Session serverseitig.
- Globales Betreiber-Tool (hängt an keiner Gruppe): Blueprints & POIs
  **pro Festival** pflegen – oben umschalten. Festivals ohne importiertes
  Lineup zeigen einen Hinweis statt des Editors.

## Timetable-Daten

Die Timetables liegen **pro Festival in der Datenbank** (Tabelle
`festivals`, JSONB). `data/timetable.json` dient nur noch als Seed für
Wacken beim allerersten Schemalauf; danach ist die DB die Wahrheit und
ein Lineup-Update braucht **keinen Redeploy** mehr:

```bash
npm run import                                # W:O:A-Export -> data/timetable.json
DATABASE_URL=... npm run import:db -- --festival woa2026   # -> Datenbank
DATABASE_URL=... npm run import:db -- --festival sb2026 pfad/sb.json
```

`scripts/import-festival.mjs` nimmt jede Datei im App-Timetable-Format
(`{ festival, edition, dataVersion, days, stages, slots }`). Slot-IDs
(`tag-buehne-bandslug`) müssen über Re-Importe stabil bleiben, damit
bestehende Auswahlen erhalten bleiben.

### Running Order importieren (z. B. Summer Breeze)

Für Festivals ohne offiziellen Datenexport gibt es einen Konverter für
ein einfaches Running-Order-Format (Tage → Bühnen → `[Start, Ende, Band]`):

```jsonc
{
  "festival": "Summer Breeze Open Air 2026",
  "edition": "12.–15.08.2026 · Dinkelsbühl",
  "days": [
    {
      "date": "2026-08-13",
      "slots": {
        "main":      [["12:00", "12:40", "Our Promise"], ["19:10", "20:30", "Saxon"]],
        "tstage":    [["02:15", "03:00", "Saor"]],
        "toolrebel": [["12:20", "12:50", "Fireborn"]],
        "circus":    [["09:30", "10:15", "Metalza – Metal Workout"]]
      }
    }
  ]
}
```

```bash
npm run import:ro -- sb.json                        # -> sb.timetable.json
DATABASE_URL=... npm run import:db -- --festival sb2026 sb.timetable.json
```

Slots nach Mitternacht gehören zum Festivaltag, unter dem sie stehen –
der Konverter normalisiert alles vor 08:00 automatisch auf Stunden ≥ 24
(01:00 → `25:00`), auch für Endzeiten über Mitternacht hinaus. Für die
Summer-Breeze-Bühnen-Keys (`main`, `tstage`, `toolrebel`, `circus`) sind
Name/Kürzel/Farbe eingebaut; andere Keys bekommen generierte Werte, die
sich per `"stages"`-Array in der Eingabedatei übersteuern lassen. Der
Import ersetzt immer den kompletten Stand des Festivals – die Datei muss
also **alle Tage** enthalten. Slot-IDs bleiben über Re-Importe stabil,
Band-Auswahlen der Crew gehen daher nicht verloren.

Der eingecheckte Wacken-Stand ist aus dem **offiziellen W:O:A-Datenexport**
(`wackenlineup.json`) generiert: 233 Slots auf 9 Bühnen und 7 Tagen
(Warm-up ab So 26.07.), inklusive Spotify-Artist-IDs für den
„Auf Spotify anhören“-Button im Band-Sheet.

Wacken-Export neu einlesen (z. B. nach einem Update der Export-Datei):

```bash
npm run import                     # liest ./wackenlineup.json
npm run import -- pfad/datei.json  # anderer Pfad
```

Der Import filtert Alt-Events früherer Jahre und Meet-&-Greets heraus,
konvertiert die Epoch-Zeiten nach Europe/Berlin (Sets nach Mitternacht
zählen zum Vortag, z. B. 01:00 → `25:00`) und hält die Slot-IDs stabil
(`tag-buehne-bandname`), damit bestehende Band-Auswahlen der Crew
erhalten bleiben.

### Alternative: Scraper

Falls kein Export vorliegt, gibt es weiterhin den Scraper:

```bash
npm run scrape                            # wacken.com; Fallback: Clashfinder
npm run scrape -- --source clashfinder    # direkt den Clashfinder-Export holen
npm run scrape -- --from-file seite.html  # gespeicherte Seite parsen
npm run scrape -- --debug                 # Diagnose + HTML-Dump bei Problemen
npm run scrape -- --dry-run               # Vorschau, ohne zu schreiben
```

Der Scraper probiert mehrere Strategien: JSON-LD und eingebettete
JSON-Blobs im HTML, dann alle in der Seite/den JS-Bundles referenzierten
JSON-/API-URLs (die Running Order wird auf wacken.com client-seitig
nachgeladen), und als Fallback den maschinenlesbaren
[Clashfinder](https://clashfinder.com/m/woa2026/)-Export – einen
community-gepflegten Spiegel der offiziellen Running Order.

Wenn alles fehlschlägt: Running-Order-Seite im Browser öffnen, warten bis
sie fertig geladen ist, per DevTools → Network die JSON-Antwort speichern
oder die gerenderte Seite mit Strg+S sichern, dann `--from-file`. Die
Slot-IDs bleiben stabil (`tag-buehne-bandname`), sodass bestehende
Eintragungen der Crew erhalten bleiben. Alternativ die Datei von Hand
pflegen – Zeiten nach Mitternacht schreibt man als `24:30` (= 00:30 am
Folgetag). Parser-Tests: `node scripts/test-scrape.mjs`.

## Technik

| Baustein   | Wahl                                                        |
| ---------- | ----------------------------------------------------------- |
| Framework  | Next.js 15 (App Router) + React 19 + TypeScript             |
| Styling    | Tailwind CSS 4, Mobile-First, dunkles Metal-Theme           |
| Datenbank  | PostgreSQL via `pg` (Neon/Vercel-tauglich); Schema wird     |
|            | automatisch angelegt/migriert; Timetables pro Festival als  |
|            | JSONB in der DB (Lineup-Update ohne Redeploy)               |
| Sync       | Client pollt `GET /api/data` alle 7 s; Mutationen werden    |
|            | optimistisch angewendet und offline in `localStorage`       |
|            | eingereiht (Replay bei Reconnect, last-write-wins)          |
| PWA        | Web App Manifest + eigener Service Worker (`public/sw.js`): |
|            | Precache der Shell, network-first mit Cache-Fallback für    |
|            | Daten, stale-while-revalidate für statische Assets          |

### API

| Route                                | Zweck                                        |
| ------------------------------------ | -------------------------------------------- |
| `GET  /api/data?group=…`             | Datenstand der Gruppe (Timetable des Gruppen-Festivals, Mitglieder, Auswahlen, Positionen, Blueprints); nur für Mitglieder |
| `POST /api/webauthn/register/options`| Passkey-Registrierung starten (`{ name }`)   |
| `POST /api/webauthn/register/verify` | Registrierung prüfen, Nutzer + Session       |
| `POST /api/webauthn/login/options`   | Passkey-Login starten (discoverable)         |
| `POST /api/webauthn/login/verify`    | Login prüfen, Session setzen                 |
| `GET  /api/me`                       | Nutzer + Gruppenliste zur Session (401 = raus) |
| `POST /api/logout`                   | Session-Cookie löschen                       |
| `GET  /api/festivals`                | Festival-Liste für die Gruppengründung       |
| `POST /api/groups`                   | Gruppe erstellen (`{ name, festivalId }`)    |
| `GET  /api/groups/mine`              | Meine Mitgliedschaften                       |
| `POST /api/groups/join`              | Beitritt per Einladungscode (`{ code }`)     |
| `GET  /api/groups/preview?code=…`    | Öffentliche Gruppen-Vorschau für die Join-Seite |
| `PATCH /api/groups/[id]`             | Owner: umbenennen, Feuerrahmen-Schwelle, Code rotieren |
| `GET/POST /api/groups/[id]/image`    | Gruppenbild laden (Mitglieder) / setzen (Owner) |
| `POST /api/groups/[id]/leave`        | Gruppe verlassen (Owner-Nachrücken, letzte:r löscht) |
| `DELETE /api/groups/[id]/members/[userId]` | Owner: Mitglied entfernen              |
| `POST /api/selection`                | Band-Teilnahme setzen/entfernen (Session, `{ group, slotId, status }`) |
| `POST /api/position`                 | ✕-Position setzen/löschen (Session, `{ group, slotId, x, y }`) |
| `POST /api/admin/login`              | Admin-Passwort prüfen, Session-Cookie setzen |
| `GET  /api/admin/me`                 | Admin-Session gültig? (401 = Login nötig)    |
| `POST /api/admin/logout`             | Admin-Session-Cookie löschen                 |
| `GET  /api/admin/state?festival=…`   | Admin: Festivals, Timetable, Blueprints      |
| `POST /api/admin/blueprint`          | Blueprint einer Bühne speichern (Admin, `{ festivalId, stageId, blueprint }`) |

### Icons neu erzeugen

```bash
npm i --no-save sharp && node scripts/generate-icons.mjs
```
