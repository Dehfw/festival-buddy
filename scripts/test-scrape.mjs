/**
 * Offline-Tests für die Scraper-Extraktion: prüft alle Parse-Strategien
 * gegen Fixtures der bekannten Datenformate.
 *   node scripts/test-scrape.mjs
 */
import assert from 'node:assert/strict';
import {
  collectEvents,
  discoverUrls,
  eventsFromHtml,
  extractBalanced,
  jsonBlobsFromScript,
  mapToTimetable,
  relTime,
  slugify,
  stageIdFor,
} from './scrape-wacken.mjs';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

/* --- Bausteine ------------------------------------------------------- */

test('stageIdFor erkennt alle Schreibweisen', () => {
  assert.equal(stageIdFor('Faster Stage'), 'faster');
  assert.equal(stageIdFor('W.E.T. Stage'), 'wet');
  assert.equal(stageIdFor('WET Stage'), 'wet');
  assert.equal(stageIdFor('Headbanger'), 'headbanger');
  assert.equal(stageIdFor('W:O:A Beergarden'), 'beergarden');
  assert.equal(stageIdFor('Biergarten'), 'beergarden');
  assert.equal(stageIdFor('Welcome to the Jungle'), null);
});

test('slugify normalisiert Umlaute und Sonderzeichen', () => {
  assert.equal(slugify('Hämatom'), 'haematom');
  assert.equal(slugify('Mr. Hurley & Die Pulveraffen'), 'mr-hurley-die-pulveraffen');
});

test('extractBalanced findet verschachtelte Blöcke mit Strings', () => {
  const s = 'x = {"a": {"b": "hat } klammer"}, "c": [1, 2]}; rest';
  assert.equal(extractBalanced(s, 4), '{"a": {"b": "hat } klammer"}, "c": [1, 2]}');
});

test('relTime: normale Zeit und nach Mitternacht', () => {
  assert.equal(relTime(new Date(2026, 6, 30, 22, 15), '2026-07-30'), '22:15');
  // 01:00 in der Nacht Fr->Sa gehört zum Freitag als 25:00
  assert.equal(relTime(new Date(2026, 7, 1, 1, 0), '2026-07-31'), '25:00');
  assert.equal(relTime(new Date(2026, 6, 30, 22, 15), '2026-07-29'), null);
});

/* --- Format 1: JSON-LD (schema.org MusicEvent) ------------------------ */

test('JSON-LD MusicEvents werden extrahiert', () => {
  const html = `<html><head><script type="application/ld+json">
  {"@context":"https://schema.org","@graph":[
    {"@type":"MusicEvent","name":"Def Leppard","startDate":"2026-07-30T22:15:00+02:00",
     "endDate":"2026-07-31T00:00:00+02:00","location":{"@type":"Place","name":"Harder Stage"}},
    {"@type":"MusicEvent","name":"Judas Priest","startDate":"2026-07-31T21:00:00+02:00",
     "location":"Faster Stage"}
  ]}</script></head><body></body></html>`;
  const events = eventsFromHtml(html);
  assert.equal(events.length, 2);
  assert.equal(events[0].name, 'Def Leppard');
  assert.equal(stageIdFor(events[0].stage), 'harder');
  assert.ok(events[0].end instanceof Date);
});

/* --- Format 2: Clashfinder-JSON (Events unter locations[].name) ------- */

test('Clashfinder-Format: Bühne kommt aus dem Eltern-Objekt', () => {
  const clashfinder = {
    locations: [
      {
        name: 'Faster Stage',
        events: [
          { name: 'Kim Dracula', start: '2026-08-01 12:30', end: '2026-08-01 13:15' },
          { name: 'Powerwolf', start: '2026-08-01 22:30', end: '2026-08-01 23:59' },
        ],
      },
      {
        name: 'Louder',
        events: [{ name: 'Lacuna Coil', start: '2026-08-01 21:00', end: '2026-08-01 22:15' }],
      },
    ],
  };
  const events = [];
  collectEvents(clashfinder, null, events);
  // Die locations selbst haben name+kein start -> nur die 3 Events
  assert.equal(events.length, 3);
  assert.equal(stageIdFor(events[0].stage), 'faster');
  assert.equal(stageIdFor(events[2].stage), 'louder');
});

