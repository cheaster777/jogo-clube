# AGENTS.md

## Visão Geral do Projeto

Jogo educacional de cartas em React 19 + Vite 6 sobre bioindicadores (macroinvertebrados) e impacto ambiental. A aplicação web e a API Express/Node são empacotadas para deployment em VPS via Docker Compose.

## Comandos

```bash
npm install          # Instalar dependências
npm run dev         # Rodar servidor de desenvolvimento (porta 3000)
npm run build       # Build para produção
npm run lint         # Typechecking do frontend
npm run server:build # Typechecking da API
npm test             # Testes unitários/contrato e importadores
npm run test:e2e     # Smoke test Playwright
```

## Ambiente Necessário

Copiar `.env.example` para o ambiente adequado. A API usa PostgreSQL próprio e autenticação por sessão/cookie:
- `DATABASE_URL` - conexão do PostgreSQL
- `CORS_ORIGIN` - origens permitidas, separadas por vírgula
- `APP_BASE_URL` - URL pública usada nos links de email
- `EMAIL_MODE=smtp` e `SMTP_*` - envio real de confirmação/reset em produção; a VPS atual usa Resend via `smtp.resend.com`
- `VITE_API_BASE_URL` - base da API no bundle do frontend; em produção, normalmente `/api/v1`

## Arquitetura

- **Autenticação**: API Express/PostgreSQL via `server/auth` e `src/lib/api.ts`
- **API**: `server/app.ts`, `server/routes.ts` e `server/repositories/`
- **Banco e migrações**: `database/migrations/` e `scripts/migrate.mjs`
- **Dados do Jogo**: `src/constants.ts` (FAMILY_CARDS_DATA, ACTION_CARDS_DATA)
- **App Principal**: `src/App.tsx`
- **Componentes**: `src/components/AuthScreen.tsx`
- **Estilização**: Tailwind CSS v4 em `src/index.css`

## Peculiaridades Importantes

- Tailwind v4 usa config baseada em CSS (sem `tailwind.config.js`)
- Autenticação obrigatória - usuários não autenticados veem tela de login
- Jogo local mantém o estado no navegador; jogo online usa snapshots/versionamento na API
- O score online é salvo no PostgreSQL ao terminar
- Confirmação de email e recuperação de senha dependem de SMTP em produção; em desenvolvimento `EMAIL_MODE=console` apenas registra o link no log
