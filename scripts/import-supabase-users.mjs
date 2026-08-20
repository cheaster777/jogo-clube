import 'dotenv/config';

import { randomBytes, scryptSync } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { parseCsv } from './import-supabase-export.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCK_KEY = 'jogo-clube:supabase-users-import';

class ValidationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

function usage() {
  return `
Uso:
  node scripts/import-supabase-users.mjs --input ./exports/users.json --mode dry-run
  DATABASE_URL='postgres://...' node scripts/import-supabase-users.mjs \\
    --input ./exports/users.json --mode apply --report ./artifacts/users.json
  DATABASE_URL='postgres://...' node scripts/import-supabase-users.mjs \\
    --input ./exports/users.json --mode verify

Opções:
  --input <arquivo>       Exportação users.(json|csv) do Supabase.
  --mode <dry-run|apply|verify>  Padrão: dry-run.
  --report <arquivo.json>  Relatório sem emails, hashes, tokens ou credenciais.
  --database-url           Rejeitado; use DATABASE_URL no ambiente.

O importador preserva UUID, email, status derivado da confirmação e timestamps.
Hashes Supabase incompatíveis não são copiados: um hash scrypt aleatório é
gravado e o usuário deverá usar recuperação de senha após o cutover.
`;
}

function parseArgs(argv) {
  const options = { mode: 'dry-run', inputPath: null, reportPath: null, help: false };
  const valueFor = (index, flag) => {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} exige um valor.`);
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--input') { options.inputPath = valueFor(index, arg); index += 1; }
    else if (arg === '--mode') { options.mode = valueFor(index, arg); index += 1; }
    else if (arg === '--report') { options.reportPath = valueFor(index, arg); index += 1; }
    else if (arg === '--database-url') throw new Error('Não passe DATABASE_URL como argumento; use a variável de ambiente.');
    else throw new Error(`Opção desconhecida: ${arg}`);
  }

  if (options.help) return options;
  if (!options.inputPath) throw new Error('Informe --input users.json|users.csv.');
  if (!['dry-run', 'apply', 'verify'].includes(options.mode)) throw new Error('--mode deve ser dry-run, apply ou verify.');
  return options;
}

function normaliseKey(key) {
  return String(key).replace(/^\uFEFF/, '').trim().toLowerCase();
}

function normaliseRecord(row, context) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new ValidationError(`${context}: cada linha deve ser um objeto.`);
  }
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    const normalised = normaliseKey(key);
    if (!normalised) continue;
    if (Object.hasOwn(result, normalised)) throw new ValidationError(`${context}: coluna duplicada: ${normalised}.`);
    result[normalised] = value;
  }
  return result;
}

function pick(row, aliases) {
  for (const alias of aliases) {
    const key = normaliseKey(alias);
    if (Object.hasOwn(row, key)) return row[key];
  }
  return undefined;
}

function requiredText(value, field, context) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new ValidationError(`${context}: campo obrigatório ausente: ${field}.`);
  }
  return String(value).trim();
}

function parseUuid(value, field, context) {
  const text = requiredText(value, field, context);
  if (!UUID_PATTERN.test(text)) throw new ValidationError(`${context}: ${field} não é UUID válido.`);
  return text.toLowerCase();
}

function parseTimestamp(value, field, context, fallback = null) {
  if ((value === undefined || value === null || String(value).trim() === '') && fallback !== null) return fallback;
  const text = requiredText(value, field, context);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${context}: ${field} não é data válida.`);
  return date.toISOString();
}

function parseEmail(value, context) {
  const email = requiredText(value, 'email', context).toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError(`${context}: email inválido.`);
  }
  return email;
}

function ensureUnique(values, message) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new ValidationError(message);
    seen.add(value);
  }
}

function placeholderPasswordHash() {
  const salt = randomBytes(16);
  const derived = scryptSync(randomBytes(32).toString('base64url'), salt, 64, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024,
  });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

function looksLikeCompatibleScryptHash(value) {
  return typeof value === 'string'
    && /^scrypt\$\d+\$\d+\$\d+\$[^$]+\$[^$]+$/.test(value);
}

function mapUsers(rows, sourceName = 'users') {
  const users = rows.map((raw, index) => {
    const context = `${sourceName}, linha ${index + 1}`;
    const row = normaliseRecord(raw, context);
    const createdAt = parseTimestamp(pick(row, ['created_at', 'inserted_at']), 'created_at', context);
    const confirmedAtValue = pick(row, ['email_confirmed_at', 'confirmed_at', 'email_verified_at']);
    const emailVerifiedAt = confirmedAtValue === undefined || confirmedAtValue === null || String(confirmedAtValue).trim() === ''
      ? null
      : parseTimestamp(confirmedAtValue, 'email_confirmed_at', context);
    const sourceHash = pick(row, ['password_hash', 'encrypted_password']);
    return {
      id: parseUuid(pick(row, ['id', 'user_id']), 'id', context),
      email: parseEmail(pick(row, ['email']), context),
      status: emailVerifiedAt ? 'active' : 'pending',
      emailVerifiedAt,
      createdAt,
      updatedAt: parseTimestamp(pick(row, ['updated_at']), 'updated_at', context, createdAt),
      passwordHash: looksLikeCompatibleScryptHash(sourceHash) ? sourceHash : placeholderPasswordHash(),
      passwordMigrated: looksLikeCompatibleScryptHash(sourceHash),
    };
  });
  ensureUnique(users.map(user => user.id), `${sourceName}: id duplicado.`);
  ensureUnique(users.map(user => user.email), `${sourceName}: email duplicado.`);
  return users;
}

