/**
 * Lässt die Scripts auch hinter einem Pflicht-Proxy ins Netz – als
 * Seiteneffekt beim Import:
 *
 *   import './proxy.mjs';   // vor dem ersten fetch
 *
 * Node-fetch beachtet HTTPS_PROXY nur mit NODE_USE_ENV_PROXY (ab 22.21
 * bzw. 24). In einer Cloud-Session geht aller Verkehr über einen Proxy;
 * ohne die Variable endet jeder Aufruf mit einem nichtssagenden
 * "fetch failed". Statt das jedem Aufrufer aufzubürden, startet sich das
 * Script hier einmal selbst mit gesetzter Variable neu. Ohne Proxy in der
 * Umgebung (lokale Entwicklung) passiert nichts.
 */
import { spawnSync } from 'node:child_process';

if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const res = spawnSync(
    process.execPath,
    ['--disable-warning=UNDICI-EHPA', ...process.argv.slice(1)],
    { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } }
  );
  process.exit(res.status ?? 1);
}
