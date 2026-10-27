import { all, db, execute } from '../lib/db/client';

// Removes the `npm run demo` sample edition. Real agent runs, papers and settings are untouched.
function main() {
  const runs = all("SELECT id FROM runs WHERE trigger='fixture-preview'").map((r) => r.id);
  if (!runs.length) {
    console.log('No preview data found. Nothing changed.');
    return;
  }
  db().transaction(() => {
    for (const run of runs) {
      const cards = all('SELECT id FROM cards WHERE run_id=?', run).map((c) => c.id);
      for (const card of cards) {
        execute(
          'DELETE FROM spot_checks WHERE claim_id IN (SELECT id FROM claims WHERE card_id=?)',
          card,
        );
        execute(
          "DELETE FROM feedback WHERE (target_type IN ('card','explanation') AND target_id=?) OR (target_type='claim' AND target_id IN (SELECT id FROM claims WHERE card_id=?))",
          card,
          card,
        );
        execute('DELETE FROM claims WHERE card_id=?', card);
        execute('DELETE FROM explanations WHERE card_id=?', card);
      }
      execute('DELETE FROM agent_steps WHERE run_id=?', run);
      execute('DELETE FROM cards WHERE run_id=?', run);
      execute('DELETE FROM selections WHERE run_id=?', run);
      execute('DELETE FROM signals WHERE run_id=?', run);
      execute('DELETE FROM briefings WHERE run_id=?', run);
      execute('DELETE FROM runs WHERE id=?', run);
    }
  })();
  console.log(`Removed ${runs.length} preview edition(s). Real runs were not touched.`);
}
main();
