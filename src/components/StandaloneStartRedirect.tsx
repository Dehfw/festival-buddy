/**
 * Landing überspringen, wenn die Seite im installierten App-Fenster
 * startet.
 *
 * Hintergrund: Das Manifest zeigt mit `start_url` auf `/app`, aber die
 * Verknüpfung auf dem Homescreen kann trotzdem auf `/` zeigen – iOS
 * merkt sich beim „Zum Home-Bildschirm" die Adresse, die gerade offen
 * war, und ältere Installationen behalten ihre alte Start-Adresse.
 * Kommt die App nach längerer Zeit aus dem Speicher zurück, wird genau
 * diese Adresse neu geladen: Statt des Timetables landet man auf der
 * Landingpage und muss erst „Jetzt loslegen" tippen.
 *
 * Deshalb prüft ein winziges Inline-Script direkt beim Parsen, ob die
 * Seite standalone läuft, und ersetzt die Adresse dann durch `/app`:
 *
 *  - **Inline und ganz oben**, damit der Sprung passiert, bevor die
 *    Landing überhaupt gerendert wird (kein Aufblitzen). Als
 *    Server-Komponente kostet das keinerlei Client-Bundle, und weil das
 *    Script Teil des vom Service Worker vorgecachten HTMLs ist, wirkt es
 *    auch offline.
 *  - **`location.replace`**, damit die Landing keinen History-Eintrag
 *    hinterlässt, den der Zurück-Schritt aus der App wieder aufsammelt.
 *  - **Nicht bei Zurück/Vorwärts** (`back_forward`): Wer aus der App
 *    heraus bewusst zurück auf die Landing navigiert, soll sie sehen und
 *    nicht in einer Schleife landen. Bei einer bfcache-Wiederherstellung
 *    läuft das Script ohnehin nicht erneut.
 *  - **Nicht, wenn die URL den Parameter `landing` trägt** (etwa
 *    `/?landing=1`; der Wert ist egal, es zählt allein, dass der
 *    Parameter gesetzt ist): bewusster Notausgang, um die Landing auch
 *    in der installierten App anzuschauen.
 *
 * Im Browser (nicht installiert) ändert sich nichts – die Landing bleibt
 * die öffentliche Startseite inklusive SEO, Crawler laufen nie
 * standalone.
 */
const REDIRECT_SCRIPT = `(function(){try{
if(new URLSearchParams(location.search).has('landing'))return;
var m=window.matchMedia;
var standalone=(m&&(m('(display-mode: standalone)').matches||m('(display-mode: fullscreen)').matches||m('(display-mode: minimal-ui)').matches))||navigator.standalone===true;
if(!standalone)return;
var nav=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];
if(nav&&nav.type==='back_forward')return;
location.replace('/app');
}catch(e){}})();`;

export function StandaloneStartRedirect() {
  return <script dangerouslySetInnerHTML={{ __html: REDIRECT_SCRIPT }} />;
}
