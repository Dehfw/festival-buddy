/**
 * Öffentliche Basis-URL der App für SEO (Canonical, OpenGraph, Sitemap,
 * robots.txt). In Produktion APP_URL setzen (z. B. https://buddy.defekt.shop);
 * ohne die Variable fällt alles auf localhost zurück – schadet lokal nicht,
 * indexiert wird ja erst die echte Domain.
 */
export function siteUrl(): string {
  return (
    process.env.APP_URL?.replace(/\/$/, '') ??
    `http://localhost:${process.env.PORT ?? 3000}`
  );
}
