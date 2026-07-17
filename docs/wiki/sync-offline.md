# Sync & Offline

Die App ist für das Festival-Funkloch gebaut: Alles läuft aus dem
lokalen Cache weiter, Eintragungen syncen automatisch nach. Die
gesamte Client-Logik steckt in **`src/lib/client/sync.ts`**
(Persistenz + Queue) und **`src/lib/client/store.tsx`**
(React-Context + Poll-Loop).

## Polling

Der Client pollt `GET /api/data?group=<aktive Gruppe>` im sichtbaren
Tab alle **7 Sekunden** (`POLL_MS`), zusätzlich sofort beim Start, beim
Sichtbarwerden des Tabs und beim `online`-Event. Der Poll-Loop ist eine
`setTimeout`-Kette (kein `setInterval`): Der nächste Lauf wird erst
nach Abschluss des vorherigen geplant, und `refresh()` trägt eine
In-Flight-Sperre – pro Tab läuft höchstens ein Read-Refresh, parallele
Auslöser (Timer, Events, Gruppenwechsel) teilen sich höchstens einen
eingereihten Folgelauf. Damit gilt:

- **Ausgeblendete Tabs pollen nicht:** Wechselt der Tab auf `hidden`,
  stoppt der Read-Timer – ein Hintergrund-Tab bzw. eine Hintergrund-PWA
  erzeugt keine periodischen Requests mehr (vorher ≈ 8,6/min pro Tab,
  jetzt 0). Beim Sichtbarwerden gibt es genau einen sofortigen Refresh,
  danach beginnt ein frischer Poll-Zyklus. Das `online`-Event stößt
  auch im verdeckten Tab einen einmaligen Sync-Versuch an, damit
  ausstehende Mutationen nicht aufs Sichtbarwerden warten.
- **Backoff im Funkloch:** Ist der Server nicht erreichbar
  (Netzfehler/5xx), wächst der Abstand zwischen den Leseversuchen
  exponentiell mit Jitter (7 s → … → max. 60 s), statt weiter im
  7-Sekunden-Takt anzuklopfen; der erste erfolgreiche Read kehrt zum
  normalen Intervall zurück, der lokale Datenstand bleibt nutzbar.
- **Kein Read ohne Kontext:** Ohne angemeldeten Nutzer oder aktive
  Gruppe wird kein `/api/data`-Request gestartet.

Der Payload
(`DataPayload` in `src/lib/types.ts`) enthält alles für die aktive
Gruppe: Timetable des Gruppen-Festivals, Mitglieder, Teilnahmen,
Positionen, Blueprints, Gruppen-Info und den Revisionszähler `rev`.

Antwortcodes steuern den Zustand:

| Antwort | Reaktion des Clients |
| --- | --- |
| 200 | Snapshot in localStorage cachen (`fb.data.v2:<groupId>` – Cache-Key pro Gruppe, damit ein Gruppenwechsel offline nicht die falschen Leute zeigt) |
| 401 | Session weg → lokalen Nutzer verwerfen, zurück zum Passkey-Login |
| 403 | Aus der Gruppe entfernt oder Gruppe gelöscht → Cache der Gruppe löschen, Mitgliedschaften neu laden, ggf. auf die erste verbliebene Gruppe wechseln |
| Netzfehler/5xx | Wie Funkloch behandeln: Offline-Anzeige, lokaler Stand bleibt |

## Optimistische Mutationen & Offline-Queue

Es gibt genau zwei Mutationen: `selection` und `position`. Beide
laufen durch `sendOrEnqueue()`:

1. Mutation kommt **immer zuerst in die Warteschlange** (localStorage,
   `fb.queue.v2:<userId>` – eine Queue pro Nutzer) und wird sofort
   optimistisch auf den lokalen Snapshot angewendet – die UI reagiert
   ohne Wartezeit. Jeder Eintrag erhält dabei eine **eindeutige,
   reload-stabile Mutation-ID** und eine Erstellungszeit `at`;
   bestätigte Einträge werden später nur anhand genau dieser ID
   entfernt, nie positionsbasiert (Alt-Einträge ohne ID über ihre
   vollständigen Feldwerte). Die ID geht als `clientMutationId` mit an
   den Server, der bereits verarbeitete IDs als No-op bestätigt (siehe
   Multi-Tab-Koordination).
2. Dann wird die Queue **FIFO geflusht**. Eine Mutation verlässt die
   Queue erst, wenn der Server sie bestätigt hat – so kann ein
   parallel laufender Poll den optimistischen Zustand nie
   „zurückdrehen": Nach jedem Server-Fetch werden noch offene
   Mutationen erneut auf den frischen Snapshot angewendet.
