'use client';

import type { CSSProperties } from 'react';

/**
 * Feuerrahmen-Overlay für "Hot Slots" (>= HOT_SLOT_THRESHOLD feste Zusagen).
 * Absolut positioniert über der Karte legen – die Flammen entstehen rein
 * per CSS (.fire-frame in globals.css) und schlagen ein paar Pixel über
 * den Rand hinaus. pointer-events sind aus, Taps gehen an die Karte.
 */
export function FireFrame({
  className = '',
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={`fire-frame absolute ${className}`}
      style={style}
    />
  );
}
