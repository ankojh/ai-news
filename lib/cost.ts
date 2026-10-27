import { config } from './config';
export function ttsCost(characters: number) {
  return config.PRICE_TTS_PER_1K_CHARS == null
    ? null
    : (characters / 1000) * config.PRICE_TTS_PER_1K_CHARS;
}
