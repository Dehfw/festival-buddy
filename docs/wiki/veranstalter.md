# Veranstalter-Bereich

`/app/veranstalter` ist der Bereich, in dem **Festival-Veranstalter**
die Daten ihres Festivals pflegen: Timetable (Tage, Bühnen, Slots),
Festival-Name/Edition sowie die Bühnenpläne (Blueprints) inkl. POIs.
Er ersetzt das frühere passwortgeschützte Admin-Panel vollständig –
ein `ADMIN_PASSWORD` gibt es nicht mehr.

Mit den **Gruppen-Rollen** (Owner/Admin) hat das nichts zu tun:
Veranstalter sein ist eine Zuweisung **pro Festival**, gespeichert in
der Tabelle `festival_organizers`.

Die öffentliche Marketing-Seite liegt unter `/veranstalter`: Sie erklärt
den Bereich für Interessenten und nennt den Kontakt für neue Festivals
(`moin@festivalbuddy.app`); verlinkt ist sie im Footer der Startseite
und aus den Logged-out-/Kein-Zugang-Zuständen des Bereichs.

Die kurze, merkbare URL gehört auf den Flyer, nicht auf ein Werkzeug,
das eine Handvoll Leute öffnet – deshalb diese Aufteilung. Das Werkzeug
sitzt unter `/app/veranstalter`, weil es zur eingeloggten App gehört
(wie `/app` selbst); damit ist es über die bestehende `/app`-Regel
automatisch aus `robots.txt` heraus, ohne dass die öffentliche Seite
darunter leidet. Der alte Pfad `/fuer-veranstalter` leitet dauerhaft
(301) auf `/veranstalter` um (`redirects` in `next.config.mjs`).

## Zugang & Zuweisung

1. Der Betreiber erzeugt per CLI einen **einmaligen Einladungscode**
   für ein Festival (gleiches Code-Format wie Gruppen-Codes,
   Crockford-Base32):

   ```bash
   DATABASE_URL=... npm run organizer -- generate woa2026
   ```

2. Der Veranstalter meldet sich in der App ganz normal mit seinem
   **Passkey-Konto** an und löst den Code unter
   `/app/veranstalter?code=XXXX-XXXX` ein (`POST /api/organizer/redeem`,
   rate-limited; unbekannt/verbraucht/widerrufen geben bewusst dieselbe
   Antwort). Einlösen verbraucht den Code (`used_by`/`used_at` in
   `organizer_invites`).
3. Ab jetzt sieht der Nutzer den 🎪-Tab „Veranstalter“ in der unteren
   Navigation (`organizerFestivals` aus `GET /api/me`). Ein Nutzer kann
   Veranstalter mehrerer Festivals sein – oben wird umgeschaltet.

Verwalten per CLI (`scripts/organizer-code.mjs`):

```bash
npm run organizer -- list woa2026       # Codes + aktive Veranstalter
npm run organizer -- revoke XXXX-XXXX   # offenen Code sperren
npm run organizer -- remove woa2026 u-… # Zugang entziehen
```

`remove` wirkt **sofort**: Die Zuweisung wird bei jeder Anfrage gegen
die DB geprüft (`canManageFestival` in `src/lib/organizer.ts`), im
Session-Token steckt nichts davon.

## Autorisierung

Jede Route unter `/api/organizer/*` liest die `festivalId` aus der
Anfrage und prüft die Zuweisung des eingeloggten Nutzers genau dafür –
der Veranstalter von Festival A bekommt für Festival B ein 403. Ohne
Session gibt es 401. Gruppen-, Nutzer- oder Auswahl-Daten anderer Leute
gibt der Bereich nicht heraus; einzige Ausnahmen sind anonyme Summen:
die **Auswahl-Zähler pro Slot** für die Lösch-Warnungen und die
**Gruppen-Zähler** (wie viele Gruppen und wie viele verschiedene
Personen darin – Kopfzeile im Veranstalter-Bereich, als Gefühl für die
erwartete Menge). Gruppennamen oder Mitglieder sind nie dabei.

