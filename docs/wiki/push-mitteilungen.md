# Push & Mitteilungen

Fünf Dinge, ein Unterbau: **Mitteilungen** (Durchsagen von Veranstaltern
bzw. dem Betreiber), **Band-Erinnerungen** („Deine Band startet
gleich“), **Programm-Änderungen** („Neue Zeit für …“, siehe unten),
**neue Bands im Lineup** („3 neue Bands im Lineup“, siehe unten) und
**Standort-Benachrichtigungen** („Max steht bei …“, siehe
unten). Zugestellt wird per **Web Push (VAPID)** – Standard-Browser-Push
ohne Firebase, Server-seitig über das npm-Paket `web-push`. Wer kein Push
erlaubt (oder es verpasst), sieht Mitteilungen trotzdem in der App: Sie
reiten im `/api/data`-Payload auf dem normalen 7-Sekunden-Polling mit,
inklusive Offline-Cache des Service Workers.

## Konfiguration

```bash
npx web-push generate-vapid-keys   # einmalig
```

Drei Env-Variablen: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT` (`mailto:…`). Ohne sie ist Push schlicht aus:
`GET /api/push/vapid` antwortet 503, die Client-UI versteckt die
Schalter, Mitteilungen werden nur persistiert. Der öffentliche Key wird
zur **Laufzeit** über die API ausgeliefert (nicht ins Bundle gebacken) –
das Schlüsselpaar lässt sich also ohne Rebuild rotieren. Für die
Erinnerungen kommt `CRON_SECRET` dazu (siehe unten).

## Tabellen

- `push_subscriptions` – ein Browser/Gerät = eine Zeile, `endpoint` ist
  der Primärschlüssel. Upsert bindet ein geteiltes Gerät auf den aktuell
  eingeloggten Nutzer um; max. 20 Abos pro Nutzer (älteste fliegen).
  Antwortet der Push-Dienst 404/410, wird die Zeile gelöscht.
- `announcements` – Mitteilungen; `festival_id NULL` = app-weite
  Betreiber-Nachricht (erscheint bei jedem Festival). Jeder Insert bumpt
  `db_rev`, Polling-Clients sehen die Mitteilung in ≤ 7 s.
- `push_reminders_sent` – Versand-Log der Erinnerungen, PK
  `(user_id, festival_id, slot_id)`: pro Nutzer und Slot genau eine
  Erinnerung, für immer.

## Client-Seite

- Opt-in unter **Gruppe & Konto → Konto** (`PushSettings`) plus ein
  aktives Einmal-Banner in der App (`PushPrompt`): erscheint ein paar
  Sekunden nach dem Start, sobald der Banner-Platz frei ist – Install-
  und Push-Banner teilen sich die Position am unteren Rand und
  koordinieren sich über `promptSlot.ts` (nie beide gleichzeitig).
  `enablePush()` läuft bewusst im Button-Tap und fragt die Permission
  **vor** jedem Netz-await ab: iOS verlangt die Abfrage aus einer noch
  gültigen Nutzer-Geste. iOS kann Web Push überhaupt erst ab 16.4 und
  **nur als installierte Home-Screen-App** – iOS-Nutzer im Safari-Tab
  bekommen deshalb kein Push-Banner; den Hinweis „Mitteilungen gibt's
  nur installiert“ tragen dort die iOS-Anleitung des InstallPrompt und
  die Mitteilungs-Karte im Konto-Tab.
- Der Service Worker (`src/sw.template.js`) zeigt bei `push` immer eine
  Notification (iOS entzieht Abos mit stillen Pushes), öffnet bei
  `notificationclick` die App per Deep-Link (`/app?announcement=…` →
  Mitteilungs-Sheet) und meldet bei `pushsubscriptionchange` das neue
  Abo best effort nach.
- Beim App-Start re-synct der Client ein vorhandenes Abo idempotent an
  den Server (`resyncPushSubscription`) – heilt Nutzerwechsel und
  verlorene DB-Zeilen.
- Anzeige: Glocke im App-Header (`AnnouncementsBell`) mit
  Ungelesen-Punkt; „gelesen“ ist nur ein localStorage-Zeitstempel
  (`fb.annSeen.v1`), kein Server-Roundtrip.

## Wer darf senden?

- **Veranstalter**: Tab „Mitteilungen“ unter `/app/veranstalter`
  (`POST /api/organizer/announcement`, Guard `canManageFestival`,
  Rate-Limit 5 pro 10 Min.). Zielgruppe: alle Mitglieder aller Gruppen
  des Festivals; als Absender erscheint der **Festivalname**, nicht das
  Konto. Der Versand wird vor der Antwort komplett ge-awaitet, die
  Antwort meldet `{ sent, gone, failed }`.
- **Betreiber**: CLI wie bei den Veranstalter-Codes –

  ```bash
  DATABASE_URL=... VAPID_...=... npm run push:broadcast -- "Titel" "Text"
  npm run push:broadcast -- --festival woa2026 "Titel" "Text"
  ```

  Ohne `--festival` app-weit an alle Abos (`festival_id NULL`).

## Programm-Änderungen

Verschiebt ein Veranstalter im Editor einen Slot – neue Zeit, anderer
Tag oder andere Bühne –, bekommen alle Nutzer, die beim Slot eingetragen
sind (`going` **und** `interested`, über alle Gruppen des Festivals),
sofort einen Push: „🕒 <Band>: neue Zeit“, „📅 …: neuer Tag“ oder
„🎪 …: neue Bühne“ (bei mehreren Änderungen „… wurde verschoben“) – mit
neuem und altem Stand im Text. Details:

- Nur echte Verschiebungen pushen. Bandname, „bestätigt“-Häkchen oder
  Spotify-ID ändern lösen nichts aus – neue Slots sowieso nicht.
- Der Editor lässt den Veranstalter die Änderung vorher **bestätigen**:
  Der Dialog nennt, wie viele Eingetragene betroffen sind („Speichern &
  Senden“); ohne Einträge am Slot wird ohne Dialog gespeichert. Ist Push
  gar nicht konfiguriert (keine VAPID-Keys), entfällt der Dialog
  ebenfalls – er würde sonst etwas versprechen, das das Deployment nie
  sendet (`pushConfigured` aus `GET /api/organizer/state`). Der
  Versand wird vor der Antwort komplett ge-awaitet, das
  Ergebnis erscheint als Bestätigung im Editor – **ehrlich gezählt**:
  „Push ist raus an X von Y Eingetragenen“, wobei als informiert nur
  zählt, wen mindestens ein Gerät wirklich erreicht hat
  (`sendPushToUsers` meldet dafür `users` neben den Geräte-Zählern).
  Wer Push nicht aktiviert hat, wird also nicht als benachrichtigt
  ausgegeben – er sieht die Änderung nur in der App.
- Gleicher Notification-`tag` pro (Festival, Slot): Nachjustieren
  ersetzt eine noch sichtbare Notification statt zu stapeln.
- Wer kein Push erlaubt hat, sieht die neue Zeit trotzdem ≤ 7 s später
  über das normale Daten-Polling (`db_rev`-Bump wie bei jeder
  Editor-Mutation). Eine zusätzliche In-App-Mitteilung gibt es bewusst
  nicht – `announcements` erreichen immer das ganze Festival, die
  Änderung interessiert aber nur die Eingetragenen.
- Bewusste Vereinfachung: Das Ändern des **Datums eines Festivaltags**
  (Tab „Tage“) pusht nicht – es verschiebt alle Slots des Tages auf
  einmal und ist praktisch die Tippfehler-Korrektur vor dem Festival.

## Neue Bands im Lineup (Lineup-Watch)

Kündigt ein Festival weitere Bands an, landen sie ohne Zutun in der App,
und alle Mitglieder aller Gruppen dieses Festivals erfahren davon. Zwei
Teile greifen ineinander:

- **Die Watch** – ein geplanter Claude-Lauf (Skill
  `.claude/skills/lineup-watch/`). Er liest die offiziellen Quellen der
  Festivals aus `lineups/watch.json`, ergänzt `lineups/<id>.txt`
  (`npm run lineup:add`), baut die Importdatei und schickt deren Band-Pool
  an die App (`npm run lineup:announce`). Die Watch hat keinen
  Datenbank-Zugang und keine VAPID-Keys – nur HTTPS zur App.
- **Der Endpunkt** – `POST /api/operator/lineup` mit
  `Authorization: Bearer <LINEUP_API_SECRET>`
  (`{ festivalId, bands: [{ name, spotifyArtistId? }], dataVersion?,
  dryRun?, notify? }`). Er pflegt ein und benachrichtigt.

Was der Endpunkt garantiert:

- **Rein additiv.** Es wird nie eine Band entfernt oder umbenannt, Slots,
  Tage und Bühnen bleiben unangetastet – Eintragungen und gemerkte Bands
  können auf diesem Weg nicht verloren gehen. Genau das macht ihn
  automatisierbar; der Voll-Import ersetzt dagegen den kompletten
  Timetable und bleibt Handarbeit.
- **„Neu“ entscheidet der Live-Stand**, gemessen am Band-Slug und unter
  Zeilen-Lock (`addLineupBands` in `src/lib/db.ts`). Die Watch darf immer
  das ganze Lineup schicken; ein zweiter Aufruf mit denselben Bands
  findet nichts Neues und verschickt nichts – egal wie oft oder wie
  parallel sie läuft.
- **Mitteilung und Ergänzung sind eine Transaktion.** Die Mitteilung
  (`announcements`, ohne Autor – Absender ist das Festival) entsteht nur
  zusammen mit den neuen Bands. Danach geht derselbe Text als Push an
  `getFestivalAudienceUserIds()` – dieselbe Zielgruppe wie eine
  Veranstalter-Durchsage. Wer kein Push hat, sieht sie in der Glocke.
- **Der Push selbst gehört nicht zur Transaktion.** Er läuft nach dem
  Commit und wird vor der Antwort abgewartet (ehrliche Zähler). Scheitert
  er als Ganzes, antwortet der Endpunkt trotzdem `ok` mit
  `pushFailed: true` – gespeichert ist ja alles, und ein Aufrufer, der
  wiederholt, fände nichts Neues. Nachgeholt wird ein verlorener Push
  nicht von selbst (`npm run push:broadcast` wäre der Handweg).
  Bleibt die Antwort beim echten Versand aus – Nodes fetch gibt nach
  5 Minuten ohne Antwort-Header auf, ein Proxy davor womöglich früher
  (502/504) –, meldet `lineup:announce` das als „Status unklar, nicht
  wiederholen“ statt als Fehlschlag.
- Text: „Neu im Lineup: <Band>“ bzw. „N neue Bands im Lineup“, im Body
  die Namen in der Reihenfolge der Anfrage; passen nicht alle in die
  500 Zeichen, steht am Ende „… und 12 weitere Bands“
  (`src/lib/lineupNews.ts`). `lineup:announce` schickt die Bands in der
  Reihenfolge der Textdatei – dort stehen die Headliner einer Welle
  vorn –, nicht in der alphabetischen der Importdatei.
- **Nur vor der Running Order.** Hat das Festival schon Slots, antwortet
  der Endpunkt 409: Die Lineup-Ansicht ist dann ausgeblendet, eine Band
  ohne Slot wäre unsichtbar. Sie gehört in den Timetable (Import oder
  Editor).
- `dryRun: true` zeigt nur, was neu wäre; `notify: false` pflegt still
  ein. `GET /api/operator/lineup?festival=…` liefert den Live-Pool, damit
  die Watch ohne DB sieht, was schon eingepflegt ist.

Die Schreibweisen-Falle fängt `scripts/lineup-add.mjs` ab, bevor etwas
gesendet wird: Websites ändern Schreibweisen, und ein anderer Name ist
ein anderer Slug – also scheinbar eine neue Band. Gleiche Band in anderer
Schreibweise gilt als bekannt, verdächtig Ähnliches (Tippfehler-Abstand)
wird nicht übernommen, sondern gemeldet.

## Standort-Benachrichtigungen

Markiert jemand seine Position auf dem Blueprint („Hier stehe ich“,
`POST /api/position`), bekommen die Gruppenmitglieder, die **bei der Band
selbst eingetragen sind** (`going` oder `interested`), sofort einen Push:
„📍 Max steht bei <Band>“ mit Bühne im Text; Klick öffnet die App. Wen
die Band nicht interessiert, den interessiert auch der Standort dort
nicht – der bleibt unbehelligt. Details:

- **Karenzzeit 30 Minuten** pro (Nutzer, Slot): Wer sein ✕ nur
  nachjustiert, spammt die Gruppe nicht – erst wenn der Marker länger
  nicht angefasst wurde, gibt es beim nächsten Setzen wieder einen Push.
  Geprüft wird gegen `positions.updated_at` **vor** dem Schreiben.
- Das **Entfernen** der Markierung pusht nie.
- Gleicher Notification-`tag` pro (Gruppe, Nutzer, Slot): erneutes
  Teilen ersetzt eine noch sichtbare Notification statt zu stapeln.
- Best effort und **entkoppelt**: Der Versand läuft NACH der Antwort
  (`after()` aus `next/server`) – das Eintragen der Position wartet nie
  auf den Push-Fan-out, ein langsamer Push-Dienst oder Versand-Fehler
  kann das Speichern weder verzögern noch scheitern lassen. Zusätzlich
  hat jeder einzelne Push-Request 10 s Socket-Timeout (web-push hat
  sonst keinen – gilt auch für Mitteilungen und Band-Erinnerungen).

## Band-Erinnerungen

Der Server stößt den Sweep selbst **jede Minute** an
(`src/instrumentation.ts` → `src/lib/reminderScheduler.ts`), sobald die
VAPID-Keys gesetzt sind – kein externer Cron nötig. Mit
`REMINDER_SCHEDULER=off` lässt sich der Takt abschalten;
`GET /api/cron/reminders` (Bearer `CRON_SECRET`) löst denselben Sweep
manuell oder per externem Cron (z. B. Coolify-Scheduled-Task) aus.
Mehrere Läufe gleichzeitig (Rolling Deploy, mehrere Container, Takt plus
externer Cron) sind unschädlich: Jede Erinnerung wird über
`push_reminders_sent` genau einmal geclaimt.

Ein Lauf: Für jedes Festival werden Slots gesucht, die in den nächsten
45 Minuten starten (Zeitzone `Europe/Berlin`; Stunden < 8 zählen via
`toMinutes()` als nach Mitternacht). Empfänger sind Nutzer mit einer
Auswahl (`going` **und** `interested`) auf dem Slot und mindestens einem
Push-Abo. Der Vorlauf ist pro Nutzer dynamisch: normal 45 Minuten
(Anreise vom Camp einplanen); hat der Nutzer aber eine andere markierte
Band, die in den 60 Minuten vor dem Slot-Start (noch) läuft – egal auf
welcher Bühne –, sind es 15 Minuten, weil er vermutlich schon auf dem
Gelände steht. Vor dem Senden claimt der Lauf die Paare per
`INSERT … ON CONFLICT DO NOTHING RETURNING` in `push_reminders_sent` –
parallele Cron-Läufe senden dadurch nie doppelt. Bewusste
Vereinfachungen: genau eine Erinnerung pro (Nutzer, Slot), keine neue
bei Slot-Verschiebung, kein Per-Nutzer-Opt-out (nur Push ganz aus).
