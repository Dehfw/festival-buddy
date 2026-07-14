# Plan: Mandantenfähigkeit über Gruppen

Ziel: Aus der Ein-Crew-App (fest verdrahtete 17er-Crew) wird eine
Mehr-Gruppen-App. Nach dem Passkey-Login kann man

1. eine **Gruppe erstellen** (Name, optionales Gruppenbild, Passwort),
2. einer **passwortgeschützten Gruppe beitreten**,
3. die Gruppe **per Einladungslink teilen** (Link genügt, kein Passwort),
4. Gruppen einen **Namen** und ein **Gruppenbild** geben.

Timetable, Bühnen-Blueprints und POIs bleiben global – das Festivalgelände
ist für alle Gruppen dasselbe. Mandantenfähig werden nur die **Personen-Daten**:
wer ist sichtbar, wessen Auswahlen und Positionen man sieht.

---

## 1. Ist-Zustand (Kurzfassung)

| Baustein | Heute | Problem für Mandantenfähigkeit |
| --- | --- | --- |
| `src/lib/db.ts` | Tabellen `users`, `selections`, `positions`, `webauthn_credentials`, `blueprints`, Sequenz `db_rev`. Schema wird idempotent in `createSchema()` angelegt. | Kein Gruppenkonzept; alle Nutzer sehen alle. |
| `GET /api/data` | Liefert **alle** Nutzer/Auswahlen/Positionen, ohne Login-Prüfung. | Muss auf die eigene Gruppe gescopet und hinter die Session gelegt werden. |
| `src/lib/auth.ts` | Session-Cookie = HMAC-Token `{ uid }`. | Reicht als Identität; Gruppenzugehörigkeit kommt aus der DB, nicht ins Cookie. |
| Registrierung (`/api/webauthn/register/options`) | Name ist **global eindeutig** (`isNameTaken`). | Bei fremden Gruppen blockieren sich Unbekannte gegenseitig die Namen. |
| Client (`store.tsx`, `sync.ts`) | Ein globaler Datenstand, Poll alle 7 s, Offline-Cache/Queue in `localStorage`. | Cache/Fetch brauchen Gruppen-Scope; Gate-Logik kennt nur „eingeloggt ja/nein“. |
| UI (`page.tsx` → `NameGate`/`AppShell`) | Nach Login direkt die App; Texte wie „X von 17 sind schon drin“. | Es fehlt der Zwischenschritt „Gruppe erstellen/beitreten“; Crew-spezifische Texte raus. |
| `public/sw.js` | Precacht `/` und `/admin`, cacht `/api/data`. | Neue Route `/join/[token]` und gruppenspezifischer Daten-Cache. |

Wichtig fürs Datenmodell: `selections`/`positions` hängen **am Nutzer**, nicht
an einer Gruppe. Das kann so bleiben – ob ich zur Band gehe, ist eine
Eigenschaft von mir, nicht der Gruppe. Gescopet wird nur die **Sichtbarkeit**
(nur Mitglieder meiner Gruppe tauchen im Payload auf). Dadurch braucht es
keine Migration der Bestandsdaten in den Tabellen `selections`/`positions`.

---

## 2. Datenmodell

Neue Tabellen (idempotent in `createSchema()` ergänzen, wie bei den
bestehenden `ALTER TABLE … IF NOT EXISTS`-Migrationen):

```sql
CREATE TABLE IF NOT EXISTS groups (
  id            TEXT PRIMARY KEY,            -- 'g-' || randomUUID()
  name          TEXT NOT NULL,               -- 2–40 Zeichen
  password_hash TEXT,                        -- scrypt; NULL = nur per Link beitretbar
  invite_token  TEXT NOT NULL UNIQUE,        -- 128 Bit base64url, rotierbar
  image         BYTEA,                       -- Gruppenbild (klein, s. §6)
  image_mime    TEXT,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id  TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member',     -- 'owner' | 'member'
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS group_members_user_idx ON group_members (user_id);
```

Entscheidungen dazu:

- **Mehrere Gruppen pro Nutzer:** Das Schema (n:m über `group_members`)
  erlaubt es von Anfang an – das kostet nichts extra. Die UI startet mit
  „eine aktive Gruppe“ (Client merkt sich `activeGroupId` in
  `localStorage`); ein Gruppen-Switcher ist damit später reine UI-Arbeit.
- **Selections/Positions bleiben nutzerbezogen.** Wer in zwei Gruppen ist,
  hat in beiden dieselben Band-Zusagen – fachlich korrekt (man kann nur
  einmal bei der Band stehen).
- **Rollen minimal:** `owner` (Ersteller) darf umbenennen, Bild/Passwort
  ändern, Link rotieren, Mitglieder entfernen. Alles andere ist `member`.
  Kein weiteres Rechtemodell.
