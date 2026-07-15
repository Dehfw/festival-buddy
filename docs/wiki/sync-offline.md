# Sync & Offline

Die App ist für das Festival-Funkloch gebaut: Alles läuft aus dem
lokalen Cache weiter, Eintragungen syncen automatisch nach. Die
gesamte Client-Logik steckt in **`src/lib/client/sync.ts`**
(Persistenz + Queue) und **`src/lib/client/store.tsx`**
(React-Context + Poll-Loop).

## Polling

Der Client pollt `GET /api/data?group=<aktive Gruppe>` alle **7
Sekunden** (`POLL_MS`), zusätzlich sofort beim Start, beim
Sichtbarwerden des Tabs und beim `online`-Event. Der Payload
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
   `fb.queue.v1`) und wird sofort optimistisch auf den lokalen
   Snapshot angewendet – die UI reagiert ohne Wartezeit.
2. Dann wird die Queue **FIFO geflusht**. Eine Mutation verlässt die
   Queue erst, wenn der Server sie bestätigt hat – so kann ein
   parallel laufender Poll den optimistischen Zustand nie
   „zurückdrehen": Nach jedem Server-Fetch werden noch offene
   Mutationen erneut auf den frischen Snapshot angewendet.
3. **Kein Netz** → Flush bricht ab, die Queue bleibt liegen und wird
   beim nächsten Poll/`online`-Event abgearbeitet (Replay,
   last-write-wins). **4xx/5xx** → der Server hat bewusst abgelehnt
   (z. B. nicht mehr Mitglied), die Mutation fliegt aus der Queue
   statt endlos zu wiederholen.

Serverseitig zählt für die Identität ausschließlich die
Passkey-Session (Cookie) – die `userId` in der Queue dient nur dem
optimistischen Update.

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
