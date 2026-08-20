# Backup e restore do PostgreSQL

Objetivo operacional: manter um backup diário criptografado, com checksum, retenção conhecida e teste de restauração em ambiente isolado. Nenhum segredo deve ser versionado ou aparecer em comandos, relatórios ou logs.

## Backup

Em VPS, instale `age`, configure `/etc/jogo-clube/backup.env` fora do Git e habilite
`ops/jogo-clube-backup.timer` com `systemctl enable --now jogo-clube-backup.timer`.
O serviço chama `scripts/backup-postgres.sh` diariamente e grava o checksum ao lado do arquivo.

Defina `POSTGRES_USER`, `POSTGRES_DB` e `BACKUP_AGE_RECIPIENT` no ambiente seguro do operador. O recipiente age é público; a chave privada fica fora da VPS e com acesso restrito.

```bash
set -euo pipefail
umask 077
backup_dir=/var/backups/jogo-clube
mkdir -p "$backup_dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)

docker compose exec -T db pg_dump \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner \
  | age -r "$BACKUP_AGE_RECIPIENT" -o "$backup_dir/jogo-clube-$stamp.dump.age"

sha256sum "$backup_dir/jogo-clube-$stamp.dump.age" \
  > "$backup_dir/jogo-clube-$stamp.dump.age.sha256"
```

Copie os dois arquivos para armazenamento externo. Mantenha, no mínimo, sete diários e quatro semanais; remova somente após confirmar a cópia externa. Registre tamanho, checksum, horário UTC e retenção — nunca a senha ou a URL de conexão.

## Restore isolado

1. Crie uma instância PostgreSQL limpa e isolada, sem publicar a porta na internet.
2. Verifique o checksum antes de descriptografar:

   ```bash
   sha256sum -c jogo-clube-<timestamp>.dump.age.sha256
   age -d -i /caminho/seguro/age.key \
     -o jogo-clube-<timestamp>.dump \
     jogo-clube-<timestamp>.dump.age
   ```

3. Restaure o dump customizado no banco isolado, com `--exit-on-error` e sem sobrescrever produção:

   ```bash
   pg_restore --exit-on-error --no-owner \
     --dbname="$RESTORE_DATABASE_URL" jogo-clube-<timestamp>.dump
   ```

   Em VPS, `scripts/restore-postgres.sh` automatiza checksum, descriptografia e
   restore quando `BACKUP_FILE`, `AGE_KEY_FILE` e `RESTORE_DATABASE_URL` estão definidos.

4. Execute as migrações esperadas, consulte `/health/ready` e compare contagens de `users`, `profiles`, `matches` e `game_scores`.
5. Execute o verificador de exportação em modo `verify`, quando o export correspondente estiver disponível, e registre o resultado.
6. Destrua a instância temporária conforme a política de retenção e registre o teste, data, versão da imagem e resultado.

O CI executa esse mesmo fluxo com uma chave `age` efêmera, PostgreSQL limpo e
verificação das tabelas restauradas. O smoke não substitui o teste mensal em
infraestrutura isolada de produção, mas impede que mudanças quebrem o script.

## Incidente

Restore em produção exige aprovação explícita, janela de manutenção e backup adicional imediatamente anterior. Nunca use `docker compose down -v`: isso remove o volume do PostgreSQL. Se o dump estiver corrompido, preserve o arquivo e checksum, marque o backup como inválido e tente o backup anterior.
