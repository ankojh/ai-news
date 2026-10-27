-- WAL mode is enabled by the database client before migrations.

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- seed: topics='["LLM reasoning","AI agents"]', review_mode, briefing_audience, max_papers_per_run

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, trigger TEXT NOT NULL,          -- 'cli' | 'button' | 'cron'
  started_at TEXT NOT NULL, finished_at TEXT, edition_date TEXT,
  status TEXT NOT NULL,                                -- running | success | partial | failed
  phase_log TEXT NOT NULL DEFAULT '[]',
  budget_json TEXT NOT NULL,
  candidates_count INTEGER, selected_count INTEGER, cards_created INTEGER,
  tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0, tts_chars INTEGER DEFAULT 0,
  cost_usd REAL, error TEXT
);

CREATE TABLE IF NOT EXISTS papers (
  arxiv_id TEXT PRIMARY KEY, version TEXT, title TEXT NOT NULL,
  authors_json TEXT NOT NULL, abstract TEXT NOT NULL,
  published_at TEXT, updated_at TEXT, categories_json TEXT,
  arxiv_comment TEXT, journal_ref TEXT, doi TEXT,
  pub_status TEXT NOT NULL,                            -- preprint | accepted_author_stated | published
  html_available INTEGER,                              -- null = unknown
  first_seen_at TEXT NOT NULL, last_fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, arxiv_id TEXT NOT NULL REFERENCES papers(arxiv_id),
  run_id TEXT REFERENCES runs(id), source TEXT NOT NULL,   -- hf | hn
  external_id TEXT, url TEXT NOT NULL, score INTEGER, num_comments INTEGER,
  observed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS selections (
  run_id TEXT NOT NULL REFERENCES runs(id), arxiv_id TEXT NOT NULL,
  selected INTEGER NOT NULL, priority INTEGER, reason TEXT,
  expected_boldness TEXT, buzz_score REAL,
  PRIMARY KEY (run_id, arxiv_id)
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY, arxiv_id TEXT NOT NULL REFERENCES papers(arxiv_id),
  paper_version TEXT, run_id TEXT NOT NULL REFERENCES runs(id),
  category TEXT NOT NULL DEFAULT 'technology',
  status TEXT NOT NULL,                                -- draft | approved | hidden | failed
  low_evidence INTEGER NOT NULL DEFAULT 0,
  tldr TEXT, hypothesis TEXT, method TEXT, findings TEXT, limitations TEXT,
  possible_applications TEXT, whats_new TEXT, watch_next TEXT,
  topics_json TEXT, discussion_json TEXT, could_not_verify_json TEXT,
  selection_reason TEXT, model TEXT, failure_reason TEXT,
  created_at TEXT NOT NULL, reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id),
  text TEXT NOT NULL, claim_type TEXT NOT NULL, is_bold INTEGER NOT NULL,
  metric TEXT, value TEXT, benchmark TEXT, baseline TEXT,
  quote TEXT NOT NULL, quote_source TEXT NOT NULL, quote_location TEXT,
  verified INTEGER NOT NULL,                           -- only verified=1 rows are ever shown
  provenance TEXT NOT NULL DEFAULT 'author_reported',
  confirmation TEXT NOT NULL DEFAULT 'not_independently_confirmed',
  flagged_wrong_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS explanations (
  card_id TEXT NOT NULL REFERENCES cards(id), audience TEXT NOT NULL,  -- student | educator | professional
  body TEXT NOT NULL, glossary_json TEXT, discussion_questions_json TEXT, activity TEXT,
  model TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY (card_id, audience)
);

CREATE TABLE IF NOT EXISTS agent_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, card_id TEXT,
  agent TEXT NOT NULL,                                 -- editor | research | explain | briefing | ask | system
  step_no INTEGER NOT NULL, kind TEXT NOT NULL,        -- model_call | tool_call | post_verify_drop | budget_warning | error
  tool_name TEXT, input_json TEXT, output_summary TEXT, ok INTEGER,
  duration_ms INTEGER, tokens_in INTEGER, tokens_out INTEGER, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS briefings (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, date TEXT NOT NULL UNIQUE,
  audience TEXT NOT NULL, title TEXT, script TEXT NOT NULL, markdown TEXT NOT NULL,
  card_ids_json TEXT NOT NULL, audio_path TEXT, tts_chars INTEGER, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL,                           -- card | claim | briefing | explanation | answer
  target_id TEXT NOT NULL, value TEXT NOT NULL,        -- up | down | wrong
  note TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS spot_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id TEXT NOT NULL,
  claim_id TEXT NOT NULL REFERENCES claims(id),
  verdict TEXT,                                        -- supported | not_supported | unclear | null (pending)
  note TEXT, created_at TEXT NOT NULL, decided_at TEXT
);

-- P2
CREATE TABLE IF NOT EXISTS qa (
  id TEXT PRIMARY KEY, scope TEXT NOT NULL, arxiv_id TEXT, question TEXT NOT NULL,
  answer TEXT, citations_json TEXT, could_not_find_json TEXT, partially_supported INTEGER,
  created_at TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(card_id UNINDEXED, title, tldr, findings, claims_text);

CREATE INDEX IF NOT EXISTS idx_signals_arxiv ON signals(arxiv_id);
CREATE INDEX IF NOT EXISTS idx_cards_run ON cards(run_id);
CREATE INDEX IF NOT EXISTS idx_claims_card ON claims(card_id);
CREATE INDEX IF NOT EXISTS idx_steps_card ON agent_steps(card_id);

CREATE TABLE IF NOT EXISTS review_events (card_id TEXT, duration_ms INTEGER, created_at TEXT);
CREATE TABLE IF NOT EXISTS run_lock (id INTEGER PRIMARY KEY CHECK (id = 1), run_id TEXT NOT NULL);
