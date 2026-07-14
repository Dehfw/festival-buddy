# 🤘 Festival Buddy – Wacken Open Air 2026

Timetable-Planer für eine geschlossene Crew (17 Leute) beim **W:O:A 2026**
(29.07.–01.08.2026): Wer geht zu welcher Band – und wo steht ihr im Publikum?

Login per **Passkey** (Face ID / Fingerabdruck): Beim ersten Mal Namen
eintippen und Passkey anlegen, danach bietet das Gerät den Passkey beim
Öffnen von selbst an (WebAuthn Conditional UI). Der Name ist nur der
Anzeigename – die Identität hängt am Passkey. Kein Passwort, kein IdP.

## Features

- **Passkey-Login mit Autodiscovery** – kein Passwort: einmal registrieren,
  danach schlägt iPhone/Android den Passkey am Namensfeld automatisch vor
  (`@simplewebauthn`, discoverable Credentials). Alt-Accounts aus der
  Nur-Name-Ära werden bei der ersten Passkey-Registrierung mit gleichem
  Namen übernommen (Auswahlen bleiben erhalten). Passkeys syncen über
  iCloud-Schlüsselbund bzw. Google Passwortmanager; für ein fremdes Gerät
  gibt es beim Login den QR-Code-Flow.
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

Nutzer, Band-Auswahlen, Positionen und Blueprints liegen in **PostgreSQL**
(`DATABASE_URL`). Das Schema wird beim ersten Zugriff automatisch angelegt
und die Default-Blueprints werden geseedet – keine Migrationen nötig.
Backup: `pg_dump`. Wer noch Daten aus der früheren Datei-Datenbank hat:
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

Achtung: Passkeys sind an die Domain (RP ID) gebunden. Zieht die App auf
eine andere Domain um, sind bestehende Passkeys dort nicht mehr nutzbar.

### Deployment auf Vercel mit Neon

1. Neon-Datenbank über den Vercel-Marketplace anlegen – die Integration
   setzt `DATABASE_URL` (bzw. `POSTGRES_URL`, beides wird erkannt)
   automatisch als Env-Variable. Den **pooled** Connection-String verwenden
   (Host mit `-pooler`), mit `?sslmode=require` am Ende.
2. `ADMIN_PASSWORD` als Env-Variable setzen.
3. Deploy – fertig. Der Timetable wird beim Build aus
   `data/timetable.json` ins Bundle kompiliert (kein Laufzeit-Dateizugriff,
   Serverless-tauglich); nach einem `npm run import` also einmal neu
   deployen.

## Admin

- URL: `/admin` (auch über das ⚙️ in der unteren Navigation)
- Passwort: `wacken2026` – ändern über die Umgebungsvariable
  `ADMIN_PASSWORD`.

## Timetable-Daten

`data/timetable.json` enthält Bühnen, Tage und alle Band-Slots. Der
eingecheckte Stand ist aus dem **offiziellen W:O:A-Datenexport**
(`wackenlineup.json`) generiert: 233 Slots auf 9 Bühnen und 7 Tagen
(Warm-up ab So 26.07.), inklusive Spotify-Artist-IDs für den
„Auf Spotify anhören“-Button im Band-Sheet.

Neu importieren (z. B. nach einem Update der Export-Datei):

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
|            | automatisch angelegt, Timetable statisch ins Bundle         |
|            | kompiliert                                                  |
| Sync       | Client pollt `GET /api/data` alle 7 s; Mutationen werden    |
|            | optimistisch angewendet und offline in `localStorage`       |
|            | eingereiht (Replay bei Reconnect, last-write-wins)          |
| PWA        | Web App Manifest + eigener Service Worker (`public/sw.js`): |
|            | Precache der Shell, network-first mit Cache-Fallback für    |
|            | Daten, stale-while-revalidate für statische Assets          |

### API

| Route                                | Zweck                                        |
| ------------------------------------ | -------------------------------------------- |
| `GET  /api/data`                     | Kompletter Datenstand (Timetable, Nutzer, …) |
| `POST /api/webauthn/register/options`| Passkey-Registrierung starten (`{ name }`)   |
| `POST /api/webauthn/register/verify` | Registrierung prüfen, Nutzer + Session       |
| `POST /api/webauthn/login/options`   | Passkey-Login starten (discoverable)         |
| `POST /api/webauthn/login/verify`    | Login prüfen, Session setzen                 |
| `GET  /api/me`                       | Nutzer zur aktuellen Session (401 = raus)    |
| `POST /api/logout`                   | Session-Cookie löschen                       |
| `POST /api/selection`                | Band-Teilnahme setzen/entfernen (Session)    |
| `POST /api/position`                 | ✕-Position setzen/löschen (Session)          |
| `POST /api/admin/login`              | Admin-Passwort prüfen                        |
| `POST /api/admin/blueprint`          | Blueprint einer Bühne speichern (Admin)      |

### Icons neu erzeugen

```bash
npm i --no-save sharp && node scripts/generate-icons.mjs
```
