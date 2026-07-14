import fs from 'node:fs';
import path from 'node:path';
import type { Blueprint, Db, Timetable } from './types';

/**
 * Einfache JSON-Datei-Datenbank. Für eine geschlossene Gruppe von ~17 Leuten
 * völlig ausreichend: alle Schreibzugriffe laufen seriell durch eine
 * In-Process-Queue, geschrieben wird atomar (tmp-Datei + rename).
 */

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const TIMETABLE_FILE = path.join(DATA_DIR, 'timetable.json');
const BLUEPRINT_SEED_FILE = path.join(DATA_DIR, 'blueprints.seed.json');

let cachedTimetable: Timetable | null = null;

export function getTimetable(): Timetable {
  if (!cachedTimetable) {
    cachedTimetable = JSON.parse(fs.readFileSync(TIMETABLE_FILE, 'utf8')) as Timetable;
  }
  return cachedTimetable;
}

function seedDb(): Db {
  const blueprints = JSON.parse(
    fs.readFileSync(BLUEPRINT_SEED_FILE, 'utf8')
  ) as Record<string, Blueprint>;
  return { users: [], selections: [], positions: [], blueprints, rev: 1 };
}

let cachedDb: Db | null = null;

export function readDb(): Db {
  if (cachedDb) return cachedDb;
  try {
    cachedDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as Db;
    // Neue Bühnen (z. B. nach einem Timetable-Import) bekommen ihren
    // Default-Blueprint aus dem Seed, ohne bestehende Edits anzufassen.
    const seed = JSON.parse(
      fs.readFileSync(BLUEPRINT_SEED_FILE, 'utf8')
    ) as Record<string, Blueprint>;
    for (const [stageId, bp] of Object.entries(seed)) {
      if (!cachedDb.blueprints[stageId]) cachedDb.blueprints[stageId] = bp;
    }
  } catch {
    cachedDb = seedDb();
    persist(cachedDb);
  }
  return cachedDb;
}

function persist(db: Db) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

// Serielle Write-Queue, damit parallele Requests sich nicht überschreiben.
let writeChain: Promise<unknown> = Promise.resolve();

export function mutateDb<T>(fn: (db: Db) => T): Promise<T> {
  const next = writeChain.then(() => {
    const db = readDb();
    const result = fn(db);
    db.rev += 1;
    persist(db);
    return result;
  });
  writeChain = next.catch(() => {});
  return next;
}
