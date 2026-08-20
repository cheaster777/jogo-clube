# Clube de Ciências

Jogo educacional de cartas sobre macroinvertebrados e qualidade da água. A aplicação usa React 19 + Vite no frontend, uma API Node.js/TypeScript autoritativa e PostgreSQL privado. O frontend não acessa Supabase; a pasta `supabase/` é mantida somente como referência para o export de migração.

## Desenvolvimento rápido

Requer Node.js 22 ou superior.

```bash
npm ci
npm run dev                 # frontend local, modo de jogo contra bots
npm run lint                # typecheck do frontend
npm run server:build        # typecheck da API
npm test                    # motor + contratos HTTP; PostgreSQL é opcional
npm run test:e2e            # smoke Playwright do fluxo visual
```

O modo local não exige banco. Para executar a arquitetura completa, configure as variáveis descritas em [`docs/OPERATIONS.md`](docs/OPERATIONS.md), tenha Docker Engine ativo e rode:

```bash
docker compose --env-file .env.production --profile backend up -d --build
```

O banco não publica a porta 5432. A API aplica as migrações automaticamente no container, mas também é possível executá-las explicitamente com `DATABASE_URL` definido:

```bash
npm run db:migrate
```

## Arquitetura e operação

- `src/game/`: motor determinístico compartilhado pelo adaptador local e pela API.
- `src/hooks/`: ciclo de vida, polling e comandos das partidas online.
- `server/`: autenticação, partidas, autorização, ranking e health checks.
- `database/migrations/`: schema PostgreSQL versionado; nunca edite migrações já aplicadas.
- `scripts/`: migração de identidades/export, backup criptografado, restore isolado e verificação.
- `Dockerfile`, `docker-compose.yml` e `Caddyfile`: imagens, proxy HTTPS e rede privada.

O plano completo, incluindo cutover, rollback e critérios de aceite, está em [`PRD_MIGRATIONS.md`](PRD_MIGRATIONS.md). Procedimentos operacionais ficam em [`docs/`](docs/).
