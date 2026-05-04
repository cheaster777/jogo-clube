-- =============================================
-- CORREÇÃO: Ranking global para todos os usuários autenticados
-- Execute este SQL no Supabase Dashboard > SQL Editor
-- =============================================

-- 1. Remover políticas restritivas antigas de game_scores
DROP POLICY IF EXISTS "Usuários podem visualizar suas próprias pontuações" ON public.game_scores;
DROP POLICY IF EXISTS "Qualquer pessoa pode visualizar o ranking" ON public.game_scores;
DROP POLICY IF EXISTS "Ranking público para autenticados" ON public.game_scores;

-- 2. Criar política que permite ver TODOS os scores (ranking global)
CREATE POLICY "Ranking global para autenticados"
ON public.game_scores FOR SELECT
USING (auth.role() = 'authenticated');

-- 3. Remover políticas restritivas antigas de profiles
DROP POLICY IF EXISTS "Usuários podem visualizar seus próprios perfis" ON public.profiles;
DROP POLICY IF EXISTS "Perfis públicos para autenticados" ON public.profiles;

-- 4. Criar política que permite ver TODOS os perfis (para o JOIN do ranking)
CREATE POLICY "Perfis públicos para autenticados"
ON public.profiles FOR SELECT
USING (auth.role() = 'authenticated');

-- Verificar resultado:
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename IN ('game_scores', 'profiles');
