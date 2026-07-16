import { FireFrame } from './FireFrame';

/*
 * Reines HTML-Abbild der App ("Unsere Bands"-Ansicht) in einem Handy-Rahmen.
 * Bewusst KEIN Screenshot-Bild: lädt schneller, bleibt scharf auf jedem
 * Display und zeigt sofort, was die App kann – Crew-Plan mit Hot Slot.
 * Statische Deko-Daten, absichtlich nah am echten ListView-Look gebaut.
 */

type Person = { i: string; c: string };
const P = {
  DA: { i: 'DA', c: '#35c5d8' },
  BR: { i: 'BR', c: '#e0457f' },
  CH: { i: 'CH', c: '#e8c33a' },
  LA: { i: 'LA', c: '#57c98a' },
  JD: { i: 'JD', c: '#4fb877' },
  BO: { i: 'BO', c: '#4a7a9a' },
  CL: { i: 'CL', c: '#d84a3a' },
  AL: { i: 'AL', c: '#b0a8c8' },
} satisfies Record<string, Person>;

type Slot = {
  time: string;
  stage: string;
  color: string;
  band: string;
  sub: string;
  crew: Person[];
  extra?: number; // "+N" auf dem letzten Avatar
  going: number;
  interested?: number;
  variant?: 'going' | 'interested' | 'plain' | 'hot';
};

const DAYS: { label: string; date: string; slots: Slot[] }[] = [
  {
    label: 'Montag',
    date: '27.07.',
    slots: [
      {
        time: '19:00',
        stage: 'WTJ',
        color: '#8f9b3c',
        band: 'Mambo Kurt',
        sub: 'Welcome To The Jungle · bis 20:00 Uhr',
        crew: [P.DA, P.BR],
        going: 2,
        variant: 'going',
      },
    ],
  },
  {
    label: 'Mittwoch',
    date: '29.07.',
    slots: [
      {
        time: '13:30',
        stage: 'LOU',
        color: '#d4a72c',
        band: 'Visions of Atlantis',
        sub: 'Louder · bis 14:30 Uhr',
        crew: [P.DA],
        going: 1,
        variant: 'going',
      },
      {
        time: '18:00',
        stage: 'FAS',
        color: '#ff5a17',
        band: 'The Butcher Sisters',
        sub: 'Faster · bis 19:00 Uhr',
        crew: [P.DA, P.BR, P.CH, P.LA],
        extra: 4,
        going: 8,
        variant: 'hot',
      },
      {
        time: '20:00',
        stage: 'FAS',
        color: '#ff5a17',
        band: 'Electric Bassboy',
        sub: 'Faster · bis 21:00 Uhr',
        crew: [P.DA, P.BR, P.LA, P.CH],
        extra: 1,
        going: 3,
        interested: 2,
        variant: 'going',
      },
      {
        time: '22:00',
        stage: 'FAS',
        color: '#ff5a17',
        band: 'Hämatom',
        sub: 'Faster · bis 00:00 Uhr',
        crew: [P.BR, P.LA, P.JD, P.BO],
        extra: 1,
        going: 3,
        interested: 2,
        variant: 'plain',
      },
    ],
  },
  {
    label: 'Donnerstag',
    date: '30.07.',
    slots: [
      {
        time: '13:30',
        stage: 'WCK',
        color: '#2fb8b8',
        band: 'Katerfahrt',
        sub: 'Wackinger Stage · bis 14:15 Uhr',
        crew: [P.CL, P.DA, P.CH],
        going: 1,
        interested: 2,
        variant: 'interested',
      },
      {
        time: '15:00',
        stage: 'WCK',
        color: '#2fb8b8',
        band: 'Vogelfrey',
        sub: 'Wackinger Stage · bis 16:00 Uhr',
        crew: [P.BR, P.LA, P.BO, P.DA],
        extra: 1,
        going: 2,
        interested: 3,
        variant: 'interested',
      },
      {
        time: '16:00',
        stage: 'LGH',
        color: '#c0396b',
        band: 'Heaven Shall Burn',
        sub: 'LGH Clubstage · bis 17:00 Uhr',
        crew: [P.BR, P.DA, P.CH],
        going: 1,
        interested: 2,
        variant: 'interested',
      },
      {
        time: '20:15',
        stage: 'WCK',
        color: '#2fb8b8',
        band: 'Kupfergold',
        sub: 'Wackinger Stage · bis 21:15 Uhr',
        crew: [P.BR, P.CH, P.AL, P.LA],
        extra: 1,
        going: 4,
        interested: 1,
        variant: 'interested',
      },
    ],
  },
];

function Ava({ p, faded }: { p: Person; faded?: boolean }) {
  return (
    <span
      className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[7px] font-bold text-black/85"
      style={{
        backgroundColor: p.c,
        marginLeft: -5,
        boxShadow: '0 0 0 1.5px #0b0b0f',
        opacity: faded ? 0.45 : 1,
      }}
    >
      {p.i}
    </span>
  );
}

