# PRD — Migração para VPS e Correção do Jogo

**Status:** Implementação base concluída; staging, cutover e restore externo ainda exigem execução operacional  
**Data:** 2026-08-20  
**Objetivo:** transformar o SPA atual em um produto web profissional, seguro, testável e preparado para partidas online.

## 1. Decisão arquitetural

Adotar uma arquitetura própria, com migração gradual:

```text
Nginx/Caddy + HTTPS
        ├── Frontend React/Vite estático
        └── API Node.js/TypeScript
                    └── PostgreSQL privado
```

O Supabase não será auto-hospedado como solução definitiva. Auto-hospedá-lo reduziria alterações imediatas, mas manteria uma plataforma operacionalmente pesada e não corrigiria o fato de que o navegador controla cartas, turnos e pontuação.

A VPS terá Docker Compose, firewall, backups externos criptografados, monitoramento e rollback. Redis não faz parte da primeira versão; será adicionado somente se houver múltiplas réplicas da API ou necessidade real de pub/sub.

## 2. Baseline antes da migração

O inventário abaixo registra o estado de origem que motivou este PRD; os itens foram tratados nas fases de implementação ou permanecem como validação operacional indicada ao final.

- `src/App.tsx` concentra UI, estado, regras, bots, ranking e persistência.
- A partida é local; não há salas, usuários participantes, eventos ou sincronização.
- O cliente envia `score`, diagnóstico e quantidade de famílias diretamente para `game_scores`.
- RLS valida apenas o `user_id`; scores podem ser forjados.
- Existem scripts SQL corretivos conflitantes, sem `supabase/migrations/` versionado.
- Apenas o primeiro jogador humano é salvo.
- Há inconsistências entre efeitos de cartas e textos das regras.
- Não há testes da aplicação, pipeline de deploy, backup, HTTPS, headers de segurança ou observabilidade.
- `npm audit` registrou vulnerabilidades críticas e altas; as dependências precisam ser atualizadas antes da publicação.

## 3. Escopo funcional alvo

### Jogo

1. Partidas locais contra bots continuam funcionando.
2. Usuários autenticados podem criar ou entrar em uma sala.
3. O servidor é autoridade para baralho, seed, turno, rodada, efeitos e score.
4. Comandos são idempotentes e rejeitam versões concorrentes antigas.
5. Dois clientes veem a mesma partida e se recuperam após reconexão.
6. O ranking público exibe apenas nome público, pontuação, categoria e data; nunca email.

### Conta

- Cadastro, login, logout, confirmação de email e recuperação de senha.
- Sessões em cookies `HttpOnly`, `Secure` e `SameSite`.
- Senhas armazenadas com Argon2id ou mecanismo equivalente.
- Rate limit para login, cadastro, recuperação e comandos de partida.

## 4. Modelo de dados da nova API

Criar migrações versionadas para:

- `users`: identidade, email normalizado, hash, status e timestamps.
- `profiles`: nome público e preferências; sem exposição pública de email.
- `sessions`: sessão revogável, expiração e hash do token.
- `matches`: modo, status, seed, `rule_version`, rodada, jogador atual e `state_version`.
- `match_players`: partida, usuário ou bot, assento, nome, score e status.
- `match_events`: `command_id UNIQUE`, ator, versão anterior/nova, tipo e payload.
- `match_snapshots`: estado materializado para reconexão e recuperação.
- `game_scores`: resultado final com `match_id UNIQUE`, usuário, score validado e diagnóstico.

O servidor deve persistir eventos ou snapshots de forma transacional. Cada comando recebido deve informar `command_id` e `expected_version`; comandos duplicados retornam o resultado anterior e comandos obsoletos são rejeitados.

