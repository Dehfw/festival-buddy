# Plan: Super-Admin-Bereich (Betreiber-UI)

Ziel: Die Betreiber-Aufgaben, die heute nur per CLI mit Datenbank-URL
gehen, bekommen ein Web-Interface in der eingeloggten App – für genau
eine Person(engruppe): den **Betreiber** von Festival Buddy. Konkret:

1. **Festivals anlegen** – neues (leeres) Festival per Formular statt
   Skelett-JSON + `npm run import:db`.
2. **Timetable importieren** – Importdatei im App-Format hochladen,
   serverseitig prüfen, **Diff-Vorschau** sehen (was `npm run
   lineup:check` heute lokal zeigt) und dann einspielen.
3. **Veranstalter einladen & verwalten** – Einladungscodes erzeugen
   (optional direkt per Mail verschicken), offene Codes widerrufen,
   aktive Veranstalter sehen und entfernen – heute
   `npm run organizer -- generate/list/revoke/remove`.

Die CLIs bleiben als Fallback bestehen (Disaster-Recovery, Automation,
`npm run lineup`-Pipeline); das Web-Interface ist eine zweite Tür zu
denselben DB-Operationen, keine Ablösung.

---

## 1. Ist-Zustand (Kurzfassung)

| Baustein | Heute | Lücke |
| --- | --- | --- |
| Festival anlegen | `npm run import:db -- --festival <id> skeleton.json` (`scripts/import-festival.mjs`) | Nur mit `DATABASE_URL` vom Rechner des Betreibers; kein Handy, keine Prüfung gegen Tippfehler in der ID. |
| Lineup-Import | dito; Diff-/Verlust-Warnung nur lokal über `npm run lineup:check` (`scripts/validate-timetable.mjs`) | Import ersetzt kommentarlos den kompletten Stand – entfallene Slot-IDs nehmen Zusagen/Positionen der Crews mit. |
| Veranstalter-Zugänge | `scripts/organizer-code.mjs` (generate/list/revoke/remove), Einlösen in der App unter `/app/veranstalter?code=…` | Code muss manuell per Mail/Messenger verschickt werden; Überblick nur per CLI. |
| Rollenmodell | `festival_organizers` (pro Festival), Gruppen-Rollen (pro Gruppe). **Kein** globales Betreiber-Konzept in der DB – „Betreiber sein“ = „die `DATABASE_URL` haben“. | Für ein Web-Interface braucht es eine echte, entziehbare Rolle. |
| Autorisierung | `canManageFestival()` in `src/lib/organizer.ts`: Session-Cookie liefert nur `uid`, die Rolle wird bei **jeder** Anfrage gegen die DB geprüft → Entzug wirkt sofort. | Muster passt 1:1 für Super-Admins – nur die Tabelle fehlt. |
| Mail | `src/lib/mail.ts` (SendGrid, bislang nur Passwort-Reset) | Einladungsmail-Vorlage fehlt. |

Die Kommentare in `scripts/organizer-code.mjs` und
`scripts/push-broadcast.mjs` sagen ausdrücklich „bewusst kein
Web-Interface – alles läuft über die Datenbank-URL“. Dieses Konzept
revidiert das für die drei o. g. Aufgaben. Die Sicherheitsidee dahinter
(„Root of Trust ist die DB-URL“) bleibt aber erhalten: **Super-Admin
wird man ausschließlich per CLI/DB**, nie über die Web-UI (§2). Die UI
kann also niemandem mehr Rechte geben, als die DB hergibt.

---

## 2. Rollenmodell: `super_admins`

Neue Tabelle, idempotent in `createSchema()` (`src/lib/db.ts`) wie alle
anderen:

