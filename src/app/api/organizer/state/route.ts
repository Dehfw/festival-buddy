import { NextResponse } from 'next/server';
import {
  defaultBlueprint,
  getBlueprints,
  getFestivalOrganizers,
  getGroupStatsForFestival,
  getSelectionCountsForFestival,
  getTimetableFresh,
} from '@/lib/db';
import { canManageFestival } from '@/lib/organizer';

export const dynamic = 'force-dynamic';

/**
 * Datenstand für den Veranstalter-Editor (?festival=…): Timetable (frisch,
 * am Prozess-Cache vorbei), Blueprints (fehlende Bühnen bekommen einen
 * Default), Auswahl-Zähler pro Slot (getrennt nach Zusage/Interesse –
 * füttern Slot-Badges und die Warn-Dialoge beim Löschen), anonyme
 * Gruppen-Zähler (wie viele Gruppen/Leute – Gefühl für die Menge) sowie das
 * Veranstalter-Team des Festivals (meId markiert das eigene Konto).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const festivalId = url.searchParams.get('festival') ?? '';
  if (!festivalId) {
    return NextResponse.json({ error: 'festival fehlt' }, { status: 400 });
  }
  const auth = await canManageFestival(req, festivalId);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Nicht eingeloggt' : 'Kein Zugriff' },
      { status: auth.status }
    );
  }
  const timetable = await getTimetableFresh(festivalId);
  if (!timetable) {
    return NextResponse.json({ error: 'Festival nicht gefunden' }, { status: 404 });
  }
  const [blueprints, selectionCounts, groupStats, organizers] = await Promise.all([
    getBlueprints(festivalId),
    getSelectionCountsForFestival(festivalId),
    getGroupStatsForFestival(festivalId),
    getFestivalOrganizers(festivalId),
  ]);
  for (const stage of timetable.stages) {
    if (!blueprints[stage.id]) blueprints[stage.id] = defaultBlueprint(stage.name);
  }
  return NextResponse.json(
    {
      festivalId,
      timetable,
      blueprints,
      selectionCounts,
      groupStats,
      organizers,
      meId: auth.userId,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
