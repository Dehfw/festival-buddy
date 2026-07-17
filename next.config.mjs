import { execSync } from 'node:child_process';

/**
 * Version für den Service Worker: pro Deploy eindeutig, damit der Browser
 * einen neuen SW erkennt und die App ein Update anbieten kann.
 *  1. SW_VERSION aus der Umgebung (falls das Deployment eine setzt),
 *  2. sonst der aktuelle Git-Kurz-SHA (stabil pro Commit),
 *  3. Fallback: grober Zeitstempel.
 */
function resolveSwVersion() {
  if (process.env.SW_VERSION) return process.env.SW_VERSION;
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return `t${Math.floor(Date.now() / 1000)}`;
  }
}

const SW_VERSION = resolveSwVersion();

const isDev = process.env.NODE_ENV === 'development';
// Vercel-Preview-Deployments injizieren das Live-Feedback-Toolbar-Script
// von vercel.live; nur dort werden die zugehörigen Quellen freigeschaltet.
const isVercelPreview = process.env.VERCEL_ENV === 'preview';

/**
 * Content-Security-Policy (Issue #30).
 *
 * Ressourcen-Inventar der App (Stand dieses Commits):
 *  - Scripts: ausschließlich eigene Bundles unter /_next/ plus die von
 *    Next.js generierten Inline-Bootstrap-Scripts (Hydration/Streaming).
 *  - Styles: eine gebaute Tailwind-CSS-Datei plus dynamische Inline-
 *    style-Attribute (Bühnenfarben, Kartenpositionen, Swipe-Transforms).
 *  - Bilder: eigene Assets/Icons, Gruppenbilder über /api/groups/:id/image,
 *    Data-URLs (Join-Vorschau) und Blob-/Canvas-Quellen (Bild-Resize).
 *  - Fetch/XHR: nur eigene /api/*-Routen; der Service Worker ignoriert
 *    Cross-Origin-Requests. Spotify wird nur als Link geöffnet
 *    (Navigation, von der CSP nicht eingeschränkt).
 *  - Keine externen Fonts, keine iframes, keine Plugins.
 *
 * Risikobewertung script-src/style-src (dokumentierte, nicht noncebasierte
 * Variante gemäß Next.js-Doku): Eine noncebasierte CSP würde sämtliche
 * Seiten in dynamisches Rendering zwingen (Caching-/Performance-Folgen,
 * siehe Next.js-CSP-Guide). Deshalb vorerst 'unsafe-inline':
 *  - script-src 'unsafe-inline': nötig für die Inline-Bootstrap-Scripts
 *    von Next.js. Externe Fremd-Scripts bleiben trotzdem blockiert.
 *  - 'unsafe-eval' ausschließlich im Dev-Modus (React Refresh/HMR),
 *    niemals in Produktion.
 *  - style-src 'unsafe-inline': nötig für die dynamischen style-Attribute
 *    (style-src-attr fällt auf style-src zurück).
 * Eine spätere Verschärfung (Nonces/Hashes) kann unabhängig von den
 * übrigen Basisheadern erfolgen.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  // Primärer Framing-Schutz; X-Frame-Options: DENY dient als Fallback.
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}${
    isVercelPreview ? ' https://vercel.live' : ''
  }`,
  `style-src 'self' 'unsafe-inline'${
    isVercelPreview ? ' https://vercel.live' : ''
  }`,
  `img-src 'self' data: blob:${
    isVercelPreview ? ' https://vercel.live https://vercel.com' : ''
  }`,
  `font-src 'self'${
    isVercelPreview ? ' https://vercel.live https://assets.vercel.com' : ''
  }`,
  `connect-src 'self'${
    isVercelPreview ? ' https://vercel.live wss://*.pusher.com' : ''
  }`,
  "worker-src 'self'",
  "manifest-src 'self'",
  ...(isVercelPreview ? ['frame-src https://vercel.live'] : []),
].join('; ');

/**
 * Globale Sicherheitsheader für alle Antworten (HTML, API, Assets, Fehler).
 * HSTS setzt die Plattform (Vercel) bereits selbst und wird hier bewusst
 * nicht angefasst (siehe Issue #30).
 */
const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  // Kompatibilitäts-Fallback zu frame-ancestors 'none'.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    // Nicht genutzte Browser-Features deaktivieren; WebAuthn/Passkeys
    // (publickey-credentials-*) bleiben explizit für die eigene Origin
    // erlaubt, damit Registrierung, Login und Conditional UI funktionieren.
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), ' +
      'publickey-credentials-create=(self), publickey-credentials-get=(self)',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Kein "X-Powered-By: Next.js" mehr ausliefern (Issue #30).
  poweredByHeader: false,
  env: {
    // Steht dem /sw.js-Route-Handler beim Build zur Verfügung.
    SW_VERSION,
  },
  headers: async () => [
    {
      // Alle Routen inklusive API, /sw.js und Fehlerantworten.
      source: '/:path*',
      headers: securityHeaders,
    },
    {
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Service-Worker-Allowed', value: '/' },
      ],
    },
  ],
};

export default nextConfig;
