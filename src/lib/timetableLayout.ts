import { toMinutes, type Slot } from '@/lib/types';

/** Position eines Slots bei Zeitüberschneidungen: Spur + Spuranzahl im Cluster */
export type SlotLane = { lane: number; lanes: number };

/**
 * Überlappen sich zwei Slots einer Bühne zeitlich, werden sie nebeneinander
 * in "Spuren" gelegt statt übereinander gezeichnet. Klassisches Kalender-
 * Layout: nach Startzeit sortieren, jeden Slot gierig in die erste freie
 * Spur legen; alle Slots eines zusammenhängenden Überlappungs-Clusters
 * teilen sich die Spaltenbreite durch die Spuranzahl des Clusters.
 *
 * Genutzt vom Timetable-Grid der App und vom Website-Embed (/embed).
 */
export function computeLanes(slots: Slot[]): Map<string, SlotLane> {
  const sorted = [...slots].sort(
    (a, b) =>
      toMinutes(a.start) - toMinutes(b.start) || toMinutes(b.end) - toMinutes(a.end)
  );
  const layout = new Map<string, SlotLane>();
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  const flush = () => {
    for (const s of cluster) layout.set(s.id, { lane: s.lane, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };
  for (const slot of sorted) {
    const start = toMinutes(slot.start);
    // Berührt der Slot keinen laufenden mehr, ist der Cluster abgeschlossen
    if (laneEnds.length > 0 && laneEnds.every((end) => end <= start)) flush();
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = toMinutes(slot.end);
    cluster.push({ id: slot.id, lane });
  }
  flush();
  return layout;
}

/**
 * Zuordnung Slot-ID -> Spur für einen ganzen Festivaltag: die Spuren werden
 * pro Bühne unabhängig berechnet.
 */
export function computeLanesByStage(daySlots: Slot[]): Map<string, SlotLane> {
  const byStage = new Map<string, Slot[]>();
  for (const slot of daySlots) {
    const list = byStage.get(slot.stageId);
    if (list) list.push(slot);
    else byStage.set(slot.stageId, [slot]);
  }
  const layout = new Map<string, SlotLane>();
  for (const stageSlots of byStage.values()) {
    computeLanes(stageSlots).forEach((v, id) => layout.set(id, v));
  }
  return layout;
}