async function loadRows(filePath) {
  const contents = await readFile(filePath, 'utf8');
  const extension = extname(filePath).toLowerCase();
  if (extension === '.csv') return parseCsv(contents, filePath);
  if (extension !== '.json') throw new ValidationError(`${filePath}: use .json ou .csv.`);
  let parsed;
  try {
    parsed = JSON.parse(contents.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new ValidationError(`${filePath}: JSON inválido (${error instanceof Error ? error.message : 'erro desconhecido'}).`);
  }
  if (Array.isArray(parsed)) return parsed;
  for (const key of ['data', 'rows', 'users']) {
    if (parsed && Array.isArray(parsed[key])) return parsed[key];
  }
  throw new ValidationError(`${filePath}: não foi encontrada uma lista em data, rows ou users.`);
}

async function assertTargetTable(client) {
  const result = await client.query("SELECT to_regclass('public.users') AS users");
  if (!result.rows[0].users) throw new Error('Schema alvo incompleto; tabela users ausente.');
}

async function readTarget(client, users) {
  const ids = users.map(user => user.id);
  const result = await client.query(`
    SELECT id::text, email, status, email_verified_at, created_at, updated_at
      FROM users
     WHERE id = ANY($1::uuid[])
  `, [ids]);
  const byId = new Map(result.rows.map(row => [String(row.id).toLowerCase(), row]));
  const byEmail = new Map(result.rows.map(row => [String(row.email).toLowerCase(), row]));
  return { byId, byEmail };
}

function sameUser(source, target) {
  const targetVerified = target.email_verified_at ? new Date(target.email_verified_at).toISOString() : null;
  return source.email === String(target.email).toLowerCase()
    && source.status === target.status
    && source.emailVerifiedAt === targetVerified
    && source.createdAt === new Date(target.created_at).toISOString()
    && source.updatedAt === new Date(target.updated_at).toISOString();
}

function verifyTarget(users, target) {
  const missing = users.filter(user => !target.byId.has(user.id)).map(user => user.id);
  const divergent = users
    .filter(user => target.byId.has(user.id) && !sameUser(user, target.byId.get(user.id)))
    .map(user => user.id);
  const emailConflicts = users
    .filter(user => target.byEmail.has(user.email) && String(target.byEmail.get(user.email).id).toLowerCase() !== user.id)
    .map(user => user.id);
  const errors = [];
  if (divergent.length) errors.push(`${divergent.length} usuário(s) existente(s) divergem do export.`);
  if (emailConflicts.length) errors.push(`${emailConflicts.length} email(s) já pertencem a outro UUID.`);
  return {
    ok: errors.length === 0,
    errors,
    counts: { sourceUsers: users.length, targetUsersMatched: users.length - missing.length },
    missing,
    divergent,
    emailConflicts,
  };
}

function assertApplyPreconditions(users, target) {
  const verification = verifyTarget(users, target);
  if (!verification.ok) {
    throw new ValidationError('Pré-condições do apply falharam; nada foi escrito.', verification.errors);
  }
}

async function insertUsers(client, users) {
  for (const user of users) {
    await client.query(`
      INSERT INTO users
        (id, email, password_hash, status, email_verified_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
    `, [user.id, user.email, user.passwordHash, user.status, user.emailVerifiedAt, user.createdAt, user.updatedAt]);
  }
}

async function runDatabaseMode(options, users) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definido.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, application_name: 'jogo-clube-supabase-users-import' });
  const client = await pool.connect();
  try {
    await assertTargetTable(client);
    if (options.mode === 'verify') return verifyTarget(users, await readTarget(client, users));

    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [LOCK_KEY]);
    const target = await readTarget(client, users);
    assertApplyPreconditions(users, target);
    await insertUsers(client, users);
    const verification = verifyTarget(users, await readTarget(client, users));
    if (!verification.ok || verification.missing.length > 0) {
      await client.query('ROLLBACK');
      throw new ValidationError('A verificação transacional falhou; nenhuma alteração foi confirmada.', verification.errors);
    }
    await client.query('COMMIT');
    return verification;
  } catch (error) {
    if (options.mode === 'apply') await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function writeReport(report, reportPath) {
  if (!reportPath) return;
  const destination = resolve(reportPath);
  await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }).catch(error => {
    if (error.code === 'EEXIST') throw new Error(`Relatório já existe: ${destination}.`);
    throw error;
  });
  console.log(`Relatório gravado: ${destination}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const users = mapUsers(await loadRows(resolve(options.inputPath)));
  let targetVerification = null;
  if (options.mode !== 'dry-run') targetVerification = await runDatabaseMode(options, users);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    inputFile: options.inputPath.split(/[\\/]/).pop(),
    sourceCounts: { users: users.length },
    targetVerification,
    warnings: [
      'Senhas Supabase incompatíveis não são preservadas; usuários afetados devem usar recuperação de senha.',
      'O relatório não inclui emails, hashes, tokens ou credenciais.',
    ],
  };
  await writeReport(report, options.reportPath);
  console.log(`Fonte: ${users.length} usuário(s).`);
  if (targetVerification) console.log(`Alvo: ${targetVerification.counts.targetUsersMatched}/${users.length} usuário(s) conferidos.`);
  if (targetVerification && !targetVerification.ok) {
    throw new ValidationError('Validação do alvo falhou.', targetVerification.errors);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(`Falha: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof ValidationError) for (const detail of error.errors.slice(0, 20)) console.error(`- ${detail}`);
    process.exitCode = 1;
  });
}

export { mapUsers, placeholderPasswordHash };