## 5. API mínima

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/email-verification/resend`
- `POST /api/v1/auth/email-verification/confirm`
- `POST /api/v1/auth/password-reset`
- `POST /api/v1/auth/password-reset/confirm`
- `GET /api/v1/me`
- `POST /api/v1/matches`
- `POST /api/v1/matches/:id/join`
- `GET /api/v1/matches/:id`
- `POST /api/v1/matches/:id/commands`
- `GET /api/v1/matches/:id/events?afterVersion=N`
- `GET /api/v1/leaderboard`
- `GET /health/live` e `GET /health/ready`

O transporte inicial pode usar HTTP para comandos e WebSocket para eventos. O cliente nunca enviará o resultado final como fonte de verdade.

## 6. Plano de execução por fases

### Fase 0 — Baseline e inventário

- Exportar schema, dados, usuários, views, triggers, políticas e extensões do Supabase real.
- Registrar contagens, scores, órfãos, redirects, SMTP e configuração de autenticação.
- Fazer backup verificável e definir política de retenção.
- Fixar versões, remover dependências não usadas e separar dependências de build/mobile.

**Saída:** inventário assinado, backup restaurável e contrato de dados aprovado.

### Fase 1 — Isolar e corrigir o motor do jogo

- Extrair regras de `App.tsx` para um módulo puro e determinístico.
- Substituir efeitos baseados no título textual por tipos discriminados.
- Corrigir Drift, Peixe exótico, fim antecipado, desempates e reinício de score.
- Criar testes unitários para deck, seed, turnos, efeitos, bots, score e game over.
- Manter a UI atual funcionando contra um adaptador local.

**Critério:** o mesmo seed e os mesmos comandos produzem o mesmo estado em qualquer ambiente.

### Fase 2 — Backend autoritativo

- Criar API Node.js/TypeScript com validação de entrada, autorização e logs estruturados.
- Implementar autenticação própria e migração de identidade por confirmação/reset de senha quando os hashes Supabase não puderem ser preservados.
- Criar migrações PostgreSQL e constraints para partidas, eventos e scores.
- Implementar comandos de jogo, idempotência, optimistic concurrency e reconexão.
- Implementar ranking por consulta server-side segura.

**Critério:** alterar payload no navegador não altera o resultado aceito pelo servidor.

### Fase 3 — Migração do frontend

- Substituir `src/lib/supabase.ts` por um `apiClient`.
- Reescrever `AuthContext` para sessões HTTP.
- Separar `App.tsx` em páginas, componentes, hooks e estado da partida.
- Renderizar snapshots/eventos recebidos do servidor.
- Preservar a identidade visual inicialmente; corrigir hover-only, labels, foco, manifesto e estados de erro.
- Manter o build Capacitor apontando para a mesma API HTTPS.

### Fase 4 — VPS e staging

- Criar Compose com proxy HTTPS, frontend, API e PostgreSQL não exposto publicamente.
- Liberar somente portas 80/443 e SSH restrito.
- Configurar CSP, HSTS, `X-Content-Type-Options`, proteção de frame e CORS por allowlist.
- Configurar health checks, restart policy, logs, métricas básicas e alertas.
- Executar backup diário criptografado para armazenamento externo e teste periódico de restore.
- Validar staging com dados anonimizados.

### Fase 5 — Migração e cutover

- Migrar `users`, `profiles` e `game_scores`, preservando UUIDs e datas quando possível; exigir reset para hashes Supabase incompatíveis.
- Comparar contagens, ranking Top 50, usuários e ausência de órfãos.
- Fazer janela curta de congelamento, dump final e importação.
- Trocar DNS e manter o Supabase antigo disponível para rollback.
- Monitorar autenticação, partidas, scores e erros por pelo menos um ciclo completo.
- Remover keep-alive e credenciais hardcoded somente após a estabilização.

## 7. Qualidade e segurança obrigatórias

- Testes unitários do motor de regras.
- Testes de API para autorização, score adulterado, replay de comando e concorrência.
- Testes E2E de cadastro, login, partida, reconexão, finalização e ranking.
- Teste de restauração do PostgreSQL.
- `npm ci`, lint, build, auditoria de dependências e análise de secrets no CI.
- Nenhuma chave administrativa no frontend ou no Git.
- Ranking sem email e com política de nome público/LGPD.
- Logs sem senha, token, cookie ou payload sensível.

## 8. Critérios de aceite

O projeto estará pronto para produção quando:

1. O frontend não fizer chamadas ao Supabase.
2. Uma partida puder ser jogada por dois clientes com estado consistente.
3. Apenas comandos válidos do servidor produzirem score.
4. Comandos duplicados não duplicarem ações nem scores.
5. Login, recuperação, reconexão e logout funcionarem em HTTPS.
6. O ranking não expuser email e tiver paginação estável.
7. Build, lint, testes e migrações passarem no CI.
8. Backup for restaurado com sucesso em ambiente limpo.
9. A VPS tiver monitoramento, firewall, TLS e rollback documentados.
10. O app Android continuar consumindo a API de produção.

## 9. Ordem de trabalho dos agentes

1. **Arquiteto:** contratos, módulos, decisões e riscos.
2. **Engenheiro de jogo:** motor determinístico e testes de regras.
3. **Backend/database:** API, migrações, autenticação e autoridade do jogo.
4. **Frontend:** adaptador HTTP, telas, reconexão e acessibilidade.
5. **DevOps/security:** Compose, proxy, TLS, backups, CI e hardening.
6. **QA:** testes E2E, concorrência, restore e checklist de aceite.

Cada agente deve trabalhar em escopo de arquivos separado, reportar evidências e não iniciar a fase seguinte sem os critérios da fase anterior aprovados.

## 10. Fora do escopo inicial

- Kubernetes ou arquitetura multi-região.
- Chat, partidas ranqueadas avançadas, pagamentos e notificações push.
- Redis antes de existir necessidade de múltiplas réplicas.
- Redesign visual completo antes da estabilidade do motor e do backend.

**Decisão final:** construir uma API própria autoritativa sobre PostgreSQL privado, hospedar o frontend como estático na VPS e executar a migração em fases com rollback. Essa escolha resolve o problema de integridade, prepara o multiplayer e mantém a operação proporcional ao tamanho do projeto.

## 11. Estado da implementação

Implementado no repositório: motor determinístico compartilhado, API autoritativa com sessões por cookie, confirmação de email, recuperação de senha, salas online, assentos/join, eventos, snapshots, idempotência, concorrência otimista, ranking paginado, migrações PostgreSQL, importadores validados de identidades/perfis/scores, Compose/Caddy, CI, backups criptografados e testes unitários, HTTP, PostgreSQL e Playwright.

Pendente de execução operacional: provisionar a VPS, SMTP, DNS/TLS, firewall, backup externo, restore em ambiente limpo e cutover real. O daemon Docker local não estava disponível durante a implementação; o CI contém serviço PostgreSQL, migração, smoke de schema, auditoria de runtime e builds das imagens para essa validação.
