# Plan: Mandantenfähigkeit über Gruppen & mehrere Festivals

Ziel: Aus der Ein-Crew-App (fest verdrahtete 17er-Crew, fest verdrahtetes
Wacken) wird eine Mehr-Gruppen- und Mehr-Festival-App. Nach dem
Passkey-Login kann man

1. eine **Gruppe erstellen** – mit Name, optionalem Gruppenbild und der
   Auswahl, **für welches Festival** die Gruppe ist (Start: Wacken 2026
   und Summer Breeze 2026),
2. einer Gruppe **per Einladungslink** beitreten – **ein** Link pro Gruppe,
   über den beliebig viele Leute reinkommen (keine Einzel-Einladungen),
3. **alternativ den Code aus dem Link manuell eintippen** (gleicher Code,
   zweiter Eingabeweg – ersetzt das ursprünglich angedachte
   Gruppen-Passwort: ein Geheimnis, zwei Wege),
4. Gruppen einen **Namen** und ein **Gruppenbild** geben.

Mandantenfähig werden die **Personen-Daten** (wer sichtbar ist, wessen
Auswahlen/Positionen man sieht) und neu auch die **Festival-Daten**:
Timetable, Bühnen und Blueprints hängen künftig am Festival der Gruppe
und liegen in der Datenbank statt im Build-Bundle.

---

## 1. Ist-Zustand (Kurzfassung)

| Baustein | Heute | Problem |
| --- | --- | --- |
| `src/lib/db.ts` | Tabellen `users`, `selections`, `positions`, `webauthn_credentials`, `blueprints`, Sequenz `db_rev`. Schema wird idempotent in `createSchema()` angelegt. | Kein Gruppen- und kein Festival-Konzept; alle sehen alle. |
| Timetable | `data/timetable.json` wird **ins Bundle kompiliert** (`getTimetable()` liefert das statische JSON); `npm run import` schreibt die Datei, danach ist ein Redeploy nötig. | Genau ein Festival; Lineup-Updates erfordern Deploys. |
| `blueprints`-Tabelle | Primärschlüssel ist nur `stage_id` (`faster`, `harder`, …). | Bühnen-IDs verschiedener Festivals würden kollidieren. |
| `GET /api/data` | Liefert **alle** Nutzer/Auswahlen/Positionen, ohne Login-Prüfung. | Muss auf Gruppe + Festival gescopet und hinter die Session gelegt werden. |
| `src/lib/auth.ts` | Session-Cookie = HMAC-Token `{ uid }`. | Reicht als Identität; Gruppenzugehörigkeit kommt aus der DB, nicht ins Cookie. |
| Registrierung (`/api/webauthn/register/options`) | Name ist **global eindeutig** (`isNameTaken`). | Fremde Gruppen blockieren sich gegenseitig die Vornamen. |
| Client (`store.tsx`, `sync.ts`) | Ein globaler Datenstand, Poll alle 7 s, Offline-Cache/Queue in `localStorage`. | Cache/Fetch brauchen Gruppen-Scope; Gate-Logik kennt nur „eingeloggt ja/nein“. |
| UI (`page.tsx` → `NameGate`/`AppShell`) | Nach Login direkt die App; Wacken-/Crew-Texte („X von 17“, „W:O:A“). | Es fehlt der Schritt „Gruppe erstellen/beitreten“; Texte müssen generisch bzw. festivalabhängig werden. |
| `public/sw.js` | Precacht `/` und `/admin`, cacht `/api/data`. | Neue Route `/join/[code]`, gruppenspezifischer Daten-Cache. |

Wichtig fürs Datenmodell: `selections`/`positions` hängen **am Nutzer**.
Das bleibt so – ob ich zu einer Band gehe, ist eine Eigenschaft von mir.
Neu ist nur: Slot-IDs (`tag-buehne-bandslug`) sind lediglich **pro
Festival** eindeutig, also bekommen beide Tabellen eine
`festival_id`-Spalte. Gescopet wird die **Sichtbarkeit** über die Gruppe
(nur Mitglieder meiner Gruppe, nur Slots ihres Festivals).

---

## 2. Datenmodell

