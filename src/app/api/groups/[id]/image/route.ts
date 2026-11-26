import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { getGroupImage, getMemberRole, setGroupImage } from '@/lib/db';
import { isGroupAdmin } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Der Client verkleinert vor dem Upload; das hier ist die harte Grenze. */
const MAX_IMAGE_BYTES = 300 * 1024;
const ALLOWED_MIMES = new Set(['image/webp', 'image/jpeg', 'image/png']);

/** Passen die ersten Bytes zum angegebenen Bildtyp? (Content-Type kommt vom Client.) */
function hasImageSignature(bytes: Buffer, mime: string): boolean {
  switch (mime) {
    case 'image/png':
      return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/jpeg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/webp':
      return (
        bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
        bytes.subarray(8, 12).toString('latin1') === 'WEBP'
      );
    default:
      return false;
  }
}

/** Gruppenbild ausliefern (nur Mitglieder; Cache-Buster ?v=<imageVersion>) */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await readSessionUserId(req);
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

/** Gruppenbild setzen (nur Owner/Admins). Body = rohe Bilddaten. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const { id: groupId } = await params;
  if (!isGroupAdmin(await getMemberRole(groupId, userId))) {
    return NextResponse.json({ error: 'Nur Admins dürfen das' }, { status: 403 });
  }
  const mime = (req.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!ALLOWED_MIMES.has(mime)) {
    return NextResponse.json(
      { error: 'Nur WebP, JPEG oder PNG erlaubt' },
      { status: 415 }
    );
  }
  // Zu große Uploads gar nicht erst in den Speicher lesen.
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: 'Bild fehlt oder ist größer als 300 KB' },
      { status: 413 }
    );
  }
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: 'Bild fehlt oder ist größer als 300 KB' },
      { status: 413 }
    );
  }
  if (!hasImageSignature(bytes, mime)) {
    return NextResponse.json(
      { error: 'Nur WebP, JPEG oder PNG erlaubt' },
      { status: 415 }
    );
  }
  await setGroupImage(groupId, bytes, mime);
  return NextResponse.json({ ok: true });
}
