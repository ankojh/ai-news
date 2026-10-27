# API setup

The local `.env` is filled with model names, storage paths, limits, review settings, and a generated admin token. Account-specific secrets remain blank.

## OpenAI Codex — use your subscription

The agents use the installed Codex CLI, not the separately billed OpenAI Platform API. Run `codex login` and choose ChatGPT sign-in if needed; `codex login status` confirms the method. No `OPENAI_API_KEY` is needed or read by the app. The child process explicitly forces ChatGPT authentication and excludes API-key environment variables.

Defaults: `gpt-6-sol` for Editor/Research, `gpt-6-luna` for Explain/Briefing, low reasoning effort. Change the `CODEX_MODEL_*` fields if your workspace offers different models. Subscription limits still apply. Keep this application local; it is not an anonymous public Codex proxy.

[Official authentication guidance](https://learn.chatgpt.com/docs/auth) · [Non-interactive Codex](https://developers.openai.com/codex/noninteractive)

## Hugging Face Daily Papers — no key required

The app reads `https://huggingface.co/api/daily_papers` directly. This public read endpoint was verified without authentication. You do not need a model-inference subscription or inference API key to read papers.

If you want authenticated HF requests, create/sign into a Hugging Face account, open [Access Tokens](https://huggingface.co/settings/tokens), create a read-only token, and place it in `HF_TOKEN` in `.env`. The app sends it only to `huggingface.co`.

[HF paper API documentation](https://huggingface.co/docs/huggingface_hub/en/package_reference/hf_api#huggingface_hub.HfApi.list_daily_papers) · [Token documentation](https://huggingface.co/docs/hub/security-tokens)

## Hacker News through Algolia — no key required

“Algolia” is the search provider. The app uses the public HN Search service, not a private Algolia application/index. You do not need an Algolia account, application ID, or search key.

- Stories: `https://hn.algolia.com/api/v1/search?query=arxiv.org&tags=story`
- Discussion: `https://hn.algolia.com/api/v1/items/{storyId}`

[Public HN Search API](https://hn.algolia.com/api)

## arXiv — no key required

Metadata comes from `https://export.arxiv.org/api/query`; available paper HTML comes from `https://arxiv.org/html/{paperId}`. No account/key is required for these reads. Set `CONTACT_EMAIL` to your real contact email if desired; it is used in the User-Agent. The app already rate-limits arXiv requests.

[arXiv API manual](https://info.arxiv.org/help/api/user-manual.html)

## ElevenLabs narration — optional

1. Create/sign into an ElevenLabs account.
2. Create an API key in [Developers → API Keys](https://elevenlabs.io/app/developers/api-keys), allowing text-to-speech.
3. Put the key into `ELEVENLABS_API_KEY`.
4. The voice defaults to George (`JBFqnCBsd6RMkjVDRZzb`), the official quickstart example. Change `ELEVENLABS_VOICE_ID` if you prefer another available voice.
5. Fill `PRICE_TTS_PER_1K_CHARS` with your account's applicable USD cost per 1,000 characters. Pricing is plan-specific, so the app does not invent it.

The model defaults to `eleven_multilingual_v2`. A blank key skips audio. A configured key with missing price skips paid narration and retains the text briefing.

[ElevenLabs setup guide](https://elevenlabs.io/docs/eleven-api/quickstart)

After changing `.env`, restart the local server. The daily CLI reads `.env` on every invocation.
