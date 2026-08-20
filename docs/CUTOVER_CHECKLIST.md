# Checklist de cutover e rollback

Este procedimento migra identidades, `profiles` e `game_scores` exportados para arquivos locais. O processo não migra partidas ou sessões existentes; sessões são recriadas por login. O script não acessa o Supabase diretamente.

## Antes da janela

- [ ] Aprovar a janela, responsáveis, RPO/RTO e o plano de comunicação.
- [ ] Gerar exportações de `users`, `profiles` e `game_scores` em JSON ou CSV; guardar os arquivos somente em armazenamento controlado.
- [ ] Executar o dry-run de identidades e revisar quantos usuários precisarão redefinir a senha:

  ```bash
  node scripts/import-supabase-users.mjs \
    --input ./exports/final/users.json --mode dry-run \
    --report ./artifacts/users-dry-run.json
  ```

- [ ] Confirmar que os UUIDs de `users` cobrem todos os perfis e scores exportados.
- [ ] Calcular e registrar SHA-256 dos arquivos; não registrar conteúdo, emails, tokens ou URLs com credenciais.
- [ ] Executar o dry-run sem conexão:

  ```bash
  node scripts/import-supabase-export.mjs \
    --input-dir ./exports/final --mode dry-run \
    --report ./artifacts/supabase-dry-run.json
  ```

- [ ] Se o export legado não tiver `match_id`, revisar e aprovar explicitamente `--legacy-score-mode synthetic-match`; isso cria uma partida local mínima por score.
- [ ] Fazer backup verificável do PostgreSQL novo e confirmar que o restore foi testado recentemente.

## Execução e aceite

- [ ] Congelar novas gravações no sistema antigo e registrar o horário UTC.
- [ ] Gerar o export final, recalcular hashes e repetir o dry-run.
- [ ] Aplicar usando `DATABASE_URL` no ambiente, nunca como argumento:

  ```bash
  export DATABASE_URL='postgres://...'
  ```

  ```bash
  node scripts/import-supabase-users.mjs \
    --input ./exports/final/users.json --mode apply \
    --report ./artifacts/users-apply.json
  ```

  Usuários sem hash scrypt compatível devem receber o fluxo de recuperação de senha por email antes de jogar.

  Depois, importe perfis e scores:

  ```bash
  node scripts/import-supabase-export.mjs \
    --input-dir ./exports/final --mode apply \
    --report ./artifacts/supabase-apply.json
  ```

- [ ] Confirmar no relatório: contagens de perfis/scores, zero órfãos e Top 50 idêntico (score, categoria, data e nome público).
- [ ] Reexecutar em modo `verify` e guardar o relatório como evidência.
- [ ] Validar login, ranking, criação/finalização de partida e `/health/ready` em staging/produção.
- [ ] Alterar DNS somente após os checks de aplicação e monitoramento estarem verdes.
- [ ] Monitorar autenticação, erros HTTP, scores e banco durante pelo menos um ciclo completo.

## Rollback

- [ ] Critérios: falha de login, ranking divergente, scores não persistidos, erros sustentados ou indisponibilidade além do RTO.
- [ ] Parar gravações no frontend/API novo e preservar logs, relatórios e hashes.
- [ ] Reverter DNS/proxy para o sistema antigo, mantendo o PostgreSQL novo intacto para investigação.
- [ ] Não executar `down -v`, `DROP DATABASE` ou restore destrutivo durante a pressão do incidente.
- [ ] Se houve escrita no sistema novo, reconciliar o delta antes de reabrir o sistema antigo; a migração não faz sincronização reversa automática.
- [ ] Após a causa raiz e aprovação, repetir cutover com novo export/backup e atualizar este registro.