Neue bzw. geänderte Tabellen (idempotent in `createSchema()`, wie die
bestehenden `ALTER TABLE … IF NOT EXISTS`-Migrationen; die PK-Umbauten
brauchen einen `DO $$ … $$`-Block mit Existenz-Check in `pg_constraint`):

```sql
CREATE TABLE IF NOT EXISTS festivals (
  id           TEXT PRIMARY KEY,          -- 'woa2026', 'sb2026'
  name         TEXT NOT NULL,             -- 'Wacken Open Air 2026'
  edition      TEXT NOT NULL,             -- Untertitel/Datumszeile
  data_version TEXT NOT NULL DEFAULT '',
  timetable    JSONB NOT NULL,            -- { days, stages, slots } wie Timetable-Typ
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id          TEXT PRIMARY KEY,           -- 'g-' || randomUUID()
  festival_id TEXT NOT NULL REFERENCES festivals(id),
  name        TEXT NOT NULL,              -- 2–40 Zeichen
  invite_code TEXT NOT NULL UNIQUE,       -- tippbarer Mehrfach-Code, rotierbar (s. §4)
  image       BYTEA,                      -- Gruppenbild (klein, s. §7)
  image_mime  TEXT,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id  TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member',     -- 'owner' | 'member'
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS group_members_user_idx ON group_members (user_id);

-- Bestandstabellen um Festival-Scope erweitern (Default = Wacken):
ALTER TABLE selections ADD COLUMN IF NOT EXISTS festival_id TEXT NOT NULL DEFAULT 'woa2026';
ALTER TABLE positions  ADD COLUMN IF NOT EXISTS festival_id TEXT NOT NULL DEFAULT 'woa2026';
-- PKs umbauen: (user_id, festival_id, slot_id)
ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS festival_id TEXT NOT NULL DEFAULT 'woa2026';
-- PK umbauen: (festival_id, stage_id)
```

Entscheidungen dazu:

- **Timetable als JSONB, nicht normalisiert.** Die App behandelt den
  Timetable als unveränderlichen Block (`getTimetable()` → komplettes
  Objekt in den Payload). Eine Zerlegung in `days`/`stages`/`slots`-Tabellen
  brächte nur Joins ohne Nutzen – Import ersetzt ohnehin immer den ganzen
  Stand. Der `Timetable`-TypeScript-Typ bleibt unverändert.
- **Ein Einladungscode pro Gruppe, mehrfach nutzbar.** Keine
  Einzel-Einladungen, kein Ablaufdatum – gültig, bis der Owner ihn
  rotiert. Der Code ist zugleich der Link-Bestandteil und das, was man
  manuell eintippen kann. Ein separates Gruppen-Passwort gibt es nicht
  mehr (ein Geheimnis reicht; zwei parallele Geheimnisse verwirren nur).
- **Mehrere Gruppen pro Nutzer:** Das Schema (n:m über `group_members`)
  erlaubt es ab Tag 1 – auch gruppenübergreifend über verschiedene
  Festivals (Wacken-Crew **und** Summer-Breeze-Crew). Die UI startet mit
  „eine aktive Gruppe“ (`activeGroupId` in `localStorage`); ein Switcher
  ist später reine UI-Arbeit.
- **Selections/Positions bleiben nutzerbezogen**, bekommen aber
  `festival_id`: Wer auf beiden Festivals ist, hat getrennte Zusagen; wer
  in zwei Gruppen desselben Festivals ist, hat (fachlich korrekt)
  dieselben.
- **Rollen minimal:** `owner` (Ersteller) darf umbenennen, Bild ändern,
  Code rotieren, Mitglieder entfernen. Kein weiteres Rechtemodell.
- **`db_rev` bleibt vorerst global** (Polling-Payload ist gruppengescopet
  und klein). „Rev pro Gruppe“ erst bei Bedarf.

### Migration der Bestandsdaten

Beim ersten Schemalauf nach dem Deploy (in `createSchema()`, unter dem
bestehenden Advisory-Lock, alles idempotent):

1. **Festivals seeden:** `woa2026` aus dem gebundelten
   `data/timetable.json` (bleibt als Seed im Repo), `sb2026` als Gerüst
   (Name/Edition/Tage, `slots: []`) – Lineup kommt später per Import (§3).
   Seed nur, wenn die Zeile fehlt (`ON CONFLICT DO NOTHING`) – danach ist
   die DB die Wahrheit, nicht das Bundle.
