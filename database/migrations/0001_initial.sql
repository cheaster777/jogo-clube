CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'disabled')),
  email_verified_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lower CHECK (email = lower(email))
);
CREATE UNIQUE INDEX users_email_unique ON users (email);

CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  public_name text NOT NULL CHECK (char_length(public_name) BETWEEN 1 AND 80),
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text,
  ip_address inet,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_active_idx ON sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_verification_tokens_user_idx ON email_verification_tokens (user_id, expires_at)
  WHERE used_at IS NULL;

CREATE TABLE matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  mode text NOT NULL CHECK (mode IN ('online', 'local')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'abandoned')),
  seed text NOT NULL,
  rule_version text NOT NULL DEFAULT '1.0.0',
  current_round integer NOT NULL DEFAULT 1 CHECK (current_round >= 1),
  current_player_index integer NOT NULL DEFAULT 0 CHECK (current_player_index >= 0),
  state_version integer NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX matches_owner_updated_idx ON matches (created_by, updated_at DESC);

CREATE TABLE match_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  seat integer NOT NULL CHECK (seat BETWEEN 0 AND 3),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  is_bot boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'finished')),
  score integer NOT NULL DEFAULT 0 CHECK (score >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, seat),
  UNIQUE (match_id, user_id),
  -- Assentos humanos de salas online nascem vazios e são preenchidos por /join.
  -- Um assento sem identidade só pode permanecer aberto/ativo; bots sempre
  -- possuem is_bot=true e jogadores conectados possuem user_id.
  CONSTRAINT player_identity CHECK (is_bot OR user_id IS NOT NULL OR status = 'active')
);
CREATE INDEX match_players_user_idx ON match_players (user_id, match_id);

CREATE TABLE match_events (
  id bigserial PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  command_id text NOT NULL CHECK (char_length(command_id) BETWEEN 1 AND 128),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  version_before integer NOT NULL CHECK (version_before >= 0),
  version_after integer NOT NULL CHECK (version_after = version_before + 1),
  event_type text NOT NULL CHECK (event_type IN ('GAME_COMMAND', 'COMMAND_APPLIED', 'MATCH_FINISHED')),
  payload jsonb NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, command_id),
  UNIQUE (match_id, version_after)
);

CREATE TABLE match_snapshots (
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 0),
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, version)
);

CREATE TABLE game_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score >= 0),
  quality_category text NOT NULL,
  quality_diagnosis text NOT NULL,
  families_count integer NOT NULL CHECK (families_count >= 0),
  rule_version text NOT NULL DEFAULT '1.0.0',
  played_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_scores_leaderboard_idx ON game_scores (score DESC, played_at ASC, id ASC);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER matches_updated_at BEFORE UPDATE ON matches FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A API é o único componente de aplicação autorizado a acessar estas tabelas.
-- O PostgreSQL permanece na rede interna do Compose e não expõe a porta ao host.
