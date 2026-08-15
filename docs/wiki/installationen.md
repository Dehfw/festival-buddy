# Installationen (PWA auf dem Home-Screen)

Wie viele Leute haben die App noch auf dem Home-Screen? Die kurze,
unbequeme Antwort vorweg: **exakt lässt sich das nicht messen.** Kein
Browser meldet eine Deinstallation – weder Android noch iOS, weder per
Event noch per API. Auch `appinstalled` feuert nur einmal beim
Installieren, und `getInstalledRelatedApps()` gibt es nur auf Chrome
für native Apps. Messbar ist deshalb nur das Gegenteil: **wer sich noch
aus der installierten App meldet.**

Genau das macht die App: Startet sie im Standalone-Modus
(Home-Screen/App-Fenster statt Browser-Tab), schickt sie ein
Lebenszeichen. „Noch installiert“ heißt in der Statistik: *hat sich in
den letzten X Tagen aus der installierten App gemeldet*. Wer sich nicht
mehr meldet, hat deinstalliert **oder** benutzt die App einfach nicht
mehr – unterscheiden lässt sich das nicht, und die Zahlen sind deshalb
bewusst als „aktiv installiert“ beschriftet.

## Wie ein Lebenszeichen entsteht

1. `src/lib/client/install.ts` legt beim ersten App-Start eine zufällige
   `install_id` im `localStorage` an (kein Fingerprint, keine Geräte-ID)
   und erkennt den Startmodus über
   `matchMedia('(display-mode: standalone|fullscreen|minimal-ui)')` bzw.
   `navigator.standalone` (iOS).
2. Beim App-Start – im `AppProvider` (`src/lib/client/store.tsx`), also
   dort, wo auch das Push-Abo re-gemeldet wird – geht ein `POST` an
   `/api/install/ping` mit `{ installId, standalone, platform }`.
   Gedrosselt auf **einmal pro 12 h**; ein *Moduswechsel* (Tab ↔
   installiert) überspringt die Drossel, weil genau der interessant ist.
   Beim Login läuft der Ping sofort (`force`), damit die Installation dem
   Nutzer zugeordnet wird.
3. `recordInstallPing()` (`src/lib/db.ts`) upsertet die Zeile in
   `app_installs`.

Ohne `localStorage` (Privatmodus/geblockt) zählt das Gerät nicht mit –
lieber gar nicht als bei jedem Start als „neue Installation“.

## Tabelle `app_installs`

| Spalte | Bedeutung |
| --- | --- |
| `install_id` | Zufalls-ID aus dem `localStorage` (PK) |
| `user_id` | zuletzt eingeloggter Nutzer, `NULL` = ausgeloggt/nie eingeloggt (`ON DELETE CASCADE`) |
| `platform` | `ios` / `android` / `desktop` / `other` (grob aus dem User-Agent) |
| `standalone` | wie der **letzte** Start lief: installiert oder im Browser-Tab |
| `first_seen_at` / `last_seen_at` | erstes/letztes Lebenszeichen überhaupt |
| `installed_at` | **erster** Home-Screen-Start (`NULL` = nie installiert) |
| `last_standalone_at` | **letzter** Home-Screen-Start – daraus kommt „noch installiert“ |

Ein Browser-Start überschreibt `last_standalone_at` bewusst **nicht**:
Unter Android teilen sich Tab und installierte App denselben Storage,
dieselbe `install_id` meldet sich also mal so, mal so. Auf iOS hat die
Home-Screen-App einen eigenen Storage und damit automatisch eine eigene
`install_id` – dort ist die Trennung sauber.

## Auswerten

```bash
DATABASE_URL=... npm run stats:installs
DATABASE_URL=... npm run stats:installs -- --json
DATABASE_URL=... npm run stats:installs -- --prune 365   # Karteileichen löschen
DATABASE_URL=... DISCORD_WEBHOOK_URL=... npm run stats:installs -- --discord
```

Ausgabe (Auszug):

```
📲 PWA auf dem Home-Screen
   aktiv:      42 (7 T) · 57 (30 T) · 63 (90 T) Installationen
   Personen:   51 verschiedene Nutzer (30 T)
   neu:        3 (7 T) · 9 (30 T)
   still:      12 seit >30 T · 5 seit >90 T (deinstalliert oder ungenutzt)
```

Die Kennzahlen im Einzelnen:

- **aktiv** – Installationen mit Home-Screen-Start im Fenster. Die
  30-Tage-Zahl ist die belastbarste Antwort auf „wie viele haben die App
  noch drauf“.
- **Personen** – verschiedene `user_id`s dahinter; ein Mensch mit Handy
  und Tablet zählt einmal.
- **neu** – erster Home-Screen-Start im Fenster.
- **still** – war installiert, meldet sich aber seit >30/>90 Tagen nicht
  mehr. Das ist die Näherung für „deinstalliert“.
- **nur Browser** – aktive Geräte, die die App noch nie vom Home-Screen
  gestartet haben: die Zielgruppe für den Install-Hinweis
  (`<InstallPrompt />`).
- **Push-Abos** – Gegenprobe: iOS liefert Web Push **nur** an die
  installierte PWA. Ein aktives iOS-Abo heißt also: installiert. Tote
  Abos räumt der Versand bei 404/410 selbst ab (siehe
  [Push & Mitteilungen](push-mitteilungen.md)).

`--discord` schickt dieselbe Zusammenfassung an den Betreiber-Webhook
(`DISCORD_WEBHOOK_URL`) – z. B. wöchentlich per Cron aufgerufen, dann
steht die Entwicklung ohne weiteres Zutun im Server.

## Aufbewahrung

Die Zeilen bleiben liegen, bis sie jemand aufräumt: `--prune <tage>`
löscht Installationen ohne Lebenszeichen seit N Tagen (Standard 365).
Bewusst manuell – eine Auswertung soll nie heimlich Daten löschen. Wird
ein Konto gelöscht, verschwinden die zugeordneten Zeilen per
`ON DELETE CASCADE` mit.

## Was die Zahlen nicht können

- **Deinstallationen in Echtzeit** – siehe oben, gibt es schlicht nicht.
- **Ein Mensch = eine Installation** – wer Handy und Laptop installiert,
  zählt zweimal (deshalb die Personen-Zahl daneben).
- **Sicherheit gegen Storage-Verlust** – räumt jemand seine
  Website-Daten weg, entsteht beim nächsten Start eine neue
  `install_id`, die alte gilt als still. Bei iOS passiert das nach
  längerer Nichtnutzung auch von selbst (ITP löscht Storage nach 7
  Tagen ohne Interaktion – die installierte App ist davon zwar
  ausgenommen, ein Restrisiko bleibt).