2. **Spalten-Defaults:** bestehende `selections`/`positions`/`blueprints`
   bekommen `festival_id = 'woa2026'` (siehe `ALTER TABLE` oben).
3. **Default-Gruppe:** existiert noch keine Gruppe **und** gibt es Nutzer →
   Gruppe „W:O:A Crew 2026“ (überschreibbar via `DEFAULT_GROUP_NAME`) auf
   `woa2026` anlegen, `invite_code` generieren, alle vorhandenen Nutzer
   als Mitglieder, ältester Nutzer (`ORDER BY created_at`) wird `owner`.

Damit verhält sich die App nach dem Deploy für die bestehende Crew exakt
wie vorher – niemand muss etwas tun.

---

## 3. Festival-Daten: Import & Verwaltung

- **`getTimetable()` → `getTimetable(festivalId)`** liest aus der
  `festivals`-Tabelle (mit kleinem In-Process-Cache, invalidiert über
  `updated_at`/`rev` – der Payload wird eh alle 7 s gepollt, aber die
  DB-Last soll nicht pro Poll ein JSONB-Vollread sein).
- **Import-Script auf DB umstellen:** Die Parse-Logik aus
  `scripts/import-lineup.mjs` (Zeitfenster, Bühnen-Mapping,
  Mitternachts-Regel `25:00`, stabile Slot-IDs `tag-buehne-bandslug`)
  bleibt; statt `data/timetable.json` zu schreiben, macht ein neues
  `scripts/import-festival.mjs --festival woa2026 <datei>` ein UPSERT in
  `festivals` (braucht `DATABASE_URL`). Damit entfällt der Redeploy nach
  Lineup-Updates – der bisher größte Betriebs-Nachteil.
- **Summer Breeze 2026:** eigener Import nötig. Der offizielle Export hat
  ein anderes Format; realistischste Quelle ist der Clashfinder-Export
  (der Scraper unterstützt Clashfinder schon als Fallback-Quelle für
  Wacken – die Logik lässt sich mit eigener `STAGE_DEFS`-Tabelle für die
  SB-Bühnen wiederverwenden). Bis das Lineup steht, ist `sb2026` ein
  leerer Timetable – Gruppen können trotzdem schon gegründet werden, die
  App zeigt „Lineup folgt“.
- **Blueprints pro Festival:** `blueprints` bekommt `festival_id` im PK.
  Der Seed in `data/blueprints.seed.json` gilt nur für die Wacken-Bühnen;
  für Summer Breeze startet jede Bühne mit einem generischen
  Default-Blueprint (Bühne oben, FOH mittig), den man im Admin-Panel
  anpasst. Admin-Panel bekommt dafür einen Festival-Umschalter.
- **Slot-Validierung:** `POST /api/selection` prüft heute gegen
  `getTimetable()`. Künftig: Gruppe aus dem Request → deren
  `festival_id` → gegen den Timetable **dieses** Festivals prüfen und die
  `festival_id` in die Zeile schreiben.

---

## 4. Einladung: ein Code, zwei Wege

- **Format:** 8 Zeichen aus einem verwechslungsfreien Alphabet
  (Crockford-Base32: ohne `0/O`, `1/I/l`), angezeigt als `XXXX-XXXX`,
  Eingabe case-insensitiv und mit/ohne Bindestrich. ~40 Bit Entropie –
  für einen mehrfach nutzbaren, rotierbaren Code mit Rate-Limit (§8)
  angemessen und dabei problemlos vom Handy des Nachbarn abtippbar.
- **Link:** `https://…/join/XXXX-XXXX` – teilen per `navigator.share`
  (Mobile) mit Zwischenablage-Fallback; QR-Code als Nice-to-have.
- **Manuell:** Im GroupGate gibt es ein Codefeld („Code eingeben, den dir
  jemand aus der Gruppe gibt“) – derselbe Code, kein separates Passwort.
- **Rotation:** Owner kann jederzeit einen neuen Code generieren; alter
  Link und alter Code sind sofort ungültig. Bestehende Mitglieder bleiben
  natürlich drin.

---

## 5. Auth & Scoping