function SlotCard({ s }: { s: Slot }) {
  const border =
    s.variant === 'interested'
      ? 'border-dashed border-ember/60 bg-ember/5'
      : s.variant === 'plain'
        ? 'border-rivet bg-steel'
        : 'border-blood/50 bg-blood/10';
  return (
    <div
      className={`relative flex items-center gap-2 rounded-xl border px-2 py-2 ${border}`}
    >
      {s.variant === 'hot' && <FireFrame className="inset-0 rounded-xl" />}
      <div
        className="flex h-9 w-10 shrink-0 flex-col items-center justify-center rounded-lg"
        style={{ backgroundColor: `${s.color}22` }}
      >
        <span className="text-[10px] font-black" style={{ color: s.color }}>
          {s.time}
        </span>
        <span
          className="text-[7px] font-bold uppercase tracking-wide"
          style={{ color: s.color }}
        >
          {s.stage}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-bold text-bone">{s.band}</div>
        <div className="truncate text-[10px] text-ash">{s.sub}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="flex items-center pl-[5px]">
          {s.crew.map((p) => (
            <Ava key={p.i} p={p} faded={s.variant === 'interested'} />
          ))}
          {s.extra ? (
            <span
              className="flex h-[18px] items-center justify-center rounded-full bg-rivet px-1 text-[8px] font-bold text-bone"
              style={{ marginLeft: -5, boxShadow: '0 0 0 1.5px #0b0b0f' }}
            >
              +{s.extra}
            </span>
          ) : null}
        </span>
        <span className="min-w-4 rounded-full bg-rivet px-1.5 py-0.5 text-center text-[10px] font-bold text-bone">
          {s.going}
        </span>
        {s.interested ? (
          <span className="rounded-full border border-dashed border-ember/60 px-1.5 py-0.5 text-[10px] font-bold text-ember">
            +{s.interested}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
}: {
  icon: string;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 ${
        active ? 'text-blood' : 'text-ash'
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="text-[8px] font-semibold uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

export function AppScreenshot() {
  return (
    <div className="mx-auto w-full max-w-[350px]">
      {/* Handy-Rahmen */}
      <div className="relative rounded-[2.6rem] border border-rivet bg-gradient-to-b from-steel-2 to-pit p-2.5 shadow-2xl shadow-black/70">
        <div className="pointer-events-none absolute inset-0 rounded-[2.6rem] ring-1 ring-white/5" />
        {/* Screen */}
        <div className="relative overflow-hidden rounded-[2.1rem] bg-pit">
          {/* Notch */}
          <div className="absolute left-1/2 top-2 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />

          {/* App-Header */}
          <div className="steel-sheen flex items-center justify-between px-3 pb-2 pt-7">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blood shadow-[0_0_10px_#ff5a17]" />
              <span className="font-metal text-sm uppercase leading-none tracking-[0.04em] text-bone">
                DEF
                <span
                  className="inline-block text-blood"
                  style={{ transform: 'scaleX(-1)' }}
                >
                  E
                </span>
                KT
              </span>
              <span className="flex items-center gap-1 rounded-full border border-rivet bg-steel-2 py-0.5 pl-0.5 pr-2">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blood text-[7px] font-black text-black">
                  🤘
                </span>
                <span className="text-[10px] font-bold text-bone">DEFƎKT</span>
              </span>
            </div>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#35c5d8] text-[9px] font-bold text-black/85 ring-2 ring-[#e7e7ee]">
              DA
            </span>
          </div>

          {/* Inhalt */}
          <div className="h-[430px] space-y-3 overflow-hidden px-3 pt-2">
            {DAYS.map((d) => (
              <div key={d.label} className="space-y-1.5">
                <div className="font-metal text-[11px] font-black uppercase tracking-wider text-ash">
                  {d.label}{' '}
                  <span className="text-ash/50">· {d.date}</span>
                </div>
                <div className="space-y-1.5">
                  {d.slots.map((s) => (
                    <SlotCard key={`${s.time}-${s.band}`} s={s} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Verlauf nach unten für den "endet hier"-Effekt */}
          <div className="pointer-events-none absolute inset-x-0 bottom-11 h-14 bg-gradient-to-t from-pit to-transparent" />

          {/* Bottom-Nav */}
          <div className="flex border-t border-rivet bg-steel">
            <NavItem icon="🗓️" label="Timetable" />
            <NavItem icon="🤘" label="Unsere Bands" active />
            <NavItem icon="🗺️" label="Bühnen" />
            <NavItem icon="⚙️" label="Admin" />
          </div>
        </div>
      </div>
    </div>
  );
}
