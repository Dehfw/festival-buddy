# 🤘 Festival Buddy – Wacken Open Air 2026

Timetable-Planer für eine geschlossene Crew (17 Leute) beim **W:O:A 2026**
(29.07.–01.08.2026): Wer geht zu welcher Band – und wo steht ihr im Publikum?

Kein Login-System: Name eintippen, fertig. Gleicher Name = gleicher Nutzer auf
jedem Gerät.

## Features

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
npm install
npm run dev        # Entwicklung: http://localhost:3000
npm run build && npm start   # Produktion
```

Beim ersten Start wird `data/db.json` automatisch angelegt (Nutzer,
Band-Auswahlen, Positionen, Blueprints). Backup = diese eine Datei kopieren.

Fürs Handy: Seite im Browser öffnen → „Zum Startbildschirm hinzufügen“.
Damit der Service Worker läuft, muss die App über **HTTPS** (oder localhost)
ausgeliefert werden.

## Admin

- URL: `/admin` (auch über das ⚙️ in der unteren Navigation)
- Passwort: `wacken2026` – ändern über die Umgebungsvariable
  `ADMIN_PASSWORD`.

## Timetable-Daten

`data/timetable.json` enthält Bühnen, Tage und alle Band-Slots.

> ⚠️ **Datenstand:** Das eingecheckte Seed basiert auf den zur Running-Order
> veröffentlichten Pressemeldungen (Stand Juli 2026). Zeit-verifizierte Slots
> tragen `"confirmed": true`; die übrigen Slots sind plausibel rekonstruiert
> und als `"confirmed": false` markiert (in der App mit dem Hinweis „Slot
> unbestätigt“). Vor dem Festival einmal mit den offiziellen Daten
> aktualisieren:

```bash
npm run scrape                               # Live von wacken.com
npm run scrape -- --from-file seite.html     # Fallback: gespeicherte Seite parsen
```

wacken.com hat einen Bot-Schutz. Wenn der Live-Abruf mit 403 abgewiesen wird:
Running-Order-Seite im Browser öffnen, mit Strg+S komplett speichern und über
`--from-file` parsen. Die Slot-IDs bleiben dabei stabil
(`tag-buehne-bandname`), sodass bestehende Eintragungen erhalten bleiben.
Alternativ kann die Datei einfach von Hand gepflegt werden – Zeiten nach
Mitternacht schreibt man als `24:30` (= 00:30 am Folgetag).

## Technik

| Baustein   | Wahl                                                        |
| ---------- | ----------------------------------------------------------- |
| Framework  | Next.js 15 (App Router) + React 19 + TypeScript             |
| Styling    | Tailwind CSS 4, Mobile-First, dunkles Metal-Theme           |
| Datenbank  | JSON-Datei (`data/db.json`) mit atomaren Writes und         |
|            | serieller Write-Queue – für 17 Nutzer genau richtig,        |
|            | null native Abhängigkeiten                                  |
| Sync       | Client pollt `GET /api/data` alle 7 s; Mutationen werden    |
|            | optimistisch angewendet und offline in `localStorage`       |
|            | eingereiht (Replay bei Reconnect, last-write-wins)          |
| PWA        | Web App Manifest + eigener Service Worker (`public/sw.js`): |
|            | Precache der Shell, network-first mit Cache-Fallback für    |
|            | Daten, stale-while-revalidate für statische Assets          |

### API

| Route                  | Zweck                                        |
| ---------------------- | -------------------------------------------- |
| `GET  /api/data`       | Kompletter Datenstand (Timetable, Nutzer, …) |
| `POST /api/user`       | Nutzer anlegen/finden (nur Name)             |
| `POST /api/selection`  | Band-Teilnahme setzen/entfernen              |
| `POST /api/position`   | ✕-Position setzen/löschen                    |
| `POST /api/admin/login`| Admin-Passwort prüfen                        |
| `POST /api/admin/blueprint` | Blueprint einer Bühne speichern (Admin) |

### Icons neu erzeugen

```bash
npm i --no-save sharp && node scripts/generate-icons.mjs
```
