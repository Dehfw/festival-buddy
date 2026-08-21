'use client';

/**
 * Markenebene: Festival Buddy ist ein kostenloses Tool von MerchMaster
 * (merchmaster.app – die App für den Merch-Stand). Die Wortmarken leben
 * bewusst nur in dieser Datei, damit ein Nachziehen des MerchMaster-Looks
 * eine Ein-Datei-Änderung bleibt.
 *
 * Lockup: „FESTIVAL BUDDY" ist die sichtbare Produktmarke, „by MERCHMASTER"
 * der Absender darunter.
 */

/** Externer Link zur MerchMaster-Website – überall derselbe. */
export const MERCHMASTER_URL = 'https://merchmaster.app';

/** Größen des Produkt-Wortmarks. compact = App-Topbar, mini = Website-Topbar. */
type WordmarkSize = 'compact' | 'mini' | 'hero';

/**
 * Festival-Buddy-Wortmarke. „Buddy" trägt das Signal-Orange, damit die
 * Marke auch als reines Textlogo einen Wiedererkennungsanker hat.
 */
export function FestivalBuddyLogo({ variant = 'mini' }: { variant?: WordmarkSize }) {
  if (variant === 'hero') {
    return (
      <span data-no-i18n className="inline-flex select-none flex-col leading-none">
        <span className="font-metal text-xl uppercase tracking-[0.42em] text-bone/80 sm:text-2xl">
          Festival
        </span>
        <span
          className="font-metal -mt-1 text-6xl uppercase leading-none text-blood sm:text-7xl"
          style={{ textShadow: '0 0 40px rgba(255,90,23,.45)' }}
        >
          Buddy
        </span>
      </span>
    );
  }
  return (
    <span
      data-no-i18n
      className={`font-metal select-none whitespace-nowrap uppercase leading-none tracking-[0.04em] text-bone ${
        variant === 'compact' ? 'text-sm' : 'text-base'
      }`}
    >
      Festival <span className="text-blood">Buddy</span>
    </span>
  );
}

/**
 * MerchMaster-Wortmarke.
 *  - byline: Absenderzeile unter dem Produktnamen („by MERCHMASTER")
 *  - mini: eigenständige Wortmarke, z. B. im Band-Funnel
 *  - hero: großes Wortmark mit Glut
 */
export function MerchMasterLogo({
  variant = 'mini',
}: {
  variant?: 'byline' | 'mini' | 'hero';
}) {
  if (variant === 'hero') {
    return (
      <span
        data-no-i18n
        className="font-metal select-none text-4xl uppercase leading-none text-blood sm:text-5xl"
        style={{ textShadow: '0 0 40px rgba(255,90,23,.45)' }}
      >
        Merch<span className="text-bone">Master</span>
      </span>
    );
  }
  if (variant === 'byline') {
    return (
      <span data-no-i18n className="select-none whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.28em] text-ash/70">
        by{' '}
        <span className="font-bold text-ash">
          Merch<span className="text-blood">Master</span>
        </span>
      </span>
    );
  }
  return (
    <span data-no-i18n className="font-metal select-none text-lg uppercase leading-none tracking-[0.04em] text-bone">
      Merch<span className="text-blood">Master</span>
    </span>
  );
}

/**
 * Volles Lockup aus Produktmarke und Absender – überall dort, wo bisher die
 * Sponsorenmarke stand: App-Topbar, Landing, Gates, Footer.
 */
export function BrandLockup({
  variant = 'mini',
  align = 'center',
}: {
  variant?: WordmarkSize;
  align?: 'start' | 'center';
}) {
  return (
    <span
      className={`inline-flex flex-col leading-none ${
        align === 'start' ? 'items-start' : 'items-center'
      } ${variant === 'hero' ? 'gap-2.5' : 'gap-1'}`}
    >
      <FestivalBuddyLogo variant={variant} />
      <MerchMasterLogo variant="byline" />
    </span>
  );
}
