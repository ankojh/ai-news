import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import { allowedFetch } from '../http/fetcher';
import { RunBudget } from '../budget';
import { ttsCost } from '../cost';
export async function narrate(script: string, date: string, budget: RunBudget) {
  if (!config.ELEVENLABS_API_KEY) return null;
  if (!config.ELEVENLABS_VOICE_ID) throw new Error('ELEVENLABS_VOICE_ID is missing');
  if (script.length > config.MAX_TTS_CHARS)
    throw new Error('Briefing exceeds MAX_TTS_CHARS; text briefing retained');
  if (config.PRICE_TTS_PER_1K_CHARS == null)
    throw new Error('TTS price not configured; audio skipped to enforce cost cap');
  const cost = ttsCost(script.length)!;
  const release = budget.reserveUsd(cost);
  try {
    const response = await allowedFetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.ELEVENLABS_VOICE_ID)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(budget.remainingMs()),
        headers: {
          'xi-api-key': config.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({ text: script, model_id: config.ELEVENLABS_MODEL_ID }),
      },
    );
    if (!response.ok) throw new Error(`ElevenLabs returned ${response.status}`);
    budget.cost += cost;
    budget.ttsChars += script.length;
    const filename = `briefing-${date}.mp3`;
    await mkdir(config.AUDIO_DIR, { recursive: true });
    await writeFile(
      path.join(config.AUDIO_DIR, filename),
      Buffer.from(await response.arrayBuffer()),
    );
    return filename;
  } finally {
    release();
  }
}
