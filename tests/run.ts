/**
 * Integration test runner. Needs a real Postgres reachable via DATABASE_URL
 * (or POSTGRES_URL) — these tests exercise actual concurrent transactions,
 * not mocks. Example: `DATABASE_URL=postgres://postgres:postgres@localhost:5432/festival_test npm test`
 */
import * as sessions from './sessions.test';
import * as leaveGroupRace from './leave-group-race.test';

async function main() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    console.error('DATABASE_URL (or POSTGRES_URL) must point to a test Postgres database.');
    process.exit(1);
  }
  const suites: [string, () => Promise<void>][] = [
    ['sessions', sessions.run],
    ['leave-group-race', leaveGroupRace.run],
  ];
  let failed = false;
  for (const [name, fn] of suites) {
    try {
      await fn();
      console.log(`✓ ${name}`);
    } catch (err) {
      failed = true;
      console.error(`✗ ${name}`, err);
    }
  }
  process.exit(failed ? 1 : 0);
}

main();
