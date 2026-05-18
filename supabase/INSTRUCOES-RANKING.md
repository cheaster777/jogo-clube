# Como ativar o Ranking Público

## Passo único: Execute o SQL no Supabase

1. Acesse: https://supabase.com/dashboard
2. Entre no seu projeto
3. Vá em **SQL Editor** (ícone de banco no menu lateral)
4. Clique em **New Query**
5. Cole o conteúdo completo do arquivo `fix-ranking-publico.sql`
6. Clique em **Run** (ícone ▶️ ou Ctrl+Enter)

Você deve ver: `Success. No rows returned.`

## O que o SQL faz

| Etapa | Ação |
|---|---|
| Remove políticas antigas | Limpa todas as políticas RLS conflitantes |
| `Ranking global público` | Qualquer pessoa (logada ou não) pode VER pontuações |
| `Inserção pelo próprio usuário` | Só o dono pode inserir o próprio score (segurança mantida) |
| `Perfis públicos` | Nomes dos jogadores ficam visíveis no JOIN do ranking |
| Índices | `score DESC`, `user_id`, `played_at DESC` — performance |
| View `ranking_global` | JOIN automático game_scores + profiles, já ordenado |
| View `ranking_melhor_score` | Melhor score único por jogador (opcional) |

## Verificação

Execute no SQL Editor após o script principal:

```sql
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('game_scores', 'profiles')
ORDER BY tablename, cmd;
```

Resultado esperado para `game_scores`:
- `Inserção de score pelo próprio usuário` — INSERT — `(auth.uid() = user_id)`  
- `Ranking global público` — SELECT — `true`

## Se ainda não funcionar

Verifique se RLS está habilitado nas tabelas:
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('game_scores', 'profiles');
```
`rowsecurity` deve ser `true` para ambas.