- **`db_rev` bleibt vorerst global.** Ein globaler Zähler löst zwar Polls in
  fremden Gruppen aus, aber der Payload ist ohnehin gruppengescopet und
  klein. Optimierung „rev pro Gruppe“ (Spalte `groups.rev`) erst, wenn es
  spürbar wird – dann müssen Mutationen die Revs **aller** Gruppen des
  Nutzers bumpen.

### Migration der Bestandsdaten

Beim ersten Schemalauf nach dem Deploy (in `createSchema()`, unter dem
bestehenden Advisory-Lock):

1. Existiert noch keine Gruppe **und** gibt es Nutzer → Default-Gruppe
   anlegen (Name z. B. aus `DEFAULT_GROUP_NAME`, Fallback „W:O:A Crew 2026“),
   `invite_token` generieren, Passwort leer (Beitritt nur per Link).
2. Alle vorhandenen Nutzer als Mitglieder eintragen; ältester Nutzer
   (`ORDER BY created_at`) wird `owner`.
3. Idempotent halten (`INSERT … ON CONFLICT DO NOTHING` bzw. nur ausführen,
   wenn `groups` leer ist) – parallele Cold-Starts sind durch den
   Advisory-Lock schon abgedeckt.

Damit verhält sich die App nach dem Deploy für die bestehende Crew exakt
wie vorher – niemand muss etwas tun.

---

## 3. Auth & Scoping

- **Session-Cookie unverändert** (`{ uid }`). Die Gruppenzugehörigkeit steckt
  nicht im Token, sondern wird pro Request aus `group_members` geprüft –
  so kann man Mitglieder entfernen, ohne dass alte Cookies weiter Zugriff
  geben.
- Der Client sendet die aktive Gruppe explizit mit
  (`GET /api/data?group=g-…`); der Server prüft `readSessionUserId` +
  Mitgliedschaft und antwortet sonst 401/403.
- **`GET /api/data` verliert den anonymen Vollzugriff.** Ohne gültige
  Session bzw. ohne Mitgliedschaft: 401/403 statt Komplett-Dump. (Der
  Login-Screen braucht keine Daten mehr; der „X von 17“-Text in
  `NameGate.tsx` entfällt, s. §5.)
- **Namens-Eindeutigkeit wird von global auf „weich“ umgestellt:**
  `isNameTaken` (global) fliegt aus der Registrierung raus – sonst blockieren
  sich fremde Gruppen gegenseitig die Vornamen. Duplikate innerhalb einer
  Gruppe sind erlaubt und werden per Avatar-Farbe unterschieden; optional
  warnt die Join-UI („In dieser Gruppe gibt es schon einen Daniel“).
  Die Alt-Account-Übernahme (`findAdoptableUser`) bleibt für die
  Übergangszeit bestehen, wird aber auf Nutzer **ohne Gruppenbild-Ära-Kontext**
  beschränkt: übernehmen darf nur, wer den Namen exakt trifft und der
  Alt-Account keinen Passkey hat (wie heute). Später ersatzlos streichbar.
- **Admin (`/admin`, Blueprints, POIs) bleibt global** – ein Betreiber-Tool,
  kein Gruppen-Feature.

---

## 4. API

### Neue Routen

| Route | Zweck |
| --- | --- |
| `POST /api/groups` | Gruppe erstellen `{ name, password? }` → legt Gruppe an, Ersteller wird `owner`+Mitglied, generiert `invite_token`. |
| `GET  /api/groups/mine` | Meine Mitgliedschaften (für Gate + späteren Switcher): `[{ id, name, hasImage, role, memberCount }]`. |
| `POST /api/groups/join` | Beitritt: `{ token }` (Einladungslink) **oder** `{ groupId, password }` (manuell). |
| `GET  /api/groups/preview?token=…` | Öffentliche Mini-Vorschau für die Join-Seite: Name, Bild, Mitgliederzahl. Bewusst ohne Mitgliederliste. |
| `PATCH /api/groups/[id]` | Owner: umbenennen, Passwort setzen/ändern/entfernen, `invite_token` rotieren. |
| `POST /api/groups/[id]/image` | Owner: Gruppenbild hochladen (s. §6). `GET` liefert das Bild mit Cache-Headern. |
| `POST /api/groups/[id]/leave` | Gruppe verlassen. Letzter Owner muss vorher übergeben oder die Gruppe wird gelöscht (Entscheidung s. §8). |
| `DELETE /api/groups/[id]/members/[userId]` | Owner entfernt ein Mitglied. |