## Timetable bearbeiten

Alle Mutationen laufen über `mutateTimetable()` in `src/lib/db.ts`: Die
Festival-Zeile wird mit `SELECT … FOR UPDATE` gelesen (parallele Edits
serialisiert, last-write-wins pro Entität), der JSONB-Block geändert und
in derselben Transaktion aufgeräumt:

- **Slot gelöscht** (direkt oder via Tag/Bühne) → zugehörige
  `selections` und `positions` werden mitgelöscht.
- **Bühne gelöscht** → ihr `blueprints`-Eintrag ebenfalls.
- **Bühne umbenannt** → das `stageLabel` eines vorhandenen Blueprints
  zieht mit.

Der Editor **warnt vor jedem Löschen** mit einem Dialog – und hebt rot
hervor, wie viele Besucher-Einträge (Zusagen/Interessen) an den
betroffenen Slots hängen (Zähler aus `GET /api/organizer/state`).

Auch das **Verschieben** eines Slots (Zeit, Tag oder Bühne), an dem
schon Einträge hängen, bestätigt der Veranstalter vorher per Dialog –
denn die Eingetragenen bekommen die Änderung automatisch als
Push-Mitteilung (Details:
[Push & Mitteilungen](push-mitteilungen.md#programm-änderungen)). Nach
dem Speichern zeigt der Editor das Versand-Ergebnis an.

Regeln & Grenzen (Validierung serverseitig):

- **IDs sind stabil**: Slot-IDs (`tag-buehne-bandslug`), Tag- und
  Bühnen-IDs werden beim Anlegen generiert (Umlaute → ae/oe/ue/ss,
  Kollision → `-2`-Suffix) und ändern sich bei Edits **nie** – daran
  hängen die Auswahlen/Positionen der Crews.
- Zeiten als `HH:MM`, Stunden ≥ 24 = nach Mitternacht (z. B. `25:30`),
  Ende muss nach Beginn liegen. Überschneidungen auf einer Bühne sind
  erlaubt – der Editor warnt nur.
- Tage bleiben nach Datum sortiert; max. 30 Tage, 40 Bühnen, 2000 Slots.
- Jede Mutation stempelt `data_version` neu („Stand … ·
  Veranstalter-Editor“) und bumpt `db_rev` – die Crews sehen Änderungen
  beim nächsten 7-s-Poll.

## Bühnenpläne (Blueprints)

Der Blueprint-/POI-Editor aus dem alten Admin-Panel lebt jetzt als
wiederverwendbare Komponente `src/components/BlueprintEditor.tsx` im
Tab „Bühnenplan“: POIs (🚻💧🛍️⛑️🚪) platzieren/verschieben/löschen,
Elemente (Bühne/FOH/Barriere/Zelt) in Prozent-Koordinaten pflegen,
Bühnen-Beschriftung setzen. Gespeichert wird pro Bühne komplett
(`POST /api/organizer/blueprint`, Koordinaten werden serverseitig auf
0–100 geklemmt). Bühnen ohne gepflegten Grundriss bekommen zur Laufzeit
einen Default (`defaultBlueprint()` in `src/lib/db.ts`).

## Neues Festival aufsetzen (Betreiber)

Festivals entstehen weiterhin per Skript – für ein leeres Festival
reicht ein Skelett-JSON:

```bash
echo '{ "festival": "Mein Festival", "edition": "2027", "dataVersion": "",
        "days": [], "stages": [], "slots": [] }' > skeleton.json
DATABASE_URL=... npm run import:db -- --festival mf2027 skeleton.json
DATABASE_URL=... npm run organizer -- generate mf2027
```

Tage, Bühnen, Slots und Bühnenpläne legt der Veranstalter danach selbst
in der App an.