- **Session-Cookie unverändert** (`{ uid }`). Gruppenzugehörigkeit wird pro
  Request aus `group_members` geprüft – so wirkt ein Rauswurf sofort,
  ohne Cookie-Invalidierung.
- Der Client sendet die aktive Gruppe explizit mit
  (`GET /api/data?group=g-…`); der Server prüft `readSessionUserId` +
  Mitgliedschaft und antwortet sonst 401/403.
- **`GET /api/data` verliert den anonymen Vollzugriff** (heute: kompletter
  Dump ohne Login). Der Login-Screen braucht keine Daten mehr.
- **Namens-Eindeutigkeit wird von global auf „weich“ umgestellt:**
  `isNameTaken` fliegt aus der Registrierung raus. Duplikate innerhalb
  einer Gruppe sind erlaubt (Avatar-Farbe unterscheidet); optional warnt
  die Join-UI. Die Alt-Account-Übernahme (`findAdoptableUser`) bleibt wie
  heute auf Nutzer ohne Passkey beschränkt und ist später ersatzlos
  streichbar.
- **Admin (`/admin`) bleibt global** (Betreiber-Tool, ein Passwort),
  arbeitet aber pro Festival (Blueprint-Editor mit Festival-Umschalter).

---

## 6. API

### Neue Routen

| Route | Zweck |
| --- | --- |
| `GET  /api/festivals` | Liste für die Gruppengründung: `[{ id, name, edition, hasLineup }]`. |
| `POST /api/groups` | Gruppe erstellen `{ name, festivalId }` → Ersteller wird `owner`+Mitglied, `invite_code` wird generiert und zurückgegeben. |
| `GET  /api/groups/mine` | Meine Mitgliedschaften (für Gate + späteren Switcher): `[{ id, name, festivalId, hasImage, role, memberCount }]`. |
| `POST /api/groups/join` | Beitritt per Code: `{ code }` – egal ob aus Link oder abgetippt (normalisiert Groß-/Kleinschreibung und Bindestriche). |
| `GET  /api/groups/preview?code=…` | Öffentliche Mini-Vorschau für die Join-Seite: Gruppenname, Bild, Festival, Mitgliederzahl. Bewusst ohne Mitgliederliste; nur per Code, nie per Gruppen-ID. |
| `PATCH /api/groups/[id]` | Owner: umbenennen, `invite_code` rotieren. |
| `POST /api/groups/[id]/image` | Owner: Gruppenbild hochladen; `GET` liefert es mit Cache-Headern. |
| `POST /api/groups/[id]/leave` | Gruppe verlassen (Sonderfall letzter Owner: s. §9). |
| `DELETE /api/groups/[id]/members/[userId]` | Owner entfernt ein Mitglied. |

### Geänderte Routen

- `GET /api/data?group=<id>`: prüft Session + Mitgliedschaft. Payload:
  - `timetable` = Timetable **des Gruppen-Festivals** (aus der DB) –
    für den Client transparent, der Payload-Vertrag bleibt gleich;
  - `users`/`selections`/`positions` = nur Gruppenmitglieder, Selections
    und Positionen gefiltert auf `festival_id` der Gruppe;
  - `blueprints` = nur die des Gruppen-Festivals;
  - neu: `group` (id, name, festivalId, hasImage, meine Rolle,
    Mitglieder mit Rolle, invite_code nur für Owner) für Header und
    Gruppen-Sheet.
- `POST /api/selection`, `POST /api/position`: bekommen `group` im Body;
  Server prüft Mitgliedschaft, validiert den Slot gegen den Timetable des
  Gruppen-Festivals und schreibt dessen `festival_id`. 403, wenn der
  Nutzer nicht (mehr) Mitglied ist.
- `GET /api/me`: liefert zusätzlich `groups` (= `mine`-Inhalt), damit der
  Client Gate-Entscheidung und aktive Gruppe in einem Roundtrip hat.
- `POST /api/admin/blueprint`: bekommt `festivalId` dazu.

---

## 7. Client & UI

### Neuer Gate-Flow (`src/app/page.tsx`)

```
ready?
 └─ user == null           → NameGate (unverändert, Passkey)
     └─ groups.length == 0 → GroupGate (NEU: erstellen oder Code eingeben)
         └─ sonst          → AppShell (mit aktiver Gruppe)
```

