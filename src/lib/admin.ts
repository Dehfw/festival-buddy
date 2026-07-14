/** Einfacher Passwortschutz für den Admin-Bereich (per ENV überschreibbar) */
export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'wacken2026';
}

export function isAdminRequest(req: Request): boolean {
  return req.headers.get('x-admin-key') === getAdminPassword();
}
