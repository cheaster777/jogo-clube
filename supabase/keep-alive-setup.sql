-- ============================================================
-- SCRIPT: EVITAR PAUSA AUTOMÁTICA DO SUPABASE
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- 1. Cria uma tabela simples com um ID automático e uma coluna de status
CREATE TABLE IF NOT EXISTS public.projeto_ativo (
    id SERIAL PRIMARY KEY,
    ativo VARCHAR(3) NOT NULL DEFAULT 'sim'
);

-- 2. Permite leitura e atualização anônima para que possamos atualizar via API (GitHub Actions/Cron)
ALTER TABLE public.projeto_ativo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir update publico ping" ON public.projeto_ativo;
CREATE POLICY "Permitir update publico ping" 
ON public.projeto_ativo FOR UPDATE 
USING (true);

DROP POLICY IF EXISTS "Permitir select publico ping" ON public.projeto_ativo;
CREATE POLICY "Permitir select publico ping" 
ON public.projeto_ativo FOR SELECT 
USING (true);

-- 3. Insere o ponto de partida (caso a tabela esteja vazia)
INSERT INTO public.projeto_ativo (ativo)
SELECT 'sim'
WHERE NOT EXISTS (SELECT 1 FROM public.projeto_ativo);
