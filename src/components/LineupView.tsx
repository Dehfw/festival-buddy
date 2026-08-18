'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/lib/client/store';
import {
  bandSlug,
  formatTime,
  toMinutes,
  type FestivalBand,
  type Slot,
  type User,
} from '@/lib/types';
import { AvatarStack } from './Avatars';

/** Lesezeichen: gefüllt = gemerkt, Umriss = noch nicht */
function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 3.5h12a1 1 0 0 1 1 1v16l-7-4.2-7 4.2v-16a1 1 0 0 1 1-1z" />
    </svg>
  );
}

type Sort = 'az' | 'crew';

/**
 * Hauptansicht 3: das Lineup als reine Bandliste – die Ansicht für die
 * Zeit vor der Running Order. Sobald ein Festival seine ersten Bands
 * announced, kann die Crew sie hier durchhören (Spotify) und markieren,
 * wen sie sehen will. Die Merkungen hängen am Band-Slug und überstehen
 * damit den späteren Timetable-Import.
 *
 * Steht der Timetable schon, bleibt die Liste als A–Z-Register über alle
 * Bands nutzbar und zeigt zu jeder ihre Spielzeiten.
 */
export function LineupView({ onBandTap }: { onBandTap: (band: FestivalBand) => void }) {
  const { data, user, setBandInterest } = useApp();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('az');
  const [onlyMine, setOnlyMine] = useState(false);

  const bands = data?.timetable.bands ?? [];
  const interests = data?.bandInterests ?? [];
  const users = data?.users;
  const timetable = data?.timetable;

  // Beide Zuordnungen einmal pro Datenstand aufbauen, nicht pro Band: Bei
  // einem großen Festival (200 Bands, 233 Slots) liefe sonst bei jedem
  // Tastendruck im Suchfeld eine Schleife über alles.
  const fansBySlug = useMemo(() => {
    const byId = new Map((users ?? []).map((u) => [u.id, u]));
    const map = new Map<string, User[]>();
    for (const i of interests) {
      const u = byId.get(i.userId);
      if (!u) continue;
      const list = map.get(i.slug);
      if (list) list.push(u);
      else map.set(i.slug, [u]);
    }
    return map;
  }, [users, interests]);

  const slotsBySlug = useMemo(() => {
    const map = new Map<string, Slot[]>();
    if (!timetable) return map;
    const dayOrder = new Map(timetable.days.map((d, i) => [d.id, i]));
    for (const slot of timetable.slots) {
      const slug = bandSlug(slot.band);
      const list = map.get(slug);
      if (list) list.push(slot);
      else map.set(slug, [slot]);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          (dayOrder.get(a.dayId) ?? 0) - (dayOrder.get(b.dayId) ?? 0) ||
          toMinutes(a.start) - toMinutes(b.start)
      );
    }
    return map;
  }, [timetable]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = bands
      .filter((b) => q === '' || b.name.toLowerCase().includes(q))
      .map((band) => {
        const fans = fansBySlug.get(band.slug) ?? [];
        return {
          band,
          fans,
          mine: !!user && fans.some((u) => u.id === user.id),
        };
      })
      .filter((row) => !onlyMine || row.mine);
    // A–Z kommt schon sortiert aus dem Payload; nach Crew-Interesse wird
    // hier umsortiert, Gleichstand bleibt alphabetisch.
    return sort === 'crew'
      ? [...list].sort(
          (a, b) => b.fans.length - a.fans.length || a.band.name.localeCompare(b.band.name, 'de')
        )
      : list;
  }, [bands, fansBySlug, onlyMine, query, sort, user]);

  if (!data) return null;

  // Festival ohne gepflegtes Lineup: Der Tab ist dann gar nicht sichtbar,
  // aber ein leerer Pool kann auch durch einen alten Offline-Snapshot
  // entstehen – dann lieber erklären als eine leere Fläche zeigen.
  if (bands.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="text-4xl">📋</div>
        <p className="mt-3 text-sm text-ash">
          Für dieses Festival ist noch keine Band eingetragen. Sobald die
          ersten announced sind, stehen sie hier.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-4 pt-3 pb-1">
        <div className="mx-auto w-full max-w-2xl">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ash">
              🔍
            </span>
            <input
              type="text"
              inputMode="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Band suchen …"
              aria-label="Band suchen"
              className="w-full rounded-xl border border-rivet bg-steel py-2.5 pl-9 pr-9 text-sm text-bone placeholder:text-ash focus:border-blood/60 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Suche zurücksetzen"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ash transition active:scale-95 hover:text-bone"
              >
                ✕
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
            <Chip active={sort === 'az'} onClick={() => setSort('az')}>
              A–Z
            </Chip>
            <Chip active={sort === 'crew'} onClick={() => setSort('crew')}>
              🤘 Crew-Top
            </Chip>
            <Chip active={onlyMine} onClick={() => setOnlyMine((v) => !v)}>
              🔖 Nur meine
            </Chip>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-2 scrollbar-thin">
        <div className="mx-auto w-full max-w-2xl">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
              <div className="text-3xl">{onlyMine ? '🔖' : '🔎'}</div>
              <p className="mt-3 text-sm text-ash">
                {onlyMine
                  ? 'Du hast dir noch keine Band gemerkt. Tipp auf das Lesezeichen neben einer Band.'
                  : `Keine Band gefunden für „${query.trim()}".`}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map(({ band, fans, mine }) => (
                <LineupRow
                  key={band.slug}
                  band={band}
                  fans={fans}
                  slots={slotsBySlug.get(band.slug) ?? EMPTY_SLOTS}
                  mine={mine}
                  onOpen={() => onBandTap(band)}
                  onToggle={() => setBandInterest(band.slug, !mine)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold transition active:scale-95 ${
        active
          ? 'border-blood/60 bg-blood/15 text-bone'
          : 'border-rivet bg-steel text-ash'
      }`}
    >
      {children}
    </button>
  );
}

/** Stabile leere Liste – spart eine neue Referenz pro Render */
const EMPTY_SLOTS: Slot[] = [];

function LineupRow({
  band,
  fans,
  slots,
  mine,
  onOpen,
  onToggle,
}: {
  band: FestivalBand;
  fans: User[];
  /** Spielzeiten dieser Band; leer, solange nur das Lineup steht */
  slots: Slot[];
  mine: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const { data } = useApp();
  // Sobald der Timetable steht, zeigt die Zeile die Spielzeit mit an –
  // dieselbe Liste dient dann als A–Z-Register über alle Bands.
  const first = slots[0];
  const day = first ? data?.timetable.days.find((d) => d.id === first.dayId) : undefined;
  const stage = first ? data?.timetable.stages.find((s) => s.id === first.stageId) : undefined;

  return (
    <li
      className={`flex items-center gap-2 rounded-xl border ${
        mine ? 'border-dashed border-ember/60 bg-ember/5' : 'border-rivet bg-steel'
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left transition active:scale-[0.99]"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{band.name}</div>
          <div className="truncate text-[11px] text-ash">
            {first && day && stage
              ? `${day.label} · ${formatTime(first.start)} · ${stage.name}${
                  slots.length > 1 ? ` (+${slots.length - 1})` : ''
                }`
              : band.spotifyArtistId
                ? 'Auf Spotify reinhören'
                : 'Noch kein Timetable'}
          </div>
        </div>
        {fans.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5">
            <AvatarStack users={fans} size={20} max={4} />
            <span className="min-w-5 rounded-full bg-rivet px-1.5 py-0.5 text-center text-[11px] font-bold text-bone">
              {fans.length}
            </span>
          </div>
        )}
      </button>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={mine}
        aria-label={mine ? `${band.name} nicht mehr merken` : `${band.name} merken`}
        className={`mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg transition active:scale-90 ${
          mine ? 'text-ember' : 'text-ash/50'
        }`}
      >
        <BookmarkIcon filled={mine} />
      </button>
    </li>
  );
}