3. **Kein Netz** → Flush bricht ab, die Queue bleibt liegen und wird
   beim nächsten Poll/`online`-Event abgearbeitet (Replay,
   last-write-wins). **Temporäre Fehler** (5xx, 408, 425, 429 sowie
   401) bestätigen die Mutation nicht: Sie bleibt an der Spitze der
   Queue (FIFO), der Flush endet und der nächste Poll versucht es
   erneut – mit begrenztem exponentiellem Backoff samt Jitter
   (5 s … 5 min); ein `Retry-After`-Header (z. B. bei 429/503) wird
   als Untergrenze respektiert. Bei 401 stößt der Poll zusätzlich den
   Login-Fluss an; nach erneuter Anmeldung desselben Nutzers wird die
   Queue normal geflusht. **Dauerhafte 4xx** (400/403/404 …) → der
   Server hat bewusst abgelehnt (z. B. nicht mehr Mitglied), die
   Mutation fliegt aus der Queue statt sie zu blockieren; der nächste
   Poll stellt den bestätigten Server-Stand wieder her.

Serverseitig zählt für die Identität ausschließlich die
Passkey-Session (Cookie) – die `userId` in der Queue dient dem
optimistischen Update und bindet die Queue an ihren Besitzer:
Geflusht wird nur die Queue des gerade angemeldeten Nutzers. Beim
Logout bleiben offene Mutationen benutzerspezifisch liegen und werden
erst gesendet, wenn sich **derselbe** Nutzer wieder anmeldet – nie
unter der Session eines anderen. Einträge der alten globalen Queue
(`fb.queue.v1`) werden beim Start anhand ihrer `userId` auf die
Nutzer-Queues verteilt.

### Multi-Tab-Koordination

Alle Tabs eines Browserprofils teilen sich dieselbe
localStorage-Queue. Damit parallele Tabs keine Mutationen doppelt
wirksam senden, sich beim Read-Modify-Write keine Einträge
überschreiben und eine ältere, verspätete Anfrage keine neuere
Benutzeraktion beim Server überschreiben kann, arbeiten drei Ebenen
zusammen – jede mit einer klar definierten Garantie:

**1. Web-Locks-Pfad (Standard, alle aktuellen Browser) – atomar:**

- **Ein Flush-Writer browserweit:** `flushQueue()` läuft unter einem
  Web Lock (`fb.queue.flush`) – weitere Tabs warten, bis der aktive
  Writer fertig ist, und übernehmen dann die restliche Queue. Der
  Browser gibt das Lock beim Schließen/Absturz eines Tabs automatisch
  frei. Alle Requests laufen strikt nacheinander in Queue-Reihenfolge
  (FIFO nach Erstellungszeit `at`).
- **Queue-Writes unter kurzem Lock:** Einreihen und Entfernen laufen
  unter einem zweiten Web Lock (`fb.queue.write`), damit
  gleichzeitiges Einreihen aus zwei Tabs keine Einträge verliert.
- **Garantie:** höchstens ein aktiver POST pro Mutation, kein
  Enqueue-Verlust, definierte Reihenfolge – rein clientseitig.

**2. Fallback ohne Web Locks – best effort, aber abgesichert:**
localStorage kennt kein Compare-and-Swap, eine rennfreie Sperre ist
dort prinzipiell unmöglich. Der Fallback minimiert deshalb nur die
Fenster und verlässt sich für die Korrektheit auf Ebene 3:

- **Gehärtete Flush-Lease** (`fb.queue.lock.v1`, 15 s Ablaufzeit):
  Schreiben + doppeltes Zurücklesen mit kurzer, gejitterter Setzzeit –
  bei nahezu gleichzeitigem Erwerb gewinnt praktisch immer nur der
  zuletzt schreibende Tab. Ist die Lease vergeben, überspringt der Tab
  den Flush; der aktive Writer verlängert sie laufend, eine
  abgelaufene Lease (Tab-Absturz) kann nach spätestens 15 s
  übernommen werden.
- **Einreihen per ID-Merge:** Statt blindem Überschreiben wird die
  Union aus frisch gelesener Queue und eigenem Eintrag geschrieben
  (dedupliziert über die Mutation-ID, stabil sortiert nach `at`).
- **Reconciliation eigener Einträge:** Jeder Tab merkt sich seine noch
  offenen Mutationen. Überschreibt ein konkurrierender Write einen
  davon doch, reiht ihn das `storage`-Event bzw. der nächste Flush
  wieder ein – außer die Erledigt-Liste (`fb.queue.done.v1`, vom
  Flush-Writer geführt) kennt die ID bereits als bestätigt/abgelehnt,
  oder es existiert inzwischen eine **neuere** Mutation fürs selbe
  Ziel (dann bleibt die neueste Benutzerabsicht maßgeblich).
- **Garantie:** kein dauerhafter Enqueue-Verlust; Doppel-POSTs sind
  selten, aber möglich – sie sind durch Ebene 3 wirkungslos.

