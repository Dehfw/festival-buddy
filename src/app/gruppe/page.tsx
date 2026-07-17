'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/Avatars';
import { GroupAvatar } from '@/components/GroupAvatar';
import { GroupGate } from '@/components/GroupGate';
import { resizeImage } from '@/lib/client/image';
import { AppProvider, useApp } from '@/lib/client/store';
import { USER_COLORS } from '@/lib/ids';
import { formatInviteCode, isGroupAdmin } from '@/lib/types';

/**
 * Eigene Gruppen-Seite (statt Bottom-Sheet), erreichbar über Profilbild
 * und Gruppen-Chip im Header. Drei klar getrennte Bereiche:
 *   1. Aktive Gruppe: Einladen, Mitglieder, Admin-Einstellungen, Verlassen
 *   2. Meine Gruppen: wechseln, gründen/beitreten
 *   3. Konto: Abmelden
 */
function GroupPageInner() {
  const {
    ready,
    user,
    groups,
    activeGroupId,
    data,
    setActiveGroup,
    refresh,
    refreshMe,
    setUserColor,
    logout,
  } = useApp();
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [editName, setEditName] = useState<string | null>(null);
  const [showGroupGate, setShowGroupGate] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Ohne Login bzw. ohne Gruppe übernimmt das Gate auf der Startseite
  useEffect(() => {
    if (ready && (!user || (groups !== null && groups.length === 0))) {
      router.replace('/app');
    }
  }, [ready, user, groups, router]);

  if (!ready || !user) return null;

  const group = data?.group;
  if (!group || group.id !== activeGroupId) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-sm text-ash">
        Lade Gruppe …
      </main>
    );
  }
  const isOwner = group.role === 'owner';
  const isAdmin = isGroupAdmin(group.role);
  const members = data.users;

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(''), 2500);
  };

  const api = async (
    input: string,
    init: RequestInit,
    okMsg?: string
  ): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    try {
      const res = await fetch(input, init);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        flash(body?.error ?? `Fehler (${res.status})`);
        return false;
      }
      if (okMsg) flash(okMsg);
      await refresh();
      void refreshMe();
      return true;
    } catch {
      flash('Keine Verbindung – dafür braucht es Netz');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const patch = (body: object, okMsg?: string) =>
    api(
      `/api/groups/${encodeURIComponent(group.id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      okMsg
    );

  const inviteUrl = () =>
    `${location.origin}/join/${formatInviteCode(group.inviteCode)}`;

  /** In die Zwischenablage kopieren; Fallback für ältere Browser */
  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(okMsg);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        flash(okMsg);
      } catch {
        flash(text); // wenigstens anzeigen, dann kann man manuell kopieren
      }
      document.body.removeChild(ta);
    }
  };

  const shareInvite = async () => {
    const url = inviteUrl();
    const text = `Komm in unsere Festival-Gruppe „${group.name}“ (${group.festivalName})! Code: ${formatInviteCode(group.inviteCode)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: group.name, text, url });
        return;
      }
    } catch {
      return; // Nutzer hat das Teilen abgebrochen
    }
    await copyText(url, 'Link kopiert 📋');
  };

  const rotateCode = async () => {
    if (!confirm('Neuen Code würfeln? Der alte Link/Code wird sofort ungültig.'))
      return;
    await patch({ rotateCode: true }, 'Neuer Code aktiv');
  };

  const saveName = async () => {
    const name = editName?.trim() ?? '';
    if (name.length < 2) return;
    if (await patch({ name }, 'Umbenannt')) setEditName(null);
  };

  const setThreshold = (next: number) => {
    void patch({ hotThreshold: next });
  };

  const uploadImage = async (file: File) => {
    setStatus('Bild wird verkleinert …');
    const resized = await resizeImage(file);
    if (!resized) {
      flash('Bild konnte nicht verarbeitet werden');
      return;
    }
    await api(
      `/api/groups/${encodeURIComponent(group.id)}/image`,
      { method: 'POST', headers: { 'Content-Type': resized.mime }, body: resized.blob },
      'Gruppenbild gespeichert'
    );
  };

  const kick = async (userId: string, name: string) => {
    if (!confirm(`${name} wirklich aus der Gruppe entfernen?`)) return;
    await api(
      `/api/groups/${encodeURIComponent(group.id)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
      `${name} entfernt`
    );
  };

  const setRole = async (userId: string, name: string, role: 'admin' | 'member') => {
    const question =
      role === 'admin'
        ? `${name} zum Admin machen? Admins können die Gruppe bearbeiten, Mitglieder entfernen und weitere Admins ernennen.`
        : `${name} die Admin-Rechte entziehen?`;
    if (!confirm(question)) return;
    await api(
      `/api/groups/${encodeURIComponent(group.id)}/members/${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      },
      role === 'admin' ? `${name} ist jetzt Admin` : `${name} ist kein Admin mehr`
    );
  };

  const leave = async () => {
    const warning =
      isOwner && members.length > 1
        ? 'Gruppe verlassen? Der dienstälteste Admin (sonst das dienstälteste Mitglied) wird neuer Owner.'
        : members.length === 1
          ? 'Du bist das letzte Mitglied – die Gruppe wird dabei gelöscht. Sicher?'
          : 'Gruppe wirklich verlassen?';
    if (!confirm(warning)) return;
    const ok = await api(
      `/api/groups/${encodeURIComponent(group.id)}/leave`,
      { method: 'POST' }
    );
    if (ok) {
      await refreshMe();
      router.push('/app');
    }
  };

  const doLogout = () => {
    if (!confirm('Abmelden? Dein Passkey bleibt auf dem Gerät.')) return;
    logout();
    // Nach dem Abmelden zurück auf die öffentliche Startseite (mit Login).
    router.push('/');
  };

  const switchTo = (id: string) => {
    setActiveGroup(id);
    router.push('/app');
  };

  const changeColor = async (color: string) => {
    if (busy || color === user.color) return;
    setBusy(true);
    try {
      flash(
        (await setUserColor(color))
          ? 'Icon-Farbe geändert'
          : 'Farbe konnte nicht gespeichert werden – braucht Netz'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-lg px-4 pb-16 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <h1 className="font-metal text-xl font-black uppercase">Gruppe</h1>
        <Link href="/app" className="text-sm text-ash underline">
          ← App
        </Link>
      </div>

      {/* ---------- 1) Aktive Gruppe ---------- */}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => isAdmin && fileRef.current?.click()}
          disabled={!isAdmin || busy}
          className="group relative shrink-0 disabled:cursor-default"
          title={isAdmin ? 'Gruppenbild ändern' : undefined}
        >
          <GroupAvatar
            groupId={group.id}
            name={group.name}
            imageVersion={group.imageVersion}
            size={64}
          />
          {isAdmin && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-rivet bg-steel-2 text-[10px] transition-colors group-hover:border-blood group-hover:bg-rivet">
              ✏️
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          {editName === null ? (
            <div className="flex items-center gap-1.5">
              <h2 className="truncate font-metal text-2xl font-black leading-tight">
                {group.name}
              </h2>
              {isAdmin && (
                <button
                  onClick={() => setEditName(group.name)}
                  disabled={busy}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-rivet bg-steel-2 text-sm text-ash transition-colors hover:border-blood hover:bg-rivet hover:text-bone active:scale-95 disabled:opacity-40"
                  title="Gruppe umbenennen"
                  aria-label="Gruppe umbenennen"
                >
                  ✏️
                </button>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={editName}
                maxLength={40}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-rivet bg-steel-2 px-2 py-1.5 text-base text-bone outline-none focus:border-blood"
              />
              <button
                onClick={saveName}
                disabled={busy || (editName?.trim().length ?? 0) < 2}
                className="shrink-0 rounded-lg bg-blood px-3 text-sm font-bold text-black disabled:opacity-40"
              >
                ✓
              </button>
            </div>
          )}
          <p className="text-xs text-ash">
            {group.festivalName} · {members.length}{' '}
            {members.length === 1 ? 'Mitglied' : 'Mitglieder'}
          </p>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadImage(f);
          e.target.value = '';
        }}
      />

      {status && (
        <p className="mt-3 rounded-xl border border-rivet bg-steel-2 px-3 py-2 text-xs text-bone">
          {status}
        </p>
      )}

      {/* Einladen */}
      <div className="mt-4 rounded-xl border border-rivet bg-steel p-3.5">
        <div className="text-xs font-semibold uppercase tracking-wider text-ash">
          Leute einladen
        </div>
        <button
          onClick={() =>
            copyText(formatInviteCode(group.inviteCode), 'Code kopiert 📋')
          }
          title="Code kopieren"
          className="mt-2 w-full rounded-lg border border-dashed border-rivet px-3 py-2 text-center font-mono text-lg font-bold tracking-[0.2em] text-bone active:scale-[0.99]"
        >
          {formatInviteCode(group.inviteCode)}
        </button>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => copyText(inviteUrl(), 'Link kopiert 📋')}
            className="flex-1 rounded-lg border border-rivet px-3.5 py-2.5 text-sm font-bold text-bone active:scale-[0.97]"
          >
            🔗 Link kopieren
          </button>
          <button
            onClick={shareInvite}
            className="flex-1 rounded-lg bg-blood px-3.5 py-2.5 text-sm font-bold text-black active:scale-[0.97]"
          >
            Link teilen
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ash/70">
          Ein Code für alle: Link öffnen oder Code eintippen – fertig.
          Code antippen kopiert ihn.
        </p>
      </div>

      {/* Mitglieder */}
      <div className="mt-3 rounded-xl border border-rivet bg-steel p-3.5">
        <div className="text-xs font-semibold uppercase tracking-wider text-ash">
          Mitglieder ({members.length})
        </div>
        <ul className="mt-3 space-y-2.5">
          {members.map((m) => {
            const role = group.roles[m.id];
            // Owner ist unantastbar; die eigene Rolle ändert man nicht selbst
            const manageable = isAdmin && m.id !== user.id && role !== 'owner';
            return (
              <li key={m.id} className="flex items-center gap-2.5 text-sm">
                <Avatar user={m} size={26} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {m.name}
                  {m.id === user.id && <span className="text-ash"> (du)</span>}
                </span>
                {role === 'owner' && (
                  <span className="rounded-full bg-rivet px-2 py-0.5 text-[10px] font-bold uppercase text-ash">
                    Owner
                  </span>
                )}
                {role === 'admin' && (
                  <span className="rounded-full bg-rivet px-2 py-0.5 text-[10px] font-bold uppercase text-ember">
                    Admin
                  </span>
                )}
                {manageable && (
                  <button
                    onClick={() =>
                      setRole(m.id, m.name, role === 'admin' ? 'member' : 'admin')
                    }
                    disabled={busy}
                    className="rounded-full border border-rivet px-2 py-0.5 text-[10px] font-bold uppercase text-ash disabled:opacity-40"
                    title={
                      role === 'admin'
                        ? `${m.name} die Admin-Rechte entziehen`
                        : `${m.name} zum Admin machen`
                    }
                  >
                    {role === 'admin' ? '− Admin' : '+ Admin'}
                  </button>
                )}
                {manageable && (
                  <button
                    onClick={() => kick(m.id, m.name)}
                    disabled={busy}
                    className="text-xs font-bold text-blood disabled:opacity-40"
                    title={`${m.name} entfernen`}
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {isAdmin && (
          <p className="mt-2.5 text-[11px] leading-relaxed text-ash/70">
            Admins können die Gruppe bearbeiten, Mitglieder entfernen und
            weitere Admins ernennen. Der Owner bleibt unantastbar.
          </p>
        )}
      </div>

      {/* Admin-Einstellungen */}
      {isAdmin && (
        <div className="mt-3 rounded-xl border border-rivet bg-steel p-3.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-ash">
            Einstellungen (Admins)
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm text-bone">
              🔥 Feuerrahmen ab
              <span className="ml-1 text-[11px] text-ash">
                {group.hotThreshold === 0
                  ? '– aus'
                  : `${group.hotThreshold} festen Zusagen`}
              </span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setThreshold(Math.max(0, group.hotThreshold - 1))}
                disabled={busy || group.hotThreshold <= 0}
                className="h-8 w-8 rounded-lg border border-rivet text-lg font-bold text-bone disabled:opacity-30"
              >
                −
              </button>
              <span className="w-8 text-center font-mono text-base font-bold text-bone">
                {group.hotThreshold === 0 ? 'aus' : group.hotThreshold}
              </span>
              <button
                onClick={() => setThreshold(Math.min(99, group.hotThreshold + 1))}
                disabled={busy || group.hotThreshold >= 99}
                className="h-8 w-8 rounded-lg border border-rivet text-lg font-bold text-bone disabled:opacity-30"
              >
                +
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={rotateCode}
              disabled={busy}
              className="rounded-lg border border-rivet px-3 py-2 text-xs font-bold text-ember disabled:opacity-40"
              title="Alter Einladungslink/-code wird sofort ungültig"
            >
              ↻ Code neu würfeln
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 text-right">
        <button
          onClick={leave}
          disabled={busy}
          className="text-xs font-bold uppercase tracking-wider text-blood disabled:opacity-40"
        >
          Gruppe verlassen
        </button>
      </div>

      {/* ---------- 2) Meine Gruppen (klar abgetrennt) ---------- */}
      <div className="mt-10 mb-3 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-ash/60">
        <span className="h-px flex-1 bg-rivet" />
        Meine Gruppen
        <span className="h-px flex-1 bg-rivet" />
      </div>
      <ul className="space-y-1.5">
        {(groups ?? []).map((g) => (
          <li key={g.id}>
            {g.id === group.id ? (
              <div className="flex w-full items-center gap-2.5 rounded-xl border border-blood/50 bg-blood/10 px-3 py-2">
                <GroupAvatar
                  groupId={g.id}
                  name={g.name}
                  imageVersion={g.imageVersion}
                  size={28}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-bone">
                    {g.name}
                  </span>
                  <span className="block text-[11px] text-ash">
                    {g.festivalName}
                  </span>
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider text-blood">
                  aktiv
                </span>
              </div>
            ) : (
              <button
                onClick={() => switchTo(g.id)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-rivet bg-steel px-3 py-2 text-left"
              >
                <GroupAvatar
                  groupId={g.id}
                  name={g.name}
                  imageVersion={g.imageVersion}
                  size={28}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-bone">
                    {g.name}
                  </span>
                  <span className="block text-[11px] text-ash">
                    {g.festivalName}
                  </span>
                </span>
                <span className="text-xs text-ash">wechseln →</span>
              </button>
            )}
          </li>
        ))}
        <li>
          <button
            onClick={() => setShowGroupGate(true)}
            className="w-full rounded-xl border border-dashed border-rivet px-3 py-2.5 text-sm font-bold text-ash"
          >
            + Gruppe gründen oder beitreten
          </button>
        </li>
      </ul>

      {/* ---------- 3) Konto ---------- */}
      <div className="mt-10 mb-3 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-ash/60">
        <span className="h-px flex-1 bg-rivet" />
        Konto
        <span className="h-px flex-1 bg-rivet" />
      </div>
      {/* Eigene Icon-Farbe */}
      <div className="mb-3 rounded-xl border border-rivet bg-steel p-3.5">
        <div className="flex items-center gap-2.5">
          <Avatar user={user} size={40} ring />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-bone">Deine Icon-Farbe</div>
            <div className="text-[11px] text-ash">
              So erscheint dein Avatar bei den anderen
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-10 gap-2">
          {USER_COLORS.map((c) => {
            const active = c === user.color;
            return (
              <button
                key={c}
                onClick={() => changeColor(c)}
                disabled={busy}
                className="relative aspect-square rounded-full transition active:scale-90 disabled:opacity-50"
                style={{
                  backgroundColor: c,
                  boxShadow: active ? '0 0 0 2px #e7e7ee' : '0 0 0 1.5px #0b0b0f',
                }}
                title={active ? 'Aktuelle Farbe' : 'Diese Farbe wählen'}
                aria-label={`Icon-Farbe ${c}`}
                aria-pressed={active}
              >
                {active && (
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-black/85">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={doLogout}
        className="flex w-full items-center gap-2.5 rounded-xl border border-rivet bg-steel px-3 py-2.5 text-left"
      >
        <Avatar user={user} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-bone">
            {user.name}
          </span>
          <span className="block text-[11px] text-ash">
            Passkey bleibt auf dem Gerät
          </span>
        </span>
        <span className="text-xs text-ash underline">Abmelden</span>
      </button>

      {showGroupGate && <GroupGate onClose={() => setShowGroupGate(false)} />}
    </main>
  );
}

export default function GroupPage() {
  return (
    <AppProvider>
      <GroupPageInner />
    </AppProvider>
  );
}
