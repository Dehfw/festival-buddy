import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { getGroupImage, getMemberRole, setGroupImage } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Der Client verkleinert vor dem Upload; das hier ist die harte Grenze. */
const MAX_IMAGE_BYTES = 300 * 1024;
const ALLOWED_MIMES = new Set(['image/webp', 'image/jpeg', 'image/png']);

/** Gruppenbild ausliefern (nur Mitglieder; Cache-Buster ?v=<imageVersion>) */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const { id: groupId } = await params;
  if (!(await getMemberRole(groupId, userId))) {
    return NextResponse.json({ error: 'Kein Mitglied dieser Gruppe' }, { status: 403 });
  }
  const img = await getGroupImage(groupId);
  if (!img) {
    return NextResponse.json({ error: 'Kein Gruppenbild' }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(img.image), {
    headers: {
      'Content-Type': img.mime,
      // URL enthält ?v=<imageVersion> -> darf aggressiv gecacht werden
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}

/** Gruppenbild setzen (nur Owner). Body = rohe Bilddaten. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const { id: groupId } = await params;
  if ((await getMemberRole(groupId, userId)) !== 'owner') {
    return NextResponse.json({ error: 'Nur der Owner darf das' }, { status: 403 });
  }
  const mime = (req.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!ALLOWED_MIMES.has(mime)) {
    return NextResponse.json(
      { error: 'Nur WebP, JPEG oder PNG erlaubt' },
      { status: 415 }
    );
  }
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: 'Bild fehlt oder ist größer als 300 KB' },
      { status: 413 }
    );
  }
  await setGroupImage(groupId, bytes, mime);
  return NextResponse.json({ ok: true });
}
