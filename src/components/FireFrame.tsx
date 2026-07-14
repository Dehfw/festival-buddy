'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { attachFire } from '@/lib/client/fireEngine';

/**
 * Feuerrahmen-Overlay für "Hot Slots" (>= HOT_SLOT_THRESHOLD feste Zusagen).
 * Absolut positioniert über der Karte legen. Die Flammen kommen aus einer
 * Doom-Fire-Simulation (fireEngine.ts) auf dem Canvas, der ein paar Pixel
 * über die Karte hinausragt; darunter liegt eine glühende Kante aus CSS
 * (.fire-frame in globals.css), die zugleich als Fallback ohne Canvas und
 * bei prefers-reduced-motion dient. pointer-events sind aus, Taps gehen
 * an die Karte.
 */
export function FireFrame({
  className = '',
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return attachFire(canvas);
  }, []);

  return (
    <span
      aria-hidden
      className={`fire-frame absolute ${className}`}
      style={style}
    >
      <canvas ref={canvasRef} />
    </span>
  );
}
