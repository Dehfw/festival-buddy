import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { getTimetable, mutateDb } from '@/lib/db';
import type { Blueprint, BlueprintElement, Poi, PoiType } from '@/lib/types';

export const dynamic = 'force-dynamic';

const POI_TYPES: PoiType[] = ['toilet', 'water', 'merch', 'medic', 'entrance'];
const ELEMENT_TYPES = ['stage', 'foh', 'barrier', 'tent'];

function clamp(n: unknown): number | null {
  if (typeof n !== 'number' || Number.isNaN(n)) return null;
  return Math.min(100, Math.max(0, n));
}

function sanitize(input: unknown): Blueprint | null {
  const bp = input as Partial<Blueprint> | null;
  if (!bp || typeof bp.stageLabel !== 'string') return null;
  if (!Array.isArray(bp.elements) || !Array.isArray(bp.pois)) return null;

  const elements: BlueprintElement[] = [];
  for (const el of bp.elements) {
    const [x, y, w, h] = [clamp(el?.x), clamp(el?.y), clamp(el?.w), clamp(el?.h)];
    if (x === null || y === null || w === null || h === null) return null;
    if (!ELEMENT_TYPES.includes(el?.type)) return null;
    elements.push({
      type: el.type,
      x, y, w, h,
      ...(typeof el.label === 'string' ? { label: el.label.slice(0, 40) } : {}),
    });
  }

  const pois: Poi[] = [];
  for (const poi of bp.pois) {
    const [x, y] = [clamp(poi?.x), clamp(poi?.y)];
    if (x === null || y === null) return null;
    if (!POI_TYPES.includes(poi?.type)) return null;
    if (typeof poi?.id !== 'string' || typeof poi?.label !== 'string') return null;
    pois.push({ id: poi.id, type: poi.type, x, y, label: poi.label.slice(0, 60) });
  }

  return { stageLabel: bp.stageLabel.slice(0, 30), elements, pois };
}

/** Blueprint einer Bühne komplett speichern: { stageId, blueprint } */
export async function POST(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const stageId = body?.stageId;
  if (typeof stageId !== 'string' || !getTimetable().stages.some((s) => s.id === stageId)) {
    return NextResponse.json({ error: 'Unbekannte Bühne' }, { status: 404 });
  }
  const blueprint = sanitize(body?.blueprint);
  if (!blueprint) {
    return NextResponse.json({ error: 'Ungültiger Blueprint' }, { status: 400 });
  }

  const rev = await mutateDb((db) => {
    db.blueprints[stageId] = blueprint;
    return db.rev + 1;
  });

  return NextResponse.json({ ok: true, rev });
}
