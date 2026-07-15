'use client';

import { useRef, useState } from 'react';
import { resizeImage } from '@/lib/client/image';
import { useApp } from '@/lib/client/store';
import { formatInviteCode } from '@/lib/types';
import { Avatar } from './Avatars';
import { GroupAvatar } from './GroupAvatar';

/**
 * Bottom-Sheet für die aktive Gruppe – erreichbar über den Gruppen-Chip
 * UND das eigene Profilbild im Header. Aufbau (bewusst aufgeräumt):
 *   Kopf (Bild/Name/Festival) -> Einladen (immer sichtbar) ->
 *   aufklappbar: Mitglieder, Meine Gruppen, Owner-Einstellungen ->
 *   Fußzeile: Gruppe verlassen · Abmelden.
 */
export function GroupSheet({
  onClose,
  onOpenGroupGate,
}: {
  onClose: () => void;
  onOpenGroupGate: () => void;
}) {
  const { data, user, groups, setActiveGroup, refresh, refreshMe, logout } = useApp();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [editName, setEditName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const group = data?.group;
  if (!group || !user) return null;
  const isOwner = group.role === 'owner';
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

  const shareInvite = async () => {
    const url = `${location.origin}/join/${formatInviteCode(group.inviteCode)}`;
    const text = `Komm in unsere Festival-Gruppe „${group.name}“ (${group.festivalName})! Code: ${formatInviteCode(group.inviteCode)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: group.name, text, url });
        return;
      }
    } catch {
      return; // Nutzer hat das Teilen abgebrochen
    }
    try {
      await navigator.clipboard.writeText(url);
      flash('Link kopiert 📋');
    } catch {
      flash(url);
    }
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

  const leave = async () => {
    const warning =
      isOwner && members.length > 1
        ? 'Gruppe verlassen? Das dienstälteste Mitglied wird neuer Owner.'
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
      onClose();
    }
  };

  const doLogout = () => {
    if (!confirm('Abmelden? Dein Passkey bleibt auf dem Gerät.')) return;
    onClose();
    logout();
  };

  const otherGroups = (groups ?? []).filter((g) => g.id !== group.id);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label="Schließen"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />
      <div className="relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border-x border-t border-rivet bg-steel px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-rivet" />

        {/* Kopf: Bild + Name + Festival (Owner: Bild antippen = ändern) */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => isOwner && fileRef.current?.click()}
            disabled={!isOwner || busy}
            className="relative shrink-0 disabled:cursor-default"
            title={isOwner ? 'Gruppenbild ändern' : undefined}
          >
            <GroupAvatar
              groupId={group.id}
              name={group.name}
              imageVersion={group.imageVersion}
              size={56}
            />
            {isOwner && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-rivet bg-steel-2 text-[10px]">
                ✏️
              </span>
            )}
          </button>
          <div className="min-w-0 flex-1">
            {editName === null ? (
              <h2 className="truncate font-metal text-2xl font-black leading-tight">
                {group.name}
              </h2>
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

        {/* Einladen – der häufigste Griff, deshalb immer sichtbar */}
        <div className="mt-4 rounded-xl border border-rivet bg-steel-2 p-3.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-ash">
            Leute einladen
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-dashed border-rivet px-3 py-2 text-center font-mono text-lg font-bold tracking-[0.2em] text-bone">
              {formatInviteCode(group.inviteCode)}
            </code>
            <button
              onClick={shareInvite}
              className="shrink-0 rounded-lg bg-blood px-3.5 py-2.5 text-sm font-bold text-black active:scale-[0.97]"
            >
              Link teilen
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ash/70">
            Ein Code für alle: Link öffnen oder Code eintippen – fertig.
          </p>
        </div>

        {/* Mitglieder */}
        <details open className="mt-3 rounded-xl border border-rivet bg-steel-2 p-3.5">
          <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-ash">
            Mitglieder ({members.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5 text-sm">
                <Avatar user={m} size={26} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {m.name}
                  {m.id === user.id && <span className="text-ash"> (du)</span>}
                </span>
                {group.roles[m.id] === 'owner' && (
                  <span className="rounded-full bg-rivet px-2 py-0.5 text-[10px] font-bold uppercase text-ash">
                    Owner
                  </span>
                )}
                {isOwner && m.id !== user.id && (
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
            ))}
          </ul>
        </details>

        {/* Meine Gruppen */}
        <details
          open={otherGroups.length > 0}
          className="mt-3 rounded-xl border border-rivet bg-steel-2 p-3.5"
        >
          <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-ash">
            Meine Gruppen ({(groups ?? []).length})
          </summary>
          <ul className="mt-3 space-y-1.5">
            {otherGroups.map((g) => (
              <li key={g.id}>
                <button
                  onClick={() => {
                    setActiveGroup(g.id);
                    onClose();
                  }}
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
              </li>
            ))}
            <li>
              <button
                onClick={() => {
                  onClose();
                  onOpenGroupGate();
                }}
                className="w-full rounded-xl border border-dashed border-rivet px-3 py-2.5 text-sm font-bold text-ash"
              >
                + Gruppe gründen oder beitreten
              </button>
            </li>
          </ul>
        </details>

        {/* Owner-Einstellungen */}
        {isOwner && (
          <details className="mt-3 rounded-xl border border-rivet bg-steel-2 p-3.5">
            <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-ash">
              Einstellungen (Owner)
            </summary>

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
                onClick={() => setEditName(group.name)}
                disabled={busy}
                className="rounded-lg border border-rivet px-3 py-2 text-xs font-bold text-bone disabled:opacity-40"
              >
                ✏️ Umbenennen
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="rounded-lg border border-rivet px-3 py-2 text-xs font-bold text-bone disabled:opacity-40"
              >
                🖼️ Gruppenbild {group.imageVersion > 0 ? 'ändern' : 'hochladen'}
              </button>
              <button
                onClick={rotateCode}
                disabled={busy}
                className="rounded-lg border border-rivet px-3 py-2 text-xs font-bold text-ember disabled:opacity-40"
                title="Alter Einladungslink/-code wird sofort ungültig"
              >
                ↻ Code neu würfeln
              </button>
            </div>
          </details>
        )}

        {/* Fußzeile: dezent statt Riesen-Buttons */}
        <div className="mt-5 flex items-center justify-between border-t border-rivet pt-4 text-xs">
          <button
            onClick={leave}
            disabled={busy}
            className="font-bold uppercase tracking-wider text-blood disabled:opacity-40"
          >
            Gruppe verlassen
          </button>
          <button onClick={doLogout} className="flex items-center gap-1.5 text-ash">
            <Avatar user={user} size={18} />
            <span className="underline">Abmelden</span>
          </button>
        </div>
      </div>
    </div>
  );
}