/* --- Format 3: Inline-JSON-Blob mit anderen Schlüsselnamen ------------ */

test('Inline-Script-Blob mit artist/begin/stage-Keys', () => {
  const html = `<script>
    window.__RUNNING_ORDER__ = {"days":[{"acts":[
      {"artist":"Sepultura","stage":"Harder","begin":"2026-08-01T01:00:00","until":"2026-08-01T02:15:00"},
      {"artist":"Running Wild","stage":"Faster","begin":"2026-07-31T23:45:00"}
    ]}]};
  </script>`;
  const events = eventsFromHtml(html);
  assert.equal(events.length, 2);
  assert.equal(events[0].name, 'Sepultura');
  assert.equal(stageIdFor(events[0].stage), 'harder');
});

test('jsonBlobsFromScript überspringt kaputtes JSON', () => {
  const blobs = jsonBlobsFromScript('var x = {"a": broken}; var y = {"ok": true, "n": 1, "s": "text", "arr": [1,2,3]};');
  assert.equal(blobs.length, 1);
  assert.equal(blobs[0].ok, true);
});

/* --- URL-Discovery ----------------------------------------------------- */

test('discoverUrls findet API-Kandidaten, filtert Assets', () => {
  const html = `
    <script src="/typo3temp/assets/app.js"></script>
    fetch("/api/v1/running-order.json");
    <a href="/de/programm/bands/">Bands</a>
    <img src="/img/logo.png">
    <link href="/styles/main.css">
  `;
  const urls = discoverUrls(html, 'https://www.wacken.com/de/');
  assert.ok(urls.includes('https://www.wacken.com/api/v1/running-order.json'));
  assert.ok(urls.includes('https://www.wacken.com/de/programm/bands/'));
  assert.ok(!urls.some((u) => u.endsWith('.png') || u.endsWith('.css')));
});

/* --- Mapping ------------------------------------------------------------ */

test('mapToTimetable: IDs stabil, Nach-Mitternacht korrekt, Unbekanntes gezählt', () => {
  const timetable = {
    days: [
      { id: 'fri', date: '2026-07-31' },
      { id: 'sat', date: '2026-08-01' },
    ],
  };
  const events = [];
  collectEvents(
    {
      locations: [
        {
          name: 'Harder Stage',
          events: [{ name: 'Sepultura', start: '2026-08-01 01:00', end: '2026-08-01 02:15' }],
        },
        {
          name: 'Faster Stage',
          events: [{ name: 'Judas Priest', start: '2026-07-31 21:00', end: '2026-07-31 22:30' }],
        },
        {
          name: 'Welcome to the Jungle',
          events: [{ name: 'Irgendwer', start: '2026-07-31 12:00' }],
        },
      ],
    },
    null,
    events
  );
  const { slots, unknownStages } = mapToTimetable(timetable, events);
  assert.equal(slots.length, 2);

  const sepultura = slots.find((s) => s.band === 'Sepultura');
  // 01:00 Nacht Fr->Sa == Freitag 25:00
  assert.equal(sepultura.dayId, 'fri');
  assert.equal(sepultura.start, '25:00');
  assert.equal(sepultura.end, '26:15');
  assert.equal(sepultura.id, 'fri-harder-sepultura');

  const priest = slots.find((s) => s.band === 'Judas Priest');
  assert.equal(priest.id, 'fri-faster-judas-priest'); // == Seed-ID, Auswahlen bleiben

  assert.equal(unknownStages.size, 1);
});

console.log(`\n${passed} Tests grün`);
