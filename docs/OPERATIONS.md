# Operação em VPS

Este documento descreve o mínimo necessário para executar o Clube de Ciências em uma VPS Linux com Docker Compose. O banco não deve publicar a porta 5432; somente o proxy deve ser exposto publicamente.

## Primeiro deploy

1. Instale Docker Engine e Compose, configure o firewall para permitir apenas SSH restrito, HTTP e HTTPS.
2. Crie `.env.production` fora do Git com `SITE_ADDRESS`, `DATABASE_URL`, `POSTGRES_PASSWORD`, `CORS_ORIGIN`, `APP_BASE_URL`, `TRUST_PROXY=true`, `EMAIL_MODE=smtp`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` e `SMTP_PASSWORD`. Para Resend via SMTP, use `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER=resend` e a API key `re_...` em `SMTP_PASSWORD`.
3. Valide o domínio antes de habilitar HSTS e confirme que o SMTP consegue entregar mensagens.
4. Execute as migrações com o job/runner de banco aprovado e verifique `GET /health/ready`.
5. Suba o stack: `docker compose --env-file .env.production --profile backend up -d --build`.

## Deploy pelo Easypanel

A produção roda no Easypanel da VPS `161.97.69.249`, no projeto `clube-ciencia`,
serviço Compose `jogo`, e recebe tráfego por um túnel Cloudflare. O push em
`main` executa apenas o CI: ele não atualiza o site.

O domínio é `jogo.clubedecienciasbona.com.br`. O domínio anterior,
`jogo.tonicoimbra.com`, redireciona para ele por `LEGACY_SITE_ADDRESS`. O DNS fica
no Cloudflare, e o túnel é o `clube-ciencia-vps`.

O Compose do Easypanel é inline e fixa o commit no `build.context` dos serviços
`web` e `api`. Para publicar uma versão:

1. Espere o CI do commit terminar com sucesso.
2. Troque o SHA nos dois `build.context` do Compose.
3. Execute o deploy do serviço no Easypanel.
4. Confira `GET /health/ready` e a versão servida em `/`.

Para reverter, coloque o SHA anterior nos dois `build.context` e faça o deploy.
As migrações não são revertidas por esse processo: faça um dump do banco antes de
publicar uma versão que altere `database/migrations`.

Não consulte a URL de um arquivo novo antes de ele estar em produção. O Cloudflare
guarda em cache por extensão, e a resposta de fallback ficaria em cache nessa URL.

O cadastro exige entrega de email em produção. Nunca use `EMAIL_MODE=console` em produção; esse modo só serve para desenvolvimento, combinado com `RESET_TOKEN_EXPOSE=true` fora de produção para testes locais. O frontend compilado deve receber `VITE_API_BASE_URL=/api/v1` (o valor padrão do Docker).

## Site institucional

O site `https://clubedecienciasbona.com.br` é estático e fica em `site/public`.
Ele roda no serviço `site` do mesmo Compose do Easypanel, com build em
`https://github.com/cheaster777/jogo-clube.git#<SHA>:site`. O hostname `www`
redireciona para a raiz, e o container responde em `GET /health`.

Para publicar uma versão:

1. Troque o SHA no `build.context` do serviço `site` e execute o deploy.
2. Ao alterar `site/public/css/site.css` ou substituir uma imagem mantendo o nome,
   aumente o `?v=` da URL nas três páginas. Esses arquivos ficam em cache por 7 dias.

O túnel encaminha o site por `/home/hermes/clubeciencia-migracao-private/cloudflare-tunnel.yml`
na VPS. Um hostname novo exige reiniciar o container `cloudflared` e criar um CNAME
com proxy para `<id do túnel>.cfargotunnel.com` no Cloudflare.

O `cert.pem` do `cloudflared` nesta máquina e na VPS só cobre a zona
`tonicoimbra.com`. Não use `cloudflared tunnel route dns` para este domínio com esse
certificado. Crie o CNAME pelo painel do Cloudflare.

