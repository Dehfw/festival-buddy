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
 * Die beiden schrägen Balken vor der MerchMaster-Wortmarke. Bewusst als
 * Geometrie und nicht als Schriftzeichen: So sitzen Winkel und Abstand
 * unabhängig von der verfügbaren Schrift, und die Marke skaliert über
 * `em` mit der Schriftgröße ihres Wortmarks mit.
 */
function BrandSlashes() {
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-[0.1em]">
      <span className="block h-[0.8em] w-[0.13em] -skew-x-12 bg-blood" />
      <span className="block h-[0.8em] w-[0.13em] -skew-x-12 bg-blood" />
    </span>
  );
}

/**
 * MerchMaster-Wortmarke (merchmaster.app): „//MERCHMASTER" – zwei orange
 * Schrägbalken vor einer fetten kursiven Versalienschrift.
 *  - byline: Absenderzeile unter dem Produktnamen („by //MERCHMASTER")
 *  - mini: eigenständige Wortmarke, z. B. im Band-Funnel
 *  - hero: großes Wortmark mit Glut
 */
export function MerchMasterLogo({
  variant = 'mini',
}: {
  variant?: 'inline' | 'byline' | 'mini' | 'hero';
}) {
  if (variant === 'hero') {
    return (
      <span
        data-no-i18n
        className="inline-flex select-none items-center gap-[0.22em] text-4xl leading-none sm:text-5xl"
        style={{ filter: 'drop-shadow(0 0 40px rgba(255,90,23,.35))' }}
      >
        <BrandSlashes />
        <span className="font-black italic uppercase tracking-[-0.01em] text-bone">
          MerchMaster
        </span>
      </span>
    );
  }
  if (variant === 'byline') {
    return (
      <span
        data-no-i18n
        className="inline-flex select-none items-baseline gap-[0.4em] whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.28em] text-ash/70"
      >
        by
        <span className="inline-flex items-center gap-[0.28em] text-[10px] tracking-normal">
          <BrandSlashes />
          <span className="font-black italic uppercase tracking-[-0.01em] text-ash">
            MerchMaster
          </span>
        </span>
      </span>
    );
  }
  return (
    <span
      data-no-i18n
      className={`inline-flex select-none items-center gap-[0.22em] leading-none ${
        variant === 'inline' ? 'align-baseline text-[1em]' : 'text-lg'
      }`}
    >
      <BrandSlashes />
      <span className="font-black italic uppercase tracking-[-0.01em] text-bone">
        MerchMaster
      </span>
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
