import { NextResponse } from 'next/server';
import { getGroupPreviewByCode } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { normalizeInviteCode, type GroupPreview } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Öffentliche Mini-Vorschau für die Beitritts-Seite (?code=…): Name,
 * Festival, Mitgliederzahl, Bild. Läuft VOR dem Login (Invite-Link!),
 * deshalb ohne Session – aber nur per Code, nie per Gruppen-ID, und
 * ohne Mitgliederliste. Das Bild kommt als Data-URL mit (klein genug).
 */
export async function GET(req: Request) {
  if (!rateLimit(`preview:${clientIp(req)}`, 60, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: 'Zu viele Versuche – bitte kurz warten' },
      { status: 429 }
    );
  }
  const url = new URL(req.url);
  const code = normalizeInviteCode(url.searchParams.get('code') ?? '');
  if (code.length !== 8) {
    return NextResponse.json({ error: 'Code ungültig' }, { status: 404 });
  }
  const data = await getGroupPreviewByCode(code);
  if (!data) {
    return NextResponse.json({ error: 'Code ungültig' }, { status: 404 });
  }
  const preview: GroupPreview = {
    name: data.name,
    festivalName: data.festivalName,
    memberCount: data.memberCount,
    imageDataUrl:
      data.image && data.imageMime
        ? `data:${data.imageMime};base64,${data.image.toString('base64')}`
        : null,
  };
  return NextResponse.json({ preview }, { headers: { 'Cache-Control': 'no-store' } });
}
