# Login: Passkeys & E-Mail/Passwort

Kein externer Identity-Provider: Die Identität eines Nutzers hängt an
seinem **Passkey** (WebAuthn, `@simplewebauthn`) – oder alternativ an
**E-Mail + Passwort** –, der Name ist nur Anzeigename. Serverseitig
steckt die Session-/Token-Schicht in **`src/lib/auth.ts`**, die vier
WebAuthn-Routen liegen unter `src/app/api/webauthn/`, die fünf
Passwort-Routen unter `src/app/api/password/`. Beide Wege enden im
selben Session-Cookie; ein Konto kann beides gleichzeitig haben.

## Registrierung & Login

- **Registrierung** (`register/options` → `register/verify`): Name
  eintippen, Passkey anlegen. Der Server legt den Nutzer an und bindet
  das Credential (Public Key, Signatur-Zähler) daran.
- **Login** (`login/options` → `login/verify`): discoverable
  Credentials + **Conditional UI** – das Gerät bietet den Passkey am
  Namensfeld von selbst an. Für fremde Geräte gibt es den
  QR-Code-Flow des Betriebssystems. Nach erfolgreichem Login wird der
  Signatur-Zähler fortgeschrieben (Replay-Schutz).
- Die Conditional-Anfrage läuft nur, solange das Passkey-Formular
  sichtbar ist: Beim Wechsel aufs E-Mail+Passwort-Formular (oder beim
  Schließen des Login-Panels) bricht `cancelPendingPasskey()` sie ab.
  Bleibt sie hängen, bremst iOS/WebKit (auch Chrome auf iOS) jeden
  Tastenanschlag in den Passwort-Feldern mit einer AutoFill-Abfrage
  aus (~0,5 s Verzögerung pro Zeichen). Weil vor der Ceremony erst der
  Options-Request übers Netz geht, reicht `cancelPendingPasskey()`
  allein nicht: Ein `AbortSignal` zieht sich durch `loginWithPasskey`,
  damit auch ein Abbruch während des Requests greift, und
  `PasswordAuth` bricht beim Einblenden zur Sicherheit jede noch
  hängende Abfrage ab.
- Passkeys syncen über iCloud-Schlüsselbund bzw. Google
  Passwortmanager. Achtung: Sie sind an die **Domain (RP ID)**
  gebunden – Domain-Umzug macht bestehende Passkeys unbrauchbar.

## Sessions & Cookies

Es gibt **keine Session-Tabelle**: Sessions und WebAuthn-Challenges
sind HMAC-signierte, ablaufende Tokens in `httpOnly`-Cookies
(`sealToken`/`openToken` in `src/lib/auth.ts`).

| Cookie | Zweck | Laufzeit |
| --- | --- | --- |
| `fb_session` | Nutzer-Session (`{ uid }`) | 180 Tage (die ganze Festival-Saison) |
| `fb_wa_reg` / `fb_wa_auth` | WebAuthn-Challenge zwischen options- und verify-Request | 5 Minuten |

Der Signatur-Schlüssel kommt aus `AUTH_SECRET`; fehlt die Variable,
wird er deterministisch aus der `DATABASE_URL` abgeleitet, damit alle
Serverless-Instanzen denselben Schlüssel benutzen. Jede API-Route
liest die Nutzer-ID über `readSessionUserId(req)` – ungültige oder
abgelaufene Tokens ergeben schlicht `null` → 401.

Die Relying-Party-Konfiguration (`WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN`,
sonst aus dem Request abgeleitet) kann nicht per gefälschtem Header
ausgehebelt werden: rpIdHash und Origin stecken signiert in der
Authenticator-Antwort und müssen zu den erwarteten Werten passen.

## E-Mail & Passwort (optional)

Zweiter Login-Weg neben dem Passkey – für Browser ohne
Passkey-Support, fremde Geräte oder als Fallback bei Geräteverlust.

- **Speicherung:** Tabelle `password_credentials` (genau ein Credential
  pro Nutzer; `email` UNIQUE, immer lowercase). Passwörter werden mit
  **scrypt** aus `node:crypto` gehasht (`src/lib/password.ts`, Format
  `scrypt$N$r$p$salt$hash` – Kostenparameter stecken im Wert).
