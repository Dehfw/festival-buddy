'use client';

import { colorForName } from '@/lib/ids';
import { initials } from '@/lib/types';

/**
 * Rundes Gruppenbild; ohne Bild ein Initialen-Avatar in deterministischer
 * Farbe (wie die Nutzer-Avatare). imageVersion dient als Cache-Buster.
 */
export function GroupAvatar({
  groupId,
  name,
  imageVersion,
  size,
  imageDataUrl,
}: {
  groupId?: string;
  name: string;
  imageVersion?: number;
  size: number;
  /** Alternative Quelle (Join-Vorschau liefert das Bild als Data-URL) */
  imageDataUrl?: string | null;
}) {
  const src =
    imageDataUrl ??
    (groupId && imageVersion
      ? `/api/groups/${encodeURIComponent(groupId)}/image?v=${imageVersion}`
      : null);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full border border-rivet object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-black uppercase text-black"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        backgroundColor: colorForName(name),
      }}
    >
      {initials(name)}
    </span>
  );
}
