'use client';

/**
 * DEFƎKT-Wortmarke (defekt.shop). Das gespiegelte E wird wie auf der
 * Original-Seite per scaleX(-1) gedreht. Zwei Varianten:
 *  - mini: Topbar-Stil (Off-White, oranges Ǝ)
 *  - hero: großes oranges Wortmark mit Glow (Startscreen)
 */
export function DefektLogo({ variant = 'mini' }: { variant?: 'mini' | 'hero' }) {
  if (variant === 'hero') {
    return (
      <span
        className="font-metal text-6xl uppercase leading-none text-blood select-none"
        style={{ textShadow: '0 0 40px rgba(255,90,23,.45)' }}
      >
        DEF
        <span className="inline-block" style={{ transform: 'scaleX(-1)' }}>
          E
        </span>
        KT
      </span>
    );
  }
  return (
    <span className="font-metal text-lg uppercase leading-none tracking-[0.04em] text-bone select-none">
      DEF
      <span className="inline-block text-blood" style={{ transform: 'scaleX(-1)' }}>
        E
      </span>
      KT
    </span>
  );
}