O CSP do site proíbe estilos inline. Use classes em `site/public/css/site.css`.

O Cloudflare ofusca emails no HTML com um script que esse CSP bloqueia. Mantenha todo
endereço de email entre `<!--email_off-->` e `<!--/email_off-->`.

A pasta `site/_legado` guarda o site antigo e as fotos originais. Ela existe só na
máquina local e está fora do Git.

## Android/Capacitor

O app nativo deve apontar para a mesma API HTTPS, sem embutir chaves administrativas:

```bash
$env:VITE_API_BASE_URL='https://jogo.exemplo.com/api/v1' # PowerShell
npm run build
npx cap sync android
```

Em Linux/macOS, use `VITE_API_BASE_URL=https://jogo.exemplo.com/api/v1 npm run build`. Como `capacitor.config.ts` usa `androidScheme: https`, inclua `https://localhost` na allowlist de `CORS_ORIGIN` da API quando o cliente Android fizer chamadas diretas ao domínio, por exemplo `https://jogo.exemplo.com,https://localhost`. Teste login, criação de sala, reconexão e ranking em um dispositivo antes de publicar a versão.

## Migrações e backup

As migrações em `database/migrations/` são aplicadas em ordem lexicográfica e devem ser revisadas antes de produção. Nunca edite uma migração já aplicada; crie outra.

Para importar identidades, use primeiro [`scripts/import-supabase-users.mjs`](../scripts/import-supabase-users.mjs). O script preserva UUID, email, confirmação e timestamps. Quando o hash exportado não é scrypt compatível, grava um hash aleatório inutilizável; esses usuários devem redefinir a senha por email após o cutover. O modo padrão é somente leitura:

```bash
node scripts/import-supabase-users.mjs --input ./exports/final/users.json --mode dry-run
```

Depois do congelamento, execute `--mode apply` com `DATABASE_URL` no ambiente seguro e guarde o relatório. Em seguida, importe os dados de jogo com [`scripts/import-supabase-export.mjs`](../scripts/import-supabase-export.mjs):

```bash
node scripts/import-supabase-export.mjs --input-dir ./exports/final --mode dry-run
```

Depois do congelamento de gravações, configure `DATABASE_URL` no ambiente seguro e execute `--mode apply`. O script preserva UUIDs e instantes UTC, valida conflitos, contagens, órfãos e Top 50 dentro da mesma transação. Para exports antigos sem `match_id`, a opção `--legacy-score-mode synthetic-match` deve ser aprovada previamente; sem ela a operação é recusada. Use `--mode verify` para repetir a validação sem escrever.

O checklist completo está em [`CUTOVER_CHECKLIST.md`](CUTOVER_CHECKLIST.md). O procedimento de backup, checksum e restore isolado está em [`BACKUP_RESTORE.md`](BACKUP_RESTORE.md).

Backup diário criptografado:

```bash
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom | age -r "$BACKUP_AGE_RECIPIENT" > "backup-$(date -u +%Y%m%d).dump.age"
```

Teste mensalmente o restore em uma instância isolada e registre contagens de usuários, partidas e scores. Mantenha pelo menos 7 backups diários e 4 semanais em armazenamento externo.

## Monitoramento e rollback

- Verifique `/health/live` (processo) e `/health/ready` (banco) a cada 30 segundos.
- Consulte `docker compose logs --since=15m api web`; logs não podem conter senha, cookie, token ou payload sensível.
- Antes do deploy, mantenha a imagem anterior identificada por digest.
- Em falha, reverta as imagens para o digest anterior, restaure o banco apenas com aprovação e mantenha o DNS apontando para a versão saudável.
- Não execute `down -v` em produção: isso remove o volume do PostgreSQL.

## Segurança

Atualize o sistema e as imagens regularmente, restrinja SSH por chave, desabilite login root e confirme que o Compose não publica o banco. Variáveis de produção nunca devem entrar no repositório, no bundle Vite ou em logs.