**Beitrittslogik** (Empfehlung): Der **Link ist selbst das Geheimnis** –
wer den Token hat, darf rein, ohne Passwort. Das Passwort ist der zweite,
manuelle Weg („Gruppen-ID/Name + Passwort eintippen“), z. B. wenn man den
Link nicht teilen will. Vorteil: Link-Teilen bleibt Ein-Klick (WhatsApp),
und ein geleakter Link ist per Token-Rotation sofort entwertbar.

### Geänderte Routen

- `GET /api/data?group=<id>`: prüft Session + Mitgliedschaft; `users`,
  `selections`, `positions` werden per Join auf `group_members` gefiltert
  (`getState(groupId)` in `db.ts`). `timetable`, `blueprints`, `rev`,
  `serverTime` bleiben wie gehabt. Zusätzlich im Payload: `group`
  (id, name, hasImage, meine Rolle, Mitglieder mit Rolle) für Header und
  Settings-Sheet.
- `POST /api/selection`, `POST /api/position`: bleiben nutzerbezogen und
  unverändert im Vertrag. Einzige Ergänzung: 403, wenn der Nutzer in
  **keiner** Gruppe ist (Karteileichen sollen nicht ins Leere schreiben).
- `GET /api/me`: liefert zusätzlich `groups` (= `/api/groups/mine`-Inhalt),
  damit der Client Gate-Entscheidung und aktive Gruppe in einem Roundtrip
  hat.

---

## 5. Client & UI

### Neuer Gate-Flow (`src/app/page.tsx`)

```
ready?
 └─ user == null           → NameGate (unverändert, Passkey)
     └─ groups.length == 0 → GroupGate (NEU: erstellen oder beitreten)
         └─ sonst          → AppShell (mit aktiver Gruppe)
```

- **`GroupGate.tsx` (neu):** zwei Karten im bestehenden Metal-Look –
  „Gruppe gründen“ (Name, optional Bild, optional Passwort) und
  „Gruppe beitreten“ (Code/ID + Passwort). Kommt man mit gemerktem
  Invite-Token an (s. u.), wird stattdessen direkt die Beitritts-Bestätigung
  gezeigt.
- **`/join/[token]/page.tsx` (neu):** Landing-Page des geteilten Links.
  Zeigt via `/api/groups/preview` Gruppenname, Bild, Mitgliederzahl und
  einen Beitreten-Button.
  - Schon eingeloggt → `POST /api/groups/join { token }`, aktive Gruppe
    setzen, redirect auf `/`.
  - Nicht eingeloggt → Token in `sessionStorage` (`fb.pendingInvite`)
    parken, NameGate durchlaufen (Passkey-Registrierung/-Login), danach
    automatisch beitreten. So überlebt die Einladung den Login-Umweg.
- **Teilen:** Im Gruppen-Sheet ein „Link teilen“-Button →
  `navigator.share` (Mobile) mit Fallback Zwischenablage; QR-Code optional
  (nice-to-have, clientseitig generierbar).
- **`AppShell.tsx`:** Header zeigt statt nur Logo auch Gruppenbild
  (Mini-Avatar) + Gruppenname; Tap darauf öffnet ein **Gruppen-Sheet**
  (neu, Stil wie `BandSheet`): Mitgliederliste mit Avataren, Link teilen,
  verlassen; für Owner zusätzlich umbenennen, Bild ändern, Passwort,
  Link rotieren, Mitglieder entfernen.
- **`NameGate.tsx`:** Crew-Texte generalisieren („X von 17 sind schon
  drin“ raus – die Zahl gäbe ohne Login ohnehin keine Daten mehr her).

### Store & Sync

- `store.tsx`: neuer State `groups: GroupSummary[]` + `activeGroupId`
  (persistiert als `fb.group.v1`); `loginAs`/`me`-Check füllt beides.
  Nach Erstellen/Beitreten: `setActiveGroup(id)` + `refresh()`.
- `sync.ts`: `fetchData()` hängt `?group=<activeGroupId>` an; der
  Daten-Cache-Key wird gruppenspezifisch (`fb.data.v1:<groupId>`), damit
  ein Gruppenwechsel offline nicht die falschen Leute zeigt. Queue bleibt
  wie sie ist (Mutationen sind nutzerbezogen).
- Antwortet `/api/data` mit 403 (aus der Gruppe entfernt): aktive Gruppe
  verwerfen, zurück ins GroupGate.

### PWA / Service Worker (`public/sw.js`)

- `VERSION` bumpen; `/join/*` **nicht** precachen (dynamisch, network-first
  mit Page-Cache-Fallback reicht über die bestehende Navigations-Strategie).
- `/api/data`-Cache funktioniert weiter, da der Cache-Key die Query-URL
  (inkl. `?group=`) enthält – pro Gruppe ein Cache-Eintrag, kein Code nötig,
  nur verifizieren.
