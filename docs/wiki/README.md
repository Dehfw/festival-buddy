# 📚 Festival-Buddy-Wiki

Wie die wichtigen Funktionen der App unter der Haube funktionieren –
gedacht für alle, die am Code arbeiten oder Verhalten nachschlagen
wollen ("Was passiert eigentlich, wenn …?"). Setup, Deployment und
Import-Anleitungen stehen in der [README](../../README.md); der
ursprüngliche Entwurf des Gruppen-Features in
[PLAN-gruppen.md](../PLAN-gruppen.md).

| Seite | Inhalt |
| --- | --- |
| [Architektur & Datenmodell](architektur.md) | Überblick, Mandanten-Modell (Gruppe → Festival), Tabellen, Schema-Migration, Revisionszähler |
| [Login & Passkeys](auth-passkeys.md) | WebAuthn-Registrierung/-Login, Session-Cookies, Alt-Account-Übernahme |
| [Gruppen](gruppen.md) | Rollen, Einladungscodes, Beitritt, Verlassen (Owner-Nachrücken), Mitglieder entfernen – und was dabei mit den Teilnahmen passiert |
| [Teilnahmen & Positionen](teilnahmen-positionen.md) | Band-Zusagen (`going`/`interested`), ✕-Marker auf dem Blueprint, Feuerrahmen 🔥 |
| [Sync & Offline](sync-offline.md) | Polling, optimistische Updates, Offline-Warteschlange, PWA/Service Worker |
| [Festivals & Timetable](festivals-timetable.md) | Timetables in der DB, Slot-IDs, Lineup-Import ohne Redeploy |
| [Admin-Panel](admin.md) | Betreiber-Login, Blueprints & POIs pflegen |

## Die App in einem Absatz

Festival Buddy ist ein Timetable-Planer für Festival-Crews: Wer geht zu
welcher Band, und wo steht ihr im Publikum? Nutzer melden sich per
**Passkey** an, organisieren sich in **Gruppen** (jede Gruppe gehört zu
genau einem Festival) und tragen sich bei Bands ein. Die App ist eine
**offline-fähige PWA**: Der Datenstand der aktiven Gruppe wird alle paar
Sekunden gepollt und lokal gecacht; ohne Netz läuft alles weiter, und
Eintragungen syncen automatisch nach, sobald wieder Verbindung da ist.
