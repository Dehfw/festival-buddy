import { PUSH_BODY_MAX, PUSH_TITLE_MAX } from './push';
import type { FestivalBand } from './types';

/**
 * Text der Mitteilung „neue Bands im Lineup" – dieselben Limits wie jede
 * andere Mitteilung, weil sie 1:1 als Push rausgeht. Die Reihenfolge der
 * Bands bleibt die der Ankündigung (Headliner stehen dort vorn); passt die
 * Liste nicht in den Text, wird hinten gekürzt und der Rest gezählt.
 */

const CALL_TO_ACTION = 'Hör rein und merk dir, wen du sehen willst!';

function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** "A", "A und B", "A, B und C" */
function joinNames(names: string[], tail?: string): string {
  const parts = tail ? [...names, tail] : names;
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} und ${parts[parts.length - 1]}`;
}

export function lineupAnnouncementText(added: FestivalBand[]): {
  title: string;
  body: string;
} {
  const names = added.map((b) => b.name);
  if (names.length === 1) {
    return {
      title: cut(`Neu im Lineup: ${names[0]}`, PUSH_TITLE_MAX),
      body: `${names[0]} ist neu dabei. ${CALL_TO_ACTION}`,
    };
  }

  const title = `${names.length} neue Bands im Lineup`;
  const sentence = (shown: number) => {
    const rest = names.length - shown;
    const list = joinNames(
      names.slice(0, shown),
      rest > 0 ? `${rest} ${rest === 1 ? 'weitere Band' : 'weitere Bands'}` : undefined
    );
    return `${list} sind neu dabei. ${CALL_TO_ACTION}`;
  };
  // So viele Namen wie in den Text passen – mindestens einer.
  let shown = names.length;
  while (shown > 1 && sentence(shown).length > PUSH_BODY_MAX) shown--;
  return { title, body: cut(sentence(shown), PUSH_BODY_MAX) };
}
