-- ============================================================
-- CORREÇÃO PARA NOVOS JOGADORES - Execute no Supabase Dashboard
-- SQL Editor > New Query > Cole tudo e clique em RUN
-- ============================================================

-- 1. Adicionar política de INSERT na tabela profiles
-- Isso permite que o frontend crie o perfil do usuário caso a trigger falhe ou atrase
DROP POLICY IF EXISTS "Usuários inserem próprio perfil" ON public.profiles;

CREATE POLICY "Usuários inserem próprio perfil"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- 2. Garantir que a trigger de novo usuário está correta
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    new.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recriar a trigger para garantir
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Mensagem de sucesso
-- Se rodou sem erros, a correção foi aplicada!