- **Routen** (`src/app/api/password/`): `register` (Konto anlegen),
  `login` (neutrale
  Fehlermeldung + Dummy-scrypt-Lauf bei unbekannter Adresse, damit
  weder Antwort noch Timing verraten, ob ein Konto existiert),
  `forgot`, `reset`, `set` (eingeloggt: Credential anlegen/ändern;
  bestehendes Passwort muss dafür mitgeschickt werden).
- **Passwort vergessen:** `forgot` antwortet immer `{ ok: true }` und
  schickt – falls es das Konto gibt – über **SendGrid**
  (`SENDGRID_API_KEY` + `MAIL_FROM`, `src/lib/mail.ts`) einen Link auf
  `/passwort-reset`. Das Token ist ein `sealToken` (30 min) mit
  **Fingerprint des aktuellen Passwort-Hashes**: keine Token-Tabelle,
  und nach jeder Passwortänderung (auch durch den Reset selbst) ist es
  automatisch wertlos. Es steckt im URL-Fragment (`#…`), damit es
  nicht in Server-Logs landet, und trägt `ruid` statt `uid`, damit es
  nie als Session-Cookie durchgeht.
- **Keine E-Mail-Verifikation:** Die Adresse ist nur Login-Name und
  Reset-Empfänger. Wer eine fremde Adresse einträgt, verschenkt damit
  effektiv den Zugriff auf sein Konto (Reset-Mail geht an den echten
  Inhaber) – für ein Crew-Tool ist das der akzeptierte Kompromiss.
- **Rate-Limits:** alle Passwort-Routen bremsen per In-Memory-Limit
  (`src/lib/ratelimit.ts`, pro Serverless-Instanz, best effort); die
  eigentliche Brute-Force-Härte kommt aus den scrypt-Kosten.
- **UI:** Umschalter in beiden Login-Gates (`PasswordAuth`-Komponente),
  Reset-Seite `/passwort-reset`, und unter *Gruppe → Konto → „Login &
  Sicherheit“* verwaltet man beide Wege (`PasswordSettings`).

## Login-Wege verwalten (Login & Sicherheit)

Beide Verfahren lassen sich nachträglich hinzufügen UND wieder
entfernen – unter *Gruppe → Konto → „Login & Sicherheit“*:

- **Passkeys auflisten/löschen:** `GET /api/webauthn/credentials`,
  `DELETE /api/webauthn/credentials/<id>`.
- **Passkey zum bestehenden Konto hinzufügen** (eingeloggt, typisch:
  Passwort-Nutzer steigt auf Passkey um): `POST /api/webauthn/add/
  options` + `add/verify`. Eigenes Challenge-Cookie `fb_wa_add`, an die
  Session gebunden – es entsteht KEIN neuer Nutzer; bereits registrierte
  Credentials werden per `excludeCredentials` ausgeschlossen.
- **E-Mail+Passwort einrichten/ändern:** `POST /api/password/set`
  (Ändern verlangt das aktuelle Passwort); **entfernen:**
  `DELETE /api/password/set`.
- **Aussperr-Schutz:** Der letzte verbliebene Login-Weg ist nie
  entfernbar. Der Check steckt jeweils im DELETE-Statement selbst
  (`deleteWebauthnCredentialGuarded` / `deletePasswordCredentialGuarded`
  in `src/lib/db.ts`) – ein Passkey fällt nur, wenn ein Passwort oder
  ein weiterer Passkey bleibt; das Passwort nur, wenn mindestens ein
  Passkey existiert. Die UI blendet die Entfernen-Aktion in diesen
  Fällen aus („einziger Login-Weg“), der Server antwortet sonst 409.

## Logout

`POST /api/logout` löscht nur das Session-Cookie. Der Passkey bleibt
auf dem Gerät; der Client (`logout()` in `src/lib/client/store.tsx`)
wirft zusätzlich Nutzer, Gruppenliste und aktive Gruppe aus dem
localStorage.
