# Login & Passkeys

Kein Passwort, kein externer Identity-Provider: Die Identität eines
Nutzers hängt an seinem **Passkey** (WebAuthn, `@simplewebauthn`), der
Name ist nur Anzeigename. Serverseitig steckt die gesamte Auth-Schicht
in **`src/lib/auth.ts`**, die vier WebAuthn-Routen liegen unter
`src/app/api/webauthn/`.

## Registrierung & Login

- **Registrierung** (`register/options` → `register/verify`): Name
  eintippen, Passkey anlegen. Der Server legt den Nutzer an und bindet
  das Credential (Public Key, Signatur-Zähler) daran.
- **Login** (`login/options` → `login/verify`): discoverable
  Credentials + **Conditional UI** – das Gerät bietet den Passkey am
  Namensfeld von selbst an. Für fremde Geräte gibt es den
  QR-Code-Flow des Betriebssystems. Nach erfolgreichem Login wird der
  Signatur-Zähler fortgeschrieben (Replay-Schutz).
- Passkeys syncen über iCloud-Schlüsselbund bzw. Google
  Passwortmanager. Achtung: Sie sind an die **Domain (RP ID)**
  gebunden – Domain-Umzug macht bestehende Passkeys unbrauchbar.

## Sessions & Cookies

WebAuthn-Challenges sind HMAC-signierte, ablaufende Tokens in
`httpOnly`-Cookies (`sealToken`/`openToken` in `src/lib/auth.ts`). Das
Session-Cookie (`fb_session`) trägt dagegen nur eine `sid`; die
eigentliche Gültigkeit steht server-seitig in der **`sessions`-Tabelle**
(`src/lib/db.ts`) – Ablauf, Widerruf (Logout) und Inaktivität werden bei
jedem Request gegen diese Tabelle geprüft (`touchSession`), nicht mehr
nur gegen die Signatur des Cookies. Ein vor dem Logout kopiertes Cookie
ist damit sofort nach `POST /api/logout` ungültig, egal wie lange sein
HMAC-Ablauf noch liefe.

| Cookie | Zweck | Laufzeit |
| --- | --- | --- |
| `fb_session` | Nutzer-Session (`{ sid }`, Rest steht in `sessions`) | 180 Tage Maximum, 30 Tage Inaktivität |
| `fb_wa_reg` / `fb_wa_auth` | WebAuthn-Challenge zwischen options- und verify-Request | 5 Minuten |

Der Signatur-Schlüssel kommt aus `AUTH_SECRET`; fehlt die Variable,
wird er deterministisch aus der `DATABASE_URL` abgeleitet, damit alle
Serverless-Instanzen denselben Schlüssel benutzen. Jede API-Route
liest die Nutzer-ID über `readSessionUserId(req)` – ungültige,
abgelaufene, widerrufene oder zu lange inaktive Sessions ergeben
schlicht `null` → 401. Antworten, die Session-Status oder -Cookies
tragen (Login, Logout, `/api/me`), setzen `Cache-Control: no-store`.

Die Relying-Party-Konfiguration (`WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN`,
sonst aus dem Request abgeleitet) kann nicht per gefälschtem Header
ausgehebelt werden: rpIdHash und Origin stecken signiert in der
Authenticator-Antwort und müssen zu den erwarteten Werten passen.

## Alt-Account-Übernahme (Legacy-Adoption)

Aus der Nur-Name-Ära können noch Accounts **ohne Passkey** existieren.
Registriert sich jemand mit exakt diesem Namen (case-insensitiv),
übernimmt er den Alt-Account samt Teilnahmen (`findAdoptableUser` in
`src/lib/db.ts`). Sobald ein Passkey am Account hängt, ist er nicht
mehr übernehmbar. Das ist ein bewusstes Migrations-Einfallstor – per
`LEGACY_NAME_ADOPTION=off` abschalten, sobald die ganze Crew ihren
Passkey hat.

## Logout

`POST /api/logout` widerruft die Session server-seitig
(`sessions.revoked_at`) und löscht danach das Cookie. Der Passkey
bleibt auf dem Gerät; der Client (`logout()` in
`src/lib/client/store.tsx`) wirft zusätzlich Nutzer, Gruppenliste und
aktive Gruppe aus dem localStorage.
