CREATE TABLE IF NOT EXISTS sell_side_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  holding_id uuid NOT NULL REFERENCES holdings(id),
  chat_id uuid NOT NULL UNIQUE REFERENCES chats(id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title text NOT NULL, ticker text NOT NULL,
  status text NOT NULL DEFAULT 'recording', expected_parts integer,
  error text, lease uuid, updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sell_side_calls_team ON sell_side_calls(team_id, created_at);
CREATE TABLE IF NOT EXISTS sell_side_parts (
  call_id uuid NOT NULL REFERENCES sell_side_calls(id) ON DELETE CASCADE,
  seq integer NOT NULL CHECK (seq >= 0 AND seq < 120), path text NOT NULL, mime_type text NOT NULL,
  "offset" numeric NOT NULL, duration numeric NOT NULL,
  segments jsonb, text text, summary text, PRIMARY KEY (call_id, seq)
);
CREATE INDEX IF NOT EXISTS sell_side_parts_search ON sell_side_parts USING gin(to_tsvector('english', coalesce(text, '')));
ALTER TABLE sell_side_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE sell_side_parts ENABLE ROW LEVEL SECURITY;
-- Access is through authenticated, team-checked server routes; no public policies.
