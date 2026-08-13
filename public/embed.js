/**
 * Festival Buddy – Website-Embed-Loader.
 *
 * Veranstalter binden ihren Timetable so auf der eigenen Website ein:
 *
 *   <div data-festival-buddy="woa2026"></div>
 *   <script async src="https://DEINE-BUDDY-DOMAIN/embed.js"></script>
 *
 * Optionen am div:
 *   data-height="640"   Höhe in Pixeln (Standard 640, Widget scrollt innen)
 *   data-height="auto"  iframe wächst mit dem Inhalt (kein inneres Scrollen)
 *
 * Das Script baut pro div ein iframe auf /embed/<festival-id> derselben
 * Domain, von der embed.js geladen wurde. Im auto-Modus meldet das Widget
 * seine Höhe per postMessage ({type:'festival-buddy:height'}), der Loader
 * zieht das iframe passend. Es werden keine Cookies gesetzt und keine
 * Besucherdaten erhoben.
 */
(function () {
  'use strict';

  var script =
    document.currentScript ||
    (function () {
      var list = document.querySelectorAll('script[src*="embed.js"]');
      return list.length ? list[list.length - 1] : null;
    })();
  if (!script || !script.src) return;

  var origin = new URL(script.src).origin;

  // Mehrfaches Laden des Scripts (z. B. zwei Snippets auf einer Seite) darf
  // keine doppelten iframes erzeugen – ein globales Flag reicht als Wächter.
  if (window.__festivalBuddyEmbed) {
    window.__festivalBuddyEmbed.scan();
    return;
  }

  /** Alle noch nicht initialisierten data-festival-buddy-Container aufbauen */
  function scan() {
    var nodes = document.querySelectorAll('[data-festival-buddy]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.getAttribute('data-fb-ready')) continue;
      var festival = el.getAttribute('data-festival-buddy');
      if (!festival) continue;
      el.setAttribute('data-fb-ready', '1');

      var height = el.getAttribute('data-height') || '640';
      var auto = height === 'auto';

      var iframe = document.createElement('iframe');
      iframe.src =
        origin + '/embed/' + encodeURIComponent(festival) + (auto ? '?height=auto' : '');
      iframe.title = 'Festival-Timetable – Festival Buddy';
      iframe.loading = 'lazy';
      iframe.setAttribute('scrolling', auto ? 'no' : 'auto');
      iframe.style.display = 'block';
      iframe.style.width = '100%';
      iframe.style.border = '0';
      iframe.style.height = (auto ? 640 : parseInt(height, 10) || 640) + 'px';
      el.appendChild(iframe);
    }
  }

  // Höhenmeldungen der Widgets: nur von unserer Origin und nur für iframes,
  // die wir selbst gebaut haben (Abgleich über contentWindow).
  window.addEventListener('message', function (event) {
    if (event.origin !== origin) return;
    var data = event.data;
    if (!data || data.type !== 'festival-buddy:height') return;
    var frames = document.querySelectorAll('[data-fb-ready] iframe');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === event.source) {
        frames[i].style.height = Math.max(200, Number(data.height) || 0) + 'px';
        return;
      }
    }
  });

  window.__festivalBuddyEmbed = { scan: scan };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
})();
