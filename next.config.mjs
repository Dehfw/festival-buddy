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

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Steht dem /sw.js-Route-Handler beim Build zur Verfügung.
    SW_VERSION,
  },
  headers: async () => [
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
