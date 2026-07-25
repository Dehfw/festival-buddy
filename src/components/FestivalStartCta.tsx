'use client';

import { useRouter } from 'next/navigation';
import { savePendingFestival } from '@/lib/client/sync';

/**
 * Call-to-Action einer Festival-Landingpage (z. B. /partysan): merkt sich
 * das Festival in der sessionStorage (überlebt so den Passkey-Login) und
 * schickt den Browser zur App – im GroupGate ist das Festival dann bei
 * "Neue Gruppe gründen" bereits vorausgewählt.
 */
export function FestivalStartCta({
  festivalId,
  className,
  style,
  children,
}: {
  festivalId: string;
  className?: string;
  /** z. B. die Akzentfarbe des Festivals (kommt nicht aus dem Tailwind-Theme) */
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={() => {
        savePendingFestival(festivalId);
        router.push('/app');
      }}
    >
      {children}
    </button>
  );
}
