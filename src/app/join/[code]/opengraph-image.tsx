import { ImageResponse } from 'next/og';
import { loadInvitePreview } from './preview';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Einladung zu einer Festival-Gruppe im Festival Buddy';

/** Satori (der OG-Renderer) kann kein WebP – dann eben ohne Gruppenbild. */
const EMBEDDABLE_MIMES = new Set(['image/png', 'image/jpeg']);

/**
 * Vorschaubild des Einladungslinks (og:image für WhatsApp & Co.):
 * Gruppenname und Festival groß auf DEFƎKT-Schwarz mit Orange, dazu
 * Mitgliederzahl und – wenn vorhanden und einbettbar – das Gruppenbild.
 * Unbekannter Code oder DB-Fehler ergeben die generische Variante,
 * damit der Crawler nie einen Fehler statt eines Bildes sieht.
 */
export default async function InviteImage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const preview = await loadInvitePreview(code);

  const name = preview?.name ?? 'Deine Festival-Crew';
  const festival = preview?.festivalName ?? 'Wer geht zu welcher Band?';
  const members = preview
    ? preview.memberCount === 1
      ? '1 Person ist schon dabei'
      : `${preview.memberCount} Leute sind schon dabei`
    : null;
  const avatar =
    preview?.image && preview.imageMime && EMBEDDABLE_MIMES.has(preview.imageMime)
      ? `data:${preview.imageMime};base64,${preview.image.toString('base64')}`
      : null;

  // Lange Namen kleiner, damit sie in die Karte passen statt abzuschneiden.
  const nameSize =
    name.length > 34 ? 52 : name.length > 22 ? 64 : name.length > 12 ? 78 : 92;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px 48px',
          backgroundColor: '#0a0a0a',
          backgroundImage:
            'linear-gradient(160deg, #1c1c1c 0%, #0a0a0a 55%, #141414 100%)',
          color: '#f4f1ea',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 1200,
            height: 10,
            backgroundImage: 'linear-gradient(90deg, #ff5a17, #ff7a2a)',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              style={{ width: 20, height: 20, backgroundColor: '#ff5a17' }}
            />
            <div
              style={{ fontSize: 30, fontWeight: 700, letterSpacing: 5 }}
            >
              FESTIVAL BUDDY
            </div>
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 5,
              color: '#ff7a2a',
              border: '2px solid #ff5a17',
              borderRadius: 999,
              padding: '10px 26px',
            }}
          >
            EINLADUNG
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            gap: 44,
            paddingTop: 24,
            paddingBottom: 24,
          }}
        >
          {avatar ? (
            <img
              src={avatar}
              width={180}
              height={180}
              style={{
                borderRadius: 28,
                border: '3px solid #2a2622',
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div
              style={{
                fontSize: nameSize,
                fontWeight: 700,
                lineHeight: 1.05,
              }}
            >
              {name}
            </div>
            <div
              style={{
                fontSize: 42,
                fontWeight: 700,
                color: '#ff7a2a',
                marginTop: 20,
              }}
            >
              {festival}
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 29,
            color: '#8a8682',
          }}
        >
          <div style={{ display: 'flex' }}>{members ?? ''}</div>
          <div style={{ display: 'flex' }}>Wer geht zu welcher Band?</div>
        </div>
      </div>
    ),
    size
  );
}
