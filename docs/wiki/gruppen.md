# Gruppen

Gruppen sind die Mandanten der App: Jede Gruppe gehört zu **genau einem
Festival** und sieht nur ihre eigenen Mitglieder samt deren Teilnahmen
und Positionen. Verwaltet wird alles auf `/gruppe`; die API-Routen
liegen unter `src/app/api/groups/`, die Datenschicht in
`src/lib/db.ts`.

## Rollen

| Rolle | Rechte |
| --- | --- |
| `owner` | Gründer. Alles, was Admins dürfen – und er ist **unantastbar**: kann weder entfernt noch degradiert werden. Owner wird man nur durch Nachrücken (s. u.). |
| `admin` | Gruppe umbenennen, Gruppenbild setzen, Einladungscode rotieren, Feuerrahmen-Schwelle einstellen, Mitglieder entfernen, Admins ernennen/degradieren. |
| `member` | Mitmachen (Teilnahmen, Positionen), Code sehen und Leute einladen. |

Der Helfer `isGroupAdmin()` (`src/lib/types.ts`) fasst Owner + Admin
zusammen; die Rechteprüfung passiert in den jeweiligen Routen, die
Owner-Sonderstellung zusätzlich in der Datenschicht (`role <> 'owner'`
in `removeMember`/`setMemberRole` – doppelter Boden).

## Einladungscodes & Beitritt

Pro Gruppe gibt es **einen mehrfach nutzbaren Einladungscode**:
8 Zeichen Crockford-Base32 ohne Verwechsler-Zeichen (kein I, L, O, U),
angezeigt als `XXXX-XXXX`, teilbar als Link `/join/<code>` oder zum
Abtippen. Eingaben werden tolerant normalisiert
(`normalizeInviteCode`: Großschreibung, Bindestriche egal, O→0,
I/L→1). Admins können den Code **rotieren**; alte Links sind dann
sofort ungültig. Der Beitritt (`POST /api/groups/join`) ist idempotent
(`ON CONFLICT DO NOTHING`) – wer schon Mitglied ist, bleibt es einfach.
Die Join-Seite zeigt vorab eine öffentliche Mini-Vorschau
(`GET /api/groups/preview?code=…` – bewusst nur per Code, nie per
Gruppen-ID).

## Gruppe verlassen (`POST /api/groups/[id]/leave`)

`leaveGroup()` läuft als Transaktion:

1. Eigene Mitgliedschaft löschen.
2. **Letztes Mitglied weg?** → Gruppe wird mitgelöscht
   (`ON DELETE CASCADE` räumt Restmitgliedschaften ab).
3. **Kein Owner mehr übrig?** → Nachrücken: der dienstälteste Admin
   wird Owner, gibt es keinen, das dienstälteste Mitglied. Keine
   hängenden Gruppen, kein Blockieren.

## Mitglied entfernen (`DELETE /api/groups/[id]/members/[userId]`)

Nur Owner/Admins; sich selbst entfernt man über `/leave`, der Owner
kann nie entfernt werden. `removeMember()` löscht **nur die Zeile in
`group_members`**.

### Was passiert mit den Teilnahmen des Entfernten?

Kurzfassung: **Aus Sicht der Gruppe verschwinden sie sofort – in der
Datenbank bleiben sie absichtlich bestehen.**

- `getState()` (hinter `GET /api/data`) joint Teilnahmen und Positionen
  immer gegen `group_members` – geliefert wird nur, was aktuellen
  Mitgliedern gehört. Nach dem Entfernen sind der Nutzer und alle
  seine Einträge beim nächsten Poll (alle 7 s) aus der Gruppenansicht
  verschwunden.
- Der Entfernte selbst bekommt beim nächsten Poll **403**, sein Client
  verwirft den lokalen Cache der Gruppe und landet zurück im
  Gruppen-Gate. Schreiben kann er auch nichts mehr –
  `POST /api/selection`/`/api/position` prüfen die Mitgliedschaft.
- In der DB bleiben `selections`/`positions` erhalten, denn sie hängen
  am **Nutzer + Festival, nicht an der Gruppe** (siehe
  [Architektur](architektur.md)). Das ist eine bewusste
  Design-Entscheidung mit zwei gewollten Konsequenzen:
  1. Ist der Nutzer in einer **zweiten Gruppe desselben Festivals**,
     sieht die seine Teilnahmen weiterhin. Hartes Löschen beim
     Entfernen würde ihm die Daten auch dort wegnehmen.
  2. Tritt er der Gruppe später wieder bei, sind seine Teilnahmen
     wieder da.
- Endgültig gelöscht wird erst mit dem Nutzer-Account selbst – dann
  räumt `ON DELETE CASCADE` Teilnahmen, Positionen und
  Passkey-Credentials mit ab.

Dasselbe gilt beim freiwilligen Verlassen und beim Löschen der Gruppe
(letztes Mitglied geht): Teilnahmen/Positionen bleiben am Nutzer.

## Rollen ändern (`PATCH /api/groups/[id]/members/[userId]`)

Owner/Admins setzen `{ role: 'admin' | 'member' }`. Die eigene Rolle
lässt sich nicht ändern (dafür gibt es `/leave` bzw. das Nachrücken),
der Owner ist ausgenommen.

## Gruppenbild & Einstellungen

- `PATCH /api/groups/[id]`: umbenennen, Feuerrahmen-Schwelle
  (`hot_threshold`, 0 = aus), Code rotieren.
- `POST /api/groups/[id]/image`: Gruppenbild – clientseitig auf 512 px
  verkleinert, als BYTEA in der DB; `image_version` zählt hoch und
  dient als Cache-Buster für `GET …/image`.
