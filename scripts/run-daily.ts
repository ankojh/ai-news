import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createRun, executeRun } from '../lib/run';
import { runDetail } from '../lib/db/queries';
const { values } = parseArgs({
  options: {
    limit: { type: 'string' },
    date: { type: 'string' },
    'no-audio': { type: 'boolean' },
    'dry-run': { type: 'boolean' },
  },
});
async function main() {
  const options = {
    limit: values.limit ? z.coerce.number().int().min(1).max(30).parse(values.limit) : undefined,
    date: values.date ? z.iso.date().parse(values.date) : undefined,
    noAudio: values['no-audio'],
    dryRun: values['dry-run'],
    trigger: 'cli',
  };
  const id = createRun(options);
  console.log(`Run ${id} started`);
  await executeRun(id, options);
  const result = runDetail(id);
  console.log(JSON.stringify(result, null, 2));
  if (result?.status === 'failed') process.exitCode = 1;
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
