'use client';

import { initials, type User } from '@/lib/types';

export function Avatar({
  user,
  size = 24,
  ring = false,
}: {
  user: User;
  size?: number;
  ring?: boolean;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-black/85 select-none"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        backgroundColor: user.color,
        boxShadow: ring ? `0 0 0 2px #e7e7ee` : '0 0 0 1.5px rgba(0,0,0,.5)',
      }}
      title={user.name}
    >
      {initials(user.name)}
    </span>
  );
}

/** Gestapelte Avatar-Reihe, wie sie in den Timetable-Slots sitzt */
export function AvatarStack({
  users,
  size = 22,
  max = 5,
}: {
  users: User[];
  size?: number;
  max?: number;
}) {
  if (users.length === 0) return null;
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="inline-flex items-center" style={{ paddingLeft: size * 0.28 }}>
      {shown.map((u) => (
        <span key={u.id} style={{ marginLeft: -size * 0.28 }}>
          <Avatar user={u} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-rivet font-bold text-bone"
          style={{
            width: size,
            height: size,
            fontSize: size * 0.42,
            marginLeft: -size * 0.28,
            boxShadow: '0 0 0 1.5px rgba(0,0,0,.5)',
          }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