**3. Serverseitige Idempotenz (Backstop, gilt für beide Pfade):**
Jede Mutation geht mit ihrer eindeutigen, reload-stabilen ID als
`clientMutationId` an `/api/selection` bzw. `/api/position`. Der
Server beansprucht die ID in **derselben Transaktion** wie die
Anwendung der Mutation (Tabelle `processed_mutations`, Unique-Index
pro Nutzer + ID, Aufbewahrung 24 h). Eine bereits verarbeitete ID wird
als Erfolg bestätigt, **ohne** erneut zu schreiben – auch zwei
gleichzeitige Duplikate serialisiert der Unique-Index. Ein doppelter
oder verspäteter Versand derselben Mutation kann damit nie einen
neueren Zustand überschreiben. Alt-Clients ohne `clientMutationId`
werden unverändert (ohne Idempotenz-Schutz) verarbeitet.

**Konsistente Anzeige:** Über das `storage`-Event spiegeln alle Tabs
Queue-Änderungen anderer Tabs sofort in ihrer Pending-Anzeige und
stoßen dabei die Reconciliation (Ebene 2) an.

**Bewusste Restgrenze des Fallbacks:** Schließt ein Tab ohne Web Locks
sich, WÄHREND genau in diesem Moment ein konkurrierender Write seinen
frisch eingereihten Eintrag überschreibt, kann niemand mehr
reconcilen – dieses Fenster ist praktisch vernachlässigbar und betrifft
nur Browser ohne Web-Locks-API.

## PWA & Service Worker

Die App ist als PWA installierbar (Manifest +
`InstallPrompt`-Komponente). Der Service Worker wird pro Deploy mit
einer Version gestempelt und unter `/sw.js` ausgeliefert
(`src/app/sw.js/route.ts`):

- **Precache** der App-Shell (u. a. `/` und `/admin`),
- **network-first mit Cache-Fallback** für Daten,
- **stale-while-revalidate** für Assets.

Meldet sich ein neuer Worker, bietet `UpdatePrompt` (global im
Root-Layout) einen „Neu laden"-Hinweis an. Voraussetzung für Service
Worker **und** Passkeys: Auslieferung über HTTPS (oder localhost).

### Sicherheitsgrenze des Daten-Caches

`/api/data` enthält geschützte Gruppendaten und ist serverseitig mit
`Cache-Control: no-store` markiert. Der Service Worker cached die
Antwort **bewusst trotzdem** (`fb-data-<version>`) – das ist die
dokumentierte Offline-Funktion. Dafür ist der Cache strikt an die
Session gebunden:

- **Logout, Session-Ende (401) und Nutzerwechsel** löschen alle
  privaten Daten: die localStorage-Snapshots (`fb.data.v2:*`) und alle
  `fb-data-*`-Caches (auch die älterer SW-Versionen). Die Bereinigung
  läuft doppelt (`src/lib/client/swCache.ts`): per
  `{type:'CLEAR_DATA_CACHE'}`-Message an den aktiven SW (mit
  Bestätigung über einen MessagePort; ein Epoch-Zähler verwirft dabei
  Antworten, die beim Logout noch unterwegs waren) **und** direkt über
  `caches.delete()` aus dem Fenster (wirkt auch ohne Controller und
  bei wartendem SW).
- **Bestätigte Bereinigung als Voraussetzung (fail-closed):** Der
  Merker (`fb.cachePurge.v1`) wird erst entfernt, wenn die Bereinigung
  nachweislich vollständig war – direkte Löschung erfolgreich **und**
  SW-Bestätigung des Epoch-Bumps (bzw. kein Controller vorhanden, der
  eine noch laufende Antwort cachen könnte). Solange das nicht der Fall
  ist, startet der `AppProvider` **keinen** Datenabruf, der auf den
  alten SW-Cache zurückfallen könnte: `purgeBlocked` schaltet die App
  in einen sichtbaren Sicherheitsstopp (statt Login/Datenansicht), die
  Bereinigung wird automatisch mit begrenztem exponentiellem Backoff
  (5 s → max. 60 s) wiederholt und erst eine bestätigte Löschung gibt
  Polling und Session-Refresh wieder frei – eine neue Session übernimmt
  den privaten Cache der vorherigen nie, auch nicht im Fehlerfall.
- Ein serverseitiges 401/403 wird nie durch den Cache in ein
  scheinbares 200 verwandelt: Der Cache-Fallback greift nur bei
  Netzfehler/Timeout, echte Fehlerantworten werden durchgereicht und
  nicht gespeichert.
- Öffentliche Ressourcen (App-Shell, statische Assets) bleiben von der
  Bereinigung unberührt – nur `fb-data-*` ist privat.
- Die **Offline-Queue** (`fb.queue.v2:<userId>`) bleibt beim Logout
  bewusst liegen: Sie ist pro Nutzer isoliert und wird erst unter der
  eigenen Session desselben Nutzers wieder gesendet.
