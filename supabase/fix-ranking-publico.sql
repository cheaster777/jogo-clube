-- ============================================================
-- RANKING PÚBLICO — Execute este script no Supabase Dashboard
-- SQL Editor > New Query > Cole tudo e clique em RUN
-- ============================================================

-- ─── 1. REMOVER TODAS AS POLÍTICAS ANTIGAS (game_scores) ────────────────────
DROP POLICY IF EXISTS "Usuários podem visualizar suas próprias pontuações"  ON public.game_scores;
DROP POLICY IF EXISTS "Qualquer pessoa pode visualizar o ranking"            ON public.game_scores;
DROP POLICY IF EXISTS "Ranking público para autenticados"                    ON public.game_scores;
DROP POLICY IF EXISTS "Ranking global para autenticados"                     ON public.game_scores;
DROP POLICY IF EXISTS "Ranking público"                                      ON public.game_scores;

-- ─── 2. REMOVER TODAS AS POLÍTICAS ANTIGAS (profiles) ───────────────────────
DROP POLICY IF EXISTS "Usuários podem visualizar seus próprios perfis"       ON public.profiles;
DROP POLICY IF EXISTS "Perfis públicos para autenticados"                    ON public.profiles;
DROP POLICY IF EXISTS "Perfis visíveis para autenticados"                    ON public.profiles;

-- ─── 3. NOVA POLÍTICA: ranking de pontuações visível para TODOS ─────────────
--   Incluindo visitantes não logados (role = 'anon')
CREATE POLICY "Ranking global público"
ON public.game_scores FOR SELECT
USING (true);   -- sem restrição: anon + authenticated podem ler

-- ─── 4. NOVA POLÍTICA: inserção ainda restrita ao dono do score ─────────────
DROP POLICY IF EXISTS "Usuários podem inserir suas próprias pontuações" ON public.game_scores;
CREATE POLICY "Inserção de score pelo próprio usuário"
ON public.game_scores FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- ─── 5. NOVA POLÍTICA: perfis visíveis para todos (JOIN do ranking) ─────────
CREATE POLICY "Perfis públicos"
ON public.profiles FOR SELECT
USING (true);

-- ─── 6. MANTER POLÍTICA de atualização de perfil pelo próprio usuário ────────
DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios perfis" ON public.profiles;
CREATE POLICY "Usuários atualizam próprio perfil"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

-- ─── 7. ÍNDICES DE PERFORMANCE (execute uma vez, idempotente) ───────────────
CREATE INDEX IF NOT EXISTS idx_game_scores_score_desc ON public.game_scores (score DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_user_id    ON public.game_scores (user_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_played_at  ON public.game_scores (played_at DESC);

-- ─── 8. VIEW DE RANKING GLOBAL (simplifica o JOIN no frontend) ───────────────
CREATE OR REPLACE VIEW public.ranking_global AS
SELECT
  gs.id,
  gs.user_id,
  gs.score,
  gs.quality_category,
  gs.quality_diagnosis,
  gs.families_count,
  gs.played_at,
  COALESCE(p.full_name, 'Anônimo') AS full_name
FROM public.game_scores gs
LEFT JOIN public.profiles p ON p.id = gs.user_id
ORDER BY gs.score DESC;

-- Permitir acesso público à view (anon key do Supabase)
GRANT SELECT ON public.ranking_global TO anon, authenticated;

-- ─── 9. VIEW DE MELHOR SCORE POR JOGADOR (ranking pessoal) ──────────────────
CREATE OR REPLACE VIEW public.ranking_melhor_score AS
SELECT DISTINCT ON (gs.user_id)
  gs.id,
  gs.user_id,
  gs.score,
  gs.quality_category,
  gs.quality_diagnosis,
  gs.families_count,
  gs.played_at,
  COALESCE(p.full_name, 'Anônimo') AS full_name
FROM public.game_scores gs
LEFT JOIN public.profiles p ON p.id = gs.user_id
ORDER BY gs.user_id, gs.score DESC;

GRANT SELECT ON public.ranking_melhor_score TO anon, authenticated;

-- ─── VERIFICAÇÃO: rode após executar para confirmar ─────────────────────────
-- SELECT policyname, cmd, qual FROM pg_policies
-- WHERE tablename IN ('game_scores', 'profiles')
-- ORDER BY tablename, cmd;
