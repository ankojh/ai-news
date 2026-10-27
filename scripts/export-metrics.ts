import { metrics } from '../lib/db/queries';
const m = metrics();
console.log('| Measurement | Observed value |\n|---|---|');
for (const [label, value] of Object.entries({
  Cards: m.cards,
  'Verified claims': m.verifiedClaims,
  'Quote pass rate':
    m.quotePassRate == null ? 'Not measured' : `${(m.quotePassRate * 100).toFixed(1)}%`,
  'Human spot-check': m.spotChecksJudged
    ? `${(m.spotCheckSupportedRate! * 100).toFixed(1)}% supported (${m.spotChecksJudged} judged)`
    : 'Not measured',
  'Claims flagged wrong': m.flaggedWrong,
  'Median review time': m.medianReviewMs ?? 'Not measured',
}))
  console.log(`| ${label} | ${value} |`);
console.log('\nRun ledger (fixture previews are explicitly labeled):');
console.log(JSON.stringify(m.runs, null, 2));
