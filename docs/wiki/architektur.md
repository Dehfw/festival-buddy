# Architektur & Datenmodell

Next.js 15 (App Router) + React 19 + TypeScript, PostgreSQL über `pg`,
Tailwind CSS 4. Es gibt keinen separaten Backend-Dienst: Alle
API-Routen liegen unter `src/app/api/**`, die gesamte Datenschicht in
**`src/lib/db.ts`**, die gemeinsamen Typen und Helfer in
**`src/lib/types.ts`**.

## Mandanten-Modell

Das zentrale Konzept, an dem fast jedes Verhalten der App hängt:

- Eine **Gruppe gehört zu genau einem Festival** (`groups.festival_id`).
- Ein **Nutzer kann in mehreren Gruppen** sein (auch verschiedener
  Festivals).
- **Teilnahmen (`selections`) und Positionen (`positions`) hängen am
  Nutzer + Festival, nicht an der Gruppe.** Ob ich zu einer Band gehe,
  ist eine Eigenschaft von mir – sichtbar ist das in allen Gruppen
  dieses Festivals, in denen ich Mitglied bin. Slot-IDs
  (`tag-buehne-bandslug`) sind nur pro Festival eindeutig, deshalb
  tragen beide Tabellen eine `festival_id`.

Was eine Gruppe sieht, entscheidet immer der Join gegen
`group_members`: `getState()` (hinter `GET /api/data`) liefert
ausschließlich Mitglieder der Gruppe sowie deren Teilnahmen/Positionen
für das Festival der Gruppe. Wer nicht (mehr) Mitglied ist, taucht im
Payload schlicht nicht auf – Details in [Gruppen](gruppen.md).

## Tabellen

| Tabelle | Schlüssel | Inhalt |
| --- | --- | --- |
| `users` | `id` | Anzeigename + Avatarfarbe; Identität hängt am Passkey |
| `webauthn_credentials` | `id` (Credential-ID) | Public Key, Signatur-Zähler, Transports; `ON DELETE CASCADE` am Nutzer |
| `festivals` | `id` | Name/Edition + kompletter Timetable als **JSONB** |
| `groups` | `id` | Festival, Name, Einladungscode (UNIQUE), Feuerrahmen-Schwelle, Gruppenbild (BYTEA) |
| `group_members` | `(group_id, user_id)` | Rolle (`owner`/`admin`/`member`) + Beitrittszeit; CASCADE zu Gruppe und Nutzer |
| `selections` | `(user_id, festival_id, slot_id)` | Band-Teilnahme mit Status `going`/`interested`; CASCADE am Nutzer |
| `positions` | `(user_id, festival_id, slot_id)` | ✕-Marker (Prozent-Koordinaten) + `updated_at`; CASCADE am Nutzer |
| `blueprints` | `(festival_id, stage_id)` | Bühnen-Grundriss + POIs als JSONB |

Dazu die Sequenz `db_rev` als globaler **Revisionszähler**: Jede
Mutation ruft `bumpRev()` auf, der aktuelle Stand wird im Daten-Payload
als `rev` mitgeliefert. Er ist bewusst global (nicht pro Gruppe) –
billig, und der gepollte Payload ist ohnehin klein und gruppengescopet.

## Schema-Anlage & Migration

`createSchema()` in `src/lib/db.ts` läuft **beim ersten DB-Zugriff pro
Prozess** und ist idempotent (`CREATE TABLE IF NOT EXISTS`,
`ALTER TABLE … ADD COLUMN IF NOT EXISTS`, PK-Umbauten in einem
`DO`-Block). Ein Postgres-**Advisory-Lock** verhindert, dass parallele
Serverless-Cold-Starts das Schema gleichzeitig anlegen. Danach wird
geseedet: Wacken-Timetable aus `data/timetable.json`, Summer Breeze als
Gerüst, Default-Blueprints – und Bestandsnutzer aus der Zeit vor dem
Gruppen-Feature landen einmalig in der Default-Gruppe „DEFEKT"
(`DEFAULT_GROUP_NAME`), das älteste Mitglied wird Owner.

## Verbindung

Der `pg`-Pool wird global gecacht (Hot-Reload/Lambda-Wiederverwendung
soll keine Verbindungen leaken). `DATABASE_URL` oder `POSTGRES_URL`
werden erkannt; `sslmode` aus der URL wird explizit in eine
pg-SSL-Config übersetzt (`require`/`verify-*` = TLS mit Prüfung,
`no-verify` = ohne, `disable` = kein TLS).