- **`GroupGate.tsx` (neu):** zwei Karten im bestehenden Metal-Look:
  - „Gruppe gründen“: Festival-Auswahl (aus `/api/festivals` – vorerst
    Wacken 2026 / Summer Breeze 2026), Gruppenname, optional Bild. Nach
    dem Anlegen direkt der „Lade Leute ein“-Screen mit Code + Teilen-Button.
  - „Gruppe beitreten“: ein Codefeld (`XXXX-XXXX`, tolerant bei
    Groß-/Kleinschreibung und Bindestrich) → Vorschau (Name, Bild,
    Festival, Mitgliederzahl) → „Beitreten“.
- **`/join/[code]/page.tsx` (neu):** Landing-Page des geteilten Links,
  zeigt via `preview` dieselbe Vorschau.
  - Schon eingeloggt → `POST /api/groups/join { code }`, aktive Gruppe
    setzen, redirect auf `/`.
  - Nicht eingeloggt → Code in `sessionStorage` (`fb.pendingInvite`)
    parken, NameGate durchlaufen (Passkey), danach automatisch beitreten.
    So überlebt die Einladung den Login-Umweg.
- **`AppShell.tsx`:** Header zeigt Gruppenbild (Mini-Avatar) + Gruppenname;
  Tap öffnet ein **Gruppen-Sheet** (neu, Stil wie `BandSheet`):
  Mitgliederliste, Code anzeigen + „Link teilen“, verlassen; für Owner
  zusätzlich umbenennen, Bild ändern, Code rotieren, Mitglieder entfernen.
  Tages-Tabs, Bühnen etc. speisen sich weiter aus `data.timetable` –
  funktioniert für jedes Festival automatisch.
- **`NameGate.tsx`:** Wacken-/Crew-Branding generalisieren („X von 17“
  raus, W:O:A-Datumszeile wird festivalneutral bzw. wandert in
  GroupGate/AppShell).

### Store & Sync

- `store.tsx`: neuer State `groups: GroupSummary[]` + `activeGroupId`
  (persistiert als `fb.group.v1`); `me`-Check füllt beides. Nach
  Erstellen/Beitreten: `setActiveGroup(id)` + `refresh()`.
- `sync.ts`: `fetchData()` hängt `?group=<activeGroupId>` an; Daten-Cache
  wird gruppenspezifisch (`fb.data.v1:<groupId>` – enthält damit implizit
  das richtige Festival). Mutationen (`payloadFor`) bekommen `group` dazu;
  Queue-Mechanik bleibt unverändert.
- Antwortet `/api/data` mit 403 (aus der Gruppe entfernt / Gruppe
  gelöscht): aktive Gruppe verwerfen, zurück ins GroupGate.

### PWA / Service Worker (`public/sw.js`)

- `VERSION` bumpen; `/join/*` **nicht** precachen (läuft über die
  bestehende network-first-Navigations-Strategie).
- `/api/data`-Cache keyt auf die volle URL (inkl. `?group=`) – pro Gruppe
  ein Cache-Eintrag, kein neuer Code, nur verifizieren.
- `/api/groups/*/image` in die stale-while-revalidate-Assets aufnehmen.

---

## 8. Gruppenbild

- **Speicherort: Postgres (`BYTEA`)** – Vercel Serverless hat kein
  beschreibbares Dateisystem, und ein Blob-Storage wäre eine neue
  Abhängigkeit für ein einzelnes kleines Bild pro Gruppe.
- **Client verkleinert vor dem Upload** (Canvas: max. 512×512, WebP/JPEG,
  Ziel < 150 KB). Server erzwingt hartes Limit (300 KB) und MIME-Allowlist
  (`image/webp`, `image/jpeg`, `image/png`); ausgeliefert mit korrektem
  `Content-Type` + `Cache-Control: immutable` und Versions-Query (`?v=`).
- Fallback ohne Bild: Initialen-Avatar in deterministischer Farbe (analog
  `colorForName` aus `src/lib/ids.ts`).

---

## 9. Sicherheit

- **Invite-Code:** `randomBytes` → Crockford-Base32, 8 Zeichen (~40 Bit).
  Kein Ablauf, aber Owner-Rotation. Vorschau/Join nur per Code, nie per
  Gruppen-ID → keine Gruppen-Enumeration.