- `/api/groups/*/image` in die stale-while-revalidate-Assets aufnehmen.

---

## 6. Gruppenbild

- **Speicherort: Postgres (`BYTEA`)** – die App läuft auf Vercel Serverless
  ohne beschreibbares Dateisystem, und ein Blob-Storage-Dienst wäre eine
  neue Abhängigkeit für ein einzelnes kleines Bild pro Gruppe.
- **Client verkleinert vor dem Upload** (Canvas: max. 512×512, WebP/JPEG,
  Ziel < 150 KB). Server erzwingt hartes Limit (z. B. 300 KB) und
  MIME-Allowlist (`image/webp`, `image/jpeg`, `image/png`) – Bytes werden
  nicht interpretiert, nur gespeichert und mit korrektem `Content-Type` +
  `Cache-Control` (immutable + Versions-Query, z. B. `?v=<rev>`) wieder
  ausgeliefert.
- Fallback ohne Bild: Initialen-Avatar in Gruppenfarbe (analog
  `colorForName` aus `src/lib/ids.ts`).

---

## 7. Sicherheit

- **Passwort-Hashing mit `scrypt`** aus Node `crypto` (kein neues Paket;
  bcrypt-Abhängigkeit vermeiden). Format `scrypt$<salt>$<hash>`,
  Vergleich mit `timingSafeEqual` (Muster existiert schon in `auth.ts`).
- **Invite-Token:** 16 Bytes `randomBytes` → base64url (~22 Zeichen).
  Rotation durch Owner entwertet alte Links sofort.
- **Brute-Force-Bremse** auf `POST /api/groups/join` mit Passwort:
  kleiner In-Memory-Zähler pro IP+Gruppe (best effort auf Serverless;
  ausreichend für den Anwendungsfall, im Plan als bewusste Abwägung
  dokumentieren).
- **Enumeration vermeiden:** `preview` nur per Token, nie per ID;
  Fehlermeldungen beim Join unterscheiden nicht zwischen „Gruppe gibt es
  nicht“ und „Passwort falsch“.
- **Autorisierung serverseitig:** jede Gruppen-Mutation prüft Rolle aus
  `group_members`, nie aus dem Client-State.

---

## 8. Offene Entscheidungen (mit Empfehlung)

| Frage | Empfehlung |
| --- | --- |
| Link-Beitritt ohne Passwort? | **Ja** – Token ist das Geheimnis, Passwort nur für manuellen Beitritt. |
| Mehrere Gruppen gleichzeitig in der UI? | Schema: ja; UI: erst eine aktive Gruppe, Switcher als Folge-Feature. |
| Letzter Owner verlässt die Gruppe | Einfachste Regel: geht nur, wenn die Gruppe leer ist (dann löschen); sonst erst Owner-Rolle übertragen. |
| Feuerrahmen-Schwelle (`HOT_SLOT_THRESHOLD = 5`) | Bleibt fix; bei Mini-Gruppen (<5) greift er nie – akzeptabel, später ggf. relativ zur Gruppengröße. |
| Gruppe löschen | Owner-Aktion mit Bestätigung; `ON DELETE CASCADE` räumt Mitgliedschaften ab, Nutzer + deren Selections bleiben (hängen am Nutzer). |

---

## 9. Umsetzungs-Etappen

Jede Etappe ist einzeln deploybar und lässt die Bestands-Crew ungestört:

1. **Schema & Default-Gruppe** – Tabellen, Migration, `getState(groupId)`,
   alles noch unsichtbar (Client sendet noch kein `?group=`, Server nimmt
   dann die einzige Gruppe des Nutzers). Verhalten identisch zu heute.
2. **API** – groups create/join/leave/mine/preview/patch, `/api/data`
   scoped + auth-pflichtig, `isNameTaken` raus, `/api/me` erweitert.
3. **Client-Gate & Join-Link** – GroupGate, `/join/[token]`, Pending-Invite
   über den Login hinweg, Store/Sync mit `activeGroupId` und
   gruppenspezifischem Cache-Key.
4. **Gruppen-Sheet & Verwaltung** – Header, Mitgliederliste, Teilen-Button,
   Owner-Funktionen (umbenennen, Passwort, Token-Rotation, Kick).
5. **Gruppenbild** – Upload (Client-Resize), Auslieferung, Avatare/Fallback.
6. **Feinschliff** – SW-Version, Offline-Tests (Gruppenwechsel offline,
   403-Handling), README/API-Tabelle aktualisieren, Texte entkrewen.

Geschätzte Reihenfolge der Aufwände: 2 > 3 > 4 ≈ 1 > 5 > 6.
