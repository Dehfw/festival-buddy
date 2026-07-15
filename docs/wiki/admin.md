# Admin-Panel

`/admin` (auch über das ⚙️ in der unteren Navigation) ist ein
**globales Betreiber-Tool** – es hängt an keiner Gruppe und hat mit den
Gruppen-Rollen (Owner/Admin) nichts zu tun.

## Login & Session

- Passwort über die Umgebungsvariable `ADMIN_PASSWORD`. **In
  Produktion fail closed:** ist sie nicht gesetzt, ist der
  Admin-Bereich deaktiviert – Login und Speichern werden abgelehnt.
  Nur in der lokalen Entwicklung greift der Fallback `wacken2026`.
- Nach dem Login (`POST /api/admin/login`) setzt der Server eine
  signierte `httpOnly`-Session (Cookie `fb_admin`, **12 h** gültig) –
  dieselbe Token-Mechanik wie beim Nutzer-Login (siehe
  [Login & Passkeys](auth-passkeys.md)). Das Passwort landet nie im
  Browser-Storage und wird nicht bei jedem Request mitgeschickt.
  „Abmelden" beendet die Session serverseitig.

## Was man dort macht

**Blueprints und POIs pro Festival pflegen** (oben umschalten):

- **Blueprints** sind die schematischen Bühnen-Grundrisse
  (`src/lib/types.ts`: `elements` wie Bühne/FOH/Barriere/Zelt in
  Prozent-Koordinaten), auf denen die Crew ihre ✕-Positionen setzt.
- **POIs** – Toiletten 🚻, Wasser 💧, Merch 🛍️, Erste Hilfe ⛑️,
  Eingänge 🚪 – werden platziert/verschoben/gelöscht und sind für alle
  Nutzer sichtbar.
- Gespeichert wird pro Bühne komplett: `POST /api/admin/blueprint`
  ersetzt den Blueprint (`(festival_id, stage_id)` in der Tabelle
  `blueprints`).

Bühnen **ohne gepflegten Grundriss** (z. B. frisch importiertes
Festival) bekommen zur Laufzeit einen generischen Default-Blueprint
(Bühne oben, FOH mittig, `defaultBlueprint()` in `src/lib/db.ts`),
damit die Karte in der App nie fehlt – der Admin passt ihn später an.
Festivals ganz ohne importiertes Lineup zeigen im Panel einen Hinweis
statt des Editors.