- **Brute-Force-Bremse** auf `POST /api/groups/join` und
  `GET /api/groups/preview`: kleiner In-Memory-Zähler pro IP (best effort
  auf Serverless – bewusste Abwägung, für den Anwendungsfall genug; bei
  ~1 Mrd. möglichen Codes und wenigen hundert Gruppen ist Raten
  aussichtslos).
- **Einheitliche Fehlermeldung** („Code ungültig“) – nicht verraten, ob es
  die Gruppe gibt.
- **Autorisierung serverseitig:** jede Gruppen-Mutation prüft Rolle aus
  `group_members`, nie aus dem Client-State. `invite_code` steht nur im
  Payload von Mitgliedern (Anzeige im Sheet), niemals in `preview`.

---

## 10. Offene Entscheidungen (mit Empfehlung)

| Frage | Empfehlung |
| --- | --- |
| Code sichtbar für alle Mitglieder oder nur Owner? | **Alle Mitglieder** – jeder soll Leute einladen können („Link teilen“ im Sheet); rotieren darf nur der Owner. |
| Letzter Owner verlässt die Gruppe | Nur möglich, wenn die Gruppe leer ist (dann löschen); sonst erst Owner-Rolle übertragen. |
| Gruppe löschen | Owner-Aktion mit Bestätigung; `ON DELETE CASCADE` räumt Mitgliedschaften ab. Selections/Positions bleiben (hängen an Nutzer+Festival, nicht an der Gruppe). |
| Feuerrahmen (`HOT_SLOT_THRESHOLD = 5`) | Bleibt fix; bei Mini-Gruppen greift er nie – akzeptabel, später ggf. relativ zur Gruppengröße. |
| `sb2026` ohne Lineup gründen lassen? | Ja – Gruppe kann warten; App zeigt „Lineup folgt“, Import füllt später. |
| Festival-Anlage im Admin-Panel? | Nicht im ersten Wurf – Festivals kommen per Seed/Import-Script; Admin-UI dafür ist ein Folge-Feature. |

---

## 11. Umsetzungs-Etappen

Jede Etappe ist einzeln deploybar und lässt die Bestands-Crew ungestört:

1. **Schema & Migration** – Tabellen `festivals`/`groups`/`group_members`,
   `festival_id`-Spalten + PK-Umbau auf `selections`/`positions`/
   `blueprints`, Seed `woa2026` (aus Bundle-JSON) + `sb2026` (Gerüst),
   Default-Gruppe für die Bestands-Crew. Verhalten identisch zu heute.
2. **Festival-Layer** – `getTimetable(festivalId)` aus der DB (mit Cache),
   `scripts/import-festival.mjs` (UPSERT in die DB, Wacken-Parser
   wiederverwendet), `GET /api/festivals`. Ab hier: Lineup-Update ohne
   Redeploy.
3. **Gruppen-API** – create (mit Festivalwahl) / join per Code / mine /
   preview / patch (rename, Code-Rotation) / leave / kick;
   `/api/data` gescopet + auth-pflichtig; `isNameTaken` raus;
   `/api/me` erweitert; Rate-Limit.
4. **Client-Gate & Join-Link** – GroupGate (Festival-Picker, Codefeld mit
   Vorschau), `/join/[code]`, Pending-Invite über den Login hinweg,
   Store/Sync mit `activeGroupId`, gruppenspezifischem Cache-Key und
   `group` in Mutationen.
5. **Gruppen-Sheet & Verwaltung** – Header, Mitgliederliste, Code +
   Teilen-Button, Owner-Funktionen (umbenennen, Code rotieren, Kick).
6. **Gruppenbild** – Upload (Client-Resize), Auslieferung, Avatare/Fallback.
7. **Feinschliff** – Admin-Panel mit Festival-Umschalter, SB-Import
   (Clashfinder-Quelle), SW-Version, Offline-Tests (Gruppenwechsel,
   403-Handling), README/API-Tabelle, Texte entkrewen/entwackenisieren.

Geschätzte Reihenfolge der Aufwände: 3 ≈ 4 > 1 ≈ 2 > 5 > 7 > 6.
