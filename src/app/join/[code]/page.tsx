'use client';

import { useRouter } from 'next/navigation';
import { use, useEffect } from 'react';
import { savePendingInvite } from '@/lib/client/sync';
import { normalizeInviteCode } from '@/lib/types';

/**
 * Landing-Page des geteilten Einladungslinks (/join/<code>): merkt sich
 * den Code in der sessionStorage (überlebt so den Passkey-Login) und
 * schickt den Browser zur App – das Gate dort zeigt die Vorschau und
 * fragt "Beitreten?".
 */
export default function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();

  useEffect(() => {
    const normalized = normalizeInviteCode(decodeURIComponent(code));
    if (normalized.length === 8) savePendingInvite(normalized);
    router.replace('/app');
  }, [code, router]);

  return (
    <main className="flex min-h-dvh items-center justify-center text-sm text-ash">
      Einladung wird geöffnet …
    </main>
  );
}
