import { headers } from 'next/headers';

/**
 * Öffentliche Basis-URL der App für SEO (Canonical, OpenGraph, Sitemap,
 * robots.txt) und alles, was in geteilten Links/Vorschauen sichtbar wird.
 *
 * In Produktion APP_URL setzen (z. B. https://buddy.defekt.shop), um die
 * kanonische Domain zu pinnen. Ohne die Variable wird der echte Request-Host
 * genutzt – so steht nie localhost in einer geteilten URL.
 *
 * Reihenfolge:
 *  1. APP_URL, falls gesetzt – pinnt die kanonische Domain (www vs. non-www …),
 *  2. sonst der tatsächliche Host aus den Request-Headern (x-forwarded-host/
 *     host). Damit landet nie localhost in geteilten Links/OpenGraph/Canonical,
 *     auch wenn APP_URL beim Build vergessen wurde,
 *  3. localhost nur als letzter Fallback (Build ohne Request-Kontext).
 */
/**
 * Basis-URL für sicherheitskritische Links (Passwort-Reset-Mail). Hier
 * darf NIE der Host-Header durchschlagen: Hinter einem Proxy, der
 * X-Forwarded-Host ungeprüft weiterreicht, könnte ein Angreifer sonst
 * Reset-Links auf seine eigene Domain umbiegen ("Host header poisoning").
 * Reihenfolge: APP_URL, sonst Vercels Produktions-Domain, außerhalb von
 * Produktion der Request-Host (lokale Entwicklung). null = keine
 * vertrauenswürdige URL bekannt -> Aufrufer schickt nichts raus.
 */
export async function resolveTrustedSiteUrl(): Promise<string | null> {
  const configured = process.env.APP_URL?.replace(/\/$/, '');
  if (configured) return configured;
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProd) return `https://${vercelProd.replace(/\/$/, '')}`;
  if (process.env.NODE_ENV !== 'production') return resolveSiteUrl();
  return null;
}

export async function resolveSiteUrl(): Promise<string> {
  const configured = process.env.APP_URL?.replace(/\/$/, '');
  if (configured) return configured;

  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host');
    if (host) {
      const proto =
        h.get('x-forwarded-proto') ||
        (host.startsWith('localhost') || host.startsWith('127.0.0.1')
          ? 'http'
          : 'https');
      return `${proto}://${host}`;
    }
  } catch {
    // Kein Request-Kontext (z. B. reiner Build) – Fallback unten.
  }

  return `http://localhost:${process.env.PORT ?? 3000}`;
}
