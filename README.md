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

## PWA

O build gera o service worker com `vite-plugin-pwa`; em `npm run dev` ele fica desligado. Para testar a instalação, use `npm run build && npm run preview`.

- No celular, `src/components/InstallPrompt.tsx` oferece a instalação ao abrir o site. No Android, abre o prompt do navegador. No iOS, mostra as instruções da Tela de Início, porque o Safari não tem prompt.
- O banner não aparece durante a partida, no computador, no app já instalado nem no app Capacitor. Depois de uma recusa, volta em 14 dias.
- A nova versão espera o jogador tocar em "Atualizar", para não recarregar a página no meio de uma partida.
- `/api` e `/health` nunca passam pelo cache do service worker. Imagens das cartas entram em cache no primeiro uso.

## Arquitetura e operação

- `src/game/`: motor determinístico compartilhado pelo adaptador local e pela API.
- `src/hooks/`: ciclo de vida, polling e comandos das partidas online.
- `server/`: autenticação, partidas, autorização, ranking e health checks.
- `database/migrations/`: schema PostgreSQL versionado; nunca edite migrações já aplicadas.
- `scripts/`: migração de identidades/export, backup criptografado, restore isolado e verificação.
- `Dockerfile`, `docker-compose.yml` e `Caddyfile`: imagens, proxy HTTPS e rede privada.

O plano completo, incluindo cutover, rollback e critérios de aceite, está em [`PRD_MIGRATIONS.md`](PRD_MIGRATIONS.md). Procedimentos operacionais ficam em [`docs/`](docs/).