```sql
-- Betreiber: dürfen Festivals anlegen/importieren und Veranstalter
-- verwalten. Ernennung NUR per CLI (scripts/super-admin.mjs) – die
-- Web-UI kann diese Rolle weder vergeben noch nehmen.
CREATE TABLE IF NOT EXISTS super_admins (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Bootstrap & Verwaltung per neuer CLI `scripts/super-admin.mjs`
(Aufbau wie `organizer-code.mjs`, `npm run superadmin`):

```bash
npm run superadmin -- grant <user-id>    # Rolle vergeben
npm run superadmin -- revoke <user-id>   # Rolle entziehen (wirkt sofort)
npm run superadmin -- list               # alle Super-Admins
npm run superadmin -- find <name>        # user-id zu einem Anzeigenamen suchen
```

`find` ist nötig, weil man seine eigene `u-…`-ID sonst nur aus der DB
kennt (Namen sind nicht eindeutig → Liste aller Treffer mit
`created_at`). Nach `revoke` wird wie in `organizer-code.mjs` `db_rev`
gebumpt, damit offene UIs den Entzug beim nächsten Poll merken.

Guard analog `canManageFestival()`, neu in `src/lib/superadmin.ts`:

```ts
export async function requireSuperAdmin(req: Request): Promise<ManageAuth>
// 401 = keine Session, 403 = kein Super-Admin. Prüfung bei JEDER
// Anfrage gegen die DB – nichts davon steckt im Session-Token.
```

Bewusst **nicht**: ein `role`-Feld auf `users` (Rolle soll ohne
User-Migration entziehbar/auditierbar sein) und **kein** Env-Var-Ansatz
(`SUPER_ADMIN_USER_IDS`) – der bräuchte für jede Änderung einen
Redeploy und wäre auf Vercel fehleranfällig.

---

## 3. UI: `/app/betreiber`

Gleiche Mechanik wie der Veranstalter-Bereich: Teil der eingeloggten
App (damit automatisch hinter der `/app`-robots-Regel), eigener Tab in
der unteren Navigation – 🛠️ „Betreiber“, nur sichtbar wenn
`GET /api/me` das neue Feld `superAdmin: true` liefert. Für alle
anderen ist die Route ein 403-Zustand mit Link zurück in die App
(kein Oracle nötig – dass es die Route gibt, ist kein Geheimnis).

Der Bereich hat drei Ebenen:

### 3.1 Festival-Liste (Startansicht)

Alle Festivals (auch beendete – anders als `GET /api/festivals`, das
über `LAST_DAY_SQL` filtert), pro Zeile:

- Name, Edition, ID, Status-Badge (`kommend` / `läuft` / `vorbei` aus
  dem letzten Tag im Timetable, leer = `Gerüst`)
- Kennzahlen: Tage/Bühnen/Slots/Bands, `data_version`, `updated_at`
- Veranstalter-Zähler und Zahl offener Einladungscodes
- Gruppen-/Personen-Zähler (dieselben anonymen Summen, die der
  Veranstalter-Bereich schon zeigt – keine Gruppennamen)

Oben ein Button **„Neues Festival“** (→ 3.3), Tap auf eine Zeile
öffnet die Detailansicht (→ 3.2).

### 3.2 Festival-Detail

Zwei Karten:

**Veranstalter** – Web-Fassung von `npm run organizer -- list`:

- Aktive Veranstalter (Name, `user-id`, seit wann) mit Entfernen-Button
  (Bestätigungsdialog; wirkt sofort, wie CLI-`remove` inkl.
  `db_rev`-Bump).
- Einladungscodes mit Status (offen / eingelöst von … am … /
  widerrufen am …); offene Codes lassen sich widerrufen.
- **„Veranstalter einladen“**: erzeugt einen Code und zeigt ihn samt
  Einlöse-Link `/app/veranstalter?code=XXXX-XXXX` mit Copy-Buttons.
  Optionales Mail-Feld: ist eine Adresse eingetragen, verschickt der
  Server die Einladung direkt (→ §5). Die Adresse wird am Invite
  gespeichert (`sent_to`), damit die Liste zeigt, wohin ein offener
  Code ging.
- **„Mich selbst als Veranstalter eintragen“**: legt die eigene
  `festival_organizers`-Zeile an (ohne Code-Umweg). Damit steht dem
  Betreiber sofort der komplette 🎪-Editor (Tage, Bühnen, Slots,
  Blueprints, Name/Edition) zur Verfügung – der Betreiber-Bereich
  muss den Timetable-Editor also **nicht duplizieren**.

**Import** – Web-Fassung von `import:db` + `lineup:check` (→ §4):
Datei wählen (oder JSON einfügen), Vorschau, Bestätigen.

### 3.3 Neues Festival

Kleines Formular: **ID** (`^[a-z0-9-]{2,40}$`, Live-Prüfung auf
Kollision, mit Hinweis „ID ist für immer – steht in Links wie
`/app?festival=<id>`“), **Name**, **Edition**. Anlegen erzeugt die
Zeile mit leerem Timetable (`{days:[],stages:[],slots:[],bands:[]}`)
– exakt das Skelett aus dem Wiki (`docs/wiki/veranstalter.md`) – und
springt in die Detailansicht, wo man direkt einladen oder importieren
kann. Tage/Bühnen/Slots baut danach der Veranstalter (oder der
Betreiber über „mich selbst eintragen“).

---

## 4. Import mit Diff-Vorschau (zweistufig)

Der gefährlichste Teil: `import:db` ersetzt den kompletten
JSONB-Stand, und entfallene Slot-IDs löschen die daran hängenden
`selections`/`positions` (bzw. machen sie unsichtbar). Deshalb kein
Ein-Klick-Import, sondern Dry-Run → Bestätigung:

1. **`POST /api/admin/import` mit `{ festivalId, timetable }`**
   validiert (Format `{ festival, edition, dataVersion, days, stages,
   slots, bands? }`, Regeln aus `mutateTimetable()`: Zeiten `HH:MM`
   mit Stunden ≥ 24, Ende nach Beginn, max. 30 Tage / 40 Bühnen /
   2000 Slots, eindeutige IDs …) und antwortet mit dem **Diff** gegen
   den DB-Stand: neue, verschobene und **entfallene** Slots sowie pro
   entfallenem Slot die Zahl der betroffenen Zusagen und
   Positionsmarker, dazu entfallene Bands aus dem `bands`-Pool
   (Merkungen!). Gespeichert wird nichts.
2. Die UI zeigt die Vorschau (rot hervorgehoben, was Einträge kostet –
   gleiche Sprache wie die Lösch-Dialoge im Veranstalter-Editor).
3. **Gleicher POST mit `confirm: true` + `expectedUpdatedAt`** (der
   `updated_at`-Wert aus Schritt 1) führt den UPSERT aus – in einer
   Transaktion mit `SELECT … FOR UPDATE`; hat sich `updated_at`
   inzwischen geändert (Veranstalter hat parallel editiert), gibt es
   409 und die UI holt eine frische Vorschau.

Technik-Notizen:

- Die Diff-/Validierungslogik wird aus `scripts/validate-timetable.mjs`
  in ein Modul gezogen, das **beide** nutzen (z. B.
  `src/lib/timetable-validate.ts`; das Script importiert es, statt die
  Regeln aus `db.ts` weiter zu spiegeln – ein Spiegel weniger).
- Upload als JSON-Body, Größendeckel ~4 MB (Vercel-Limit 4,5 MB;
  Wacken mit 233 Slots liegt weit darunter). Datei-Input liest die
  Datei clientseitig mit `FileReader`, kein Multipart nötig.
- Nach dem Import: `data_version` aus der Datei übernehmen (leer →
  „Stand <Datum> · Betreiber-Import“), `updated_at` stempeln,
  `db_rev` bumpen – identisch zu `import-festival.mjs`.
- Programm-Änderungs-Pushes (wie beim Veranstalter-Editor) gibt es
  beim Komplett-Import bewusst **nicht** automatisch – ein Re-Import
  verschiebt oft Dutzende Slots; die Vorschau zeigt die Zahl, und der
  Betreiber entscheidet danach selbst, ob eine Mitteilung rausgeht.

Der lokale Weg `npm run lineup` → `npm run import:db` bleibt für die
gepflegten Textdateien unter `lineups/` der Normalfall; die Web-UI
importiert dieselben `data/*.json`-Dateien, nur eben von überall.

---

## 5. Einladungsmail

Neue Funktion `sendOrganizerInviteMail(to, festivalName, code, redeemUrl)`
in `src/lib/mail.ts` (DE/EN wie beim Passwort-Reset). Inhalt: kurzer
Kontext („du bekommst Zugriff auf den Veranstalter-Bereich von
<Festival> bei Festival Buddy“), der Einlöse-Link, der Code zum
Abtippen, Hinweis auf das nötige (kostenlose) Konto. Absender/Setup
wie gehabt über `SENDGRID_API_KEY`/`MAIL_FROM`; ohne Konfiguration
zeigt die UI den Code trotzdem an und meldet nur „Mail nicht
konfiguriert – Code bitte selbst verschicken“.

Dafür bekommt `organizer_invites` eine Spalte
`sent_to TEXT` (idempotentes `ALTER TABLE … ADD COLUMN IF NOT EXISTS`).
Sie dient nur der Anzeige in der Code-Liste; eingelöst werden kann der
Code weiterhin von jedem Konto (das ist heute schon so und bleibt so –
der Veranstalter leitet die Mail ggf. intern weiter).

---

## 6. API (`/api/admin/*`)

Alle Routen hinter `requireSuperAdmin()`; `festivalId` wird wie im
Veranstalter-Bereich pro Anfrage geprüft (`force-dynamic`, kein Cache).

| Route | Zweck |
| --- | --- |
| `GET  /api/admin/state` | Festival-Liste inkl. Kennzahlen, Veranstalter- und Code-Zählern (Startansicht) |
| `GET  /api/admin/festival?festival=…` | Detail: Veranstalter, Codes (+ `sent_to`), Kennzahlen |
| `POST /api/admin/festival` | Festival-Gerüst anlegen (`{ id, name, edition }`; 409 bei ID-Kollision) |
| `POST /api/admin/import` | Import-Dry-Run bzw. -Ausführung (`{ festivalId, timetable, confirm?, expectedUpdatedAt? }`, → §4) |
| `POST /api/admin/invite` | Code erzeugen (`{ festivalId, email? }`); mit `email` zusätzlich Mailversand, Antwort enthält Code + Link + Mail-Status |
| `DELETE /api/admin/invite` | Offenen Code widerrufen (`{ code }`) |
| `DELETE /api/admin/organizer` | Veranstalter entfernen (`{ festivalId, userId }`, inkl. `db_rev`-Bump) |
| `POST /api/admin/organizer/self` | Sich selbst als Veranstalter eintragen (`{ festivalId }`) |

`GET /api/me` liefert zusätzlich `superAdmin: boolean` (eine
`EXISTS`-Query im ohnehin laufenden Handler).

Alle mutierenden Routen schreiben eine Zeile ins neue Audit-Log:

```sql
CREATE TABLE IF NOT EXISTS admin_audit (
  id         TEXT PRIMARY KEY,             -- randomUUID()
  actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,                -- 'festival.create' | 'festival.import' | 'invite.create' | …
  target     TEXT NOT NULL,                -- festival-id, code, user-id
  details    JSONB NOT NULL DEFAULT '{}',  -- z. B. Diff-Zusammenfassung des Imports
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Kein UI dafür in v1 – es reicht, dass man per SQL nachsehen kann, wer
wann welchen Import gefahren hat. (Die CLIs loggen hier nicht; wer die
DB-URL hat, kann das Log ohnehin editieren.)

---

## 7. Sicherheit

- **Rollenprüfung pro Request** gegen die DB (Muster
  `canManageFestival`): Entzug per CLI wirkt sofort, im Session-Token
  steckt nur `uid`.
- **Rechtevergabe nur per CLI** (§2): Die Web-UI kann keine
  Super-Admins ernennen – kompromittierte Session ≠ dauerhafte
  Rechteausweitung auf weitere Konten.
- **CSRF**: wie der Rest der App – `SameSite=Lax`-Cookie plus
  JSON-POSTs; kein Formular-Encoding akzeptieren.
- **Rate-Limit** auf `/api/admin/*` ist unkritisch (Guard sitzt davor),
  aber `POST /api/admin/invite` mit Mailversand bekommt eins
  (`rateLimit()` aus `src/lib/ratelimit.ts`), damit ein gekapertes
  Betreiber-Konto keinen Mail-Spam über unsere SendGrid-Reputation
  fahren kann.
- **Import**: Größendeckel, strenge Schema-Validierung vor dem Parse in
  die DB, Bestätigungsschritt mit Optimistic Locking (§4). Der
  Verlust-Diff ist die eigentliche Schutzmaßnahme – er macht sichtbar,
  was der CLI-Weg heute nur lokal zeigt.
- **Kein Festival-Löschen** in v1 (s. u.) – die einzige wirklich
  irreversible Operation bleibt draußen.

---

## 8. Bewusst nicht in v1 (Ausbaustufen)

- **Festival löschen/archivieren**: `groups.festival_id` referenziert
  `festivals` ohne CASCADE – Löschen mit bestehenden Gruppen soll auch
  weiterhin wehtun. Später ggf. „archivieren“ (aus allen Listen raus,
  Daten bleiben) statt löschen.
- **Super-Admins per UI verwalten**: bleibt CLI (§2).
- **Push-Broadcast-UI** (app-weite Mitteilungen, heute
  `scripts/push-broadcast.mjs`): natürlicher nächster Kandidat für den
  Betreiber-Bereich, aber eigenes Thema (VAPID-Keys, Versand-Feedback).
- **Lineup-Pipeline im Web** (Textformat → Spotify → Build): bleibt
  lokal bei `npm run lineup` – Spotify-Credentials gehören nicht in
  die Laufzeit (s. README).
- **Einladung an ein Konto statt an eine Mail binden**: heute bewusst
  übertragbar; falls Missbrauch, später `sent_to` als Pflicht +
  Prüfung beim Einlösen.

---

## 9. Umsetzungsreihenfolge

1. **Schema + Guard**: `super_admins`, `admin_audit`,
   `organizer_invites.sent_to` in `createSchema()`;
   `src/lib/superadmin.ts`; CLI `scripts/super-admin.mjs` +
   npm-Script `superadmin`.
2. **`/api/me`-Flag + leere Route** `/app/betreiber` mit Tab-Logik
   (sichtbar nur mit Flag), 403-Zustand.
3. **Lesend**: `GET /api/admin/state` + Festival-Liste,
   `GET /api/admin/festival` + Detailansicht.
4. **Veranstalter-Verwaltung**: invite (ohne Mail) / revoke / remove /
   self – Logik existiert in `db.ts` bzw. `organizer-code.mjs` und
   wird in `db.ts`-Funktionen zusammengezogen, die CLI ruft künftig
   dieselben Queries.
5. **Festival anlegen** (Formular + `POST /api/admin/festival`).
6. **Import**: Validierung aus `validate-timetable.mjs` nach
   `src/lib/timetable-validate.ts` extrahieren, Dry-Run-Diff, UI mit
   Vorschau, Confirm-Pfad.
7. **Mailversand** (`sendOrganizerInviteMail`, `sent_to`-Anzeige,
   Rate-Limit).
8. **Doku**: README (§ Veranstalter), `docs/wiki/veranstalter.md`
   (Zugang jetzt auch per UI), neues `docs/wiki/betreiber.md`;
   Kommentar-Köpfe von `organizer-code.mjs`/`import-festival.mjs`
   anpassen („Web-UI unter /app/betreiber, CLI bleibt Fallback“).

Jeder Schritt ist für sich deploybar; ab Schritt 4 verschwindet der
erste CLI-Zwang (Codes), ab Schritt 6 der zweite (Import).
