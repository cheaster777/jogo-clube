import 'dotenv/config';

import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const MAX_PUBLIC_NAME_LENGTH = 80;
const TOP_LIMIT = 50;
const DEFAULT_RULE_VERSION = 'legacy-supabase';
const IMPORT_LOCK_KEY = 'jogo-clube:supabase-export-import';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_NAMESPACE_DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

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
  node scripts/import-supabase-export.mjs --input-dir ./exports/2026-08-20 --mode dry-run
  DATABASE_URL='postgres://...' node scripts/import-supabase-export.mjs \\
    --profiles ./exports/profiles.json --scores ./exports/game_scores.csv --mode apply
  DATABASE_URL='postgres://...' node scripts/import-supabase-export.mjs \\
    --input-dir ./exports/2026-08-20 --mode verify

Opções:
  --input-dir <dir>                  Diretório com profiles.(json|csv) e game_scores.(json|csv).
  --profiles <arquivo>               Exportação de profiles em JSON ou CSV.
  --scores <arquivo>                 Exportação de game_scores em JSON ou CSV.
  --mode <dry-run|apply|verify>      Padrão: dry-run. apply grava; verify somente valida o alvo.
  --legacy-score-mode <reject|synthetic-match>
                                     Padrão: reject. synthetic-match cria partidas legadas mínimas
                                     para exports antigos sem match_id.
  --report <arquivo.json>             Grava relatório sem emails, tokens ou credenciais.
  --help                              Mostra esta ajuda.

Regras de segurança:
  - A conexão é lida somente de DATABASE_URL (nunca informe segredo na linha de comando).
  - O modo apply é transacional, usa advisory lock e aborta se a verificação final falhar.
  - O padrão é estrito: conflitos de UUID ou dados divergentes interrompem a operação.
`;
}

function parseArgs(argv) {
  const options = {
    mode: 'dry-run',
    legacyScoreMode: 'reject',
    inputDir: null,
    profilesPath: null,
    scoresPath: null,
    reportPath: null,
  };

  const valueFor = (index, flag) => {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${flag} exige um valor.`);
    }
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--input-dir') {
      options.inputDir = valueFor(index, arg);
      index += 1;
    } else if (arg === '--profiles') {
      options.profilesPath = valueFor(index, arg);
      index += 1;
    } else if (arg === '--scores') {
      options.scoresPath = valueFor(index, arg);
      index += 1;
    } else if (arg === '--mode') {
      options.mode = valueFor(index, arg);
      index += 1;
    } else if (arg === '--legacy-score-mode') {
      options.legacyScoreMode = valueFor(index, arg);
      index += 1;
    } else if (arg === '--report') {
      options.reportPath = valueFor(index, arg);
      index += 1;
    } else if (arg === '--dry-run') {
      options.mode = 'dry-run';
    } else if (arg === '--apply') {
      options.mode = 'apply';
    } else if (arg === '--verify') {
      options.mode = 'verify';
    } else if (arg === '--database-url') {
      throw new Error('Não passe DATABASE_URL como argumento; use a variável de ambiente para não expor o segredo no histórico do shell.');
    } else {
      throw new Error(`Opção desconhecida: ${arg}`);
    }
  }

  if (options.help) return options;
  if (!['dry-run', 'apply', 'verify'].includes(options.mode)) {
    throw new Error('--mode deve ser dry-run, apply ou verify.');
  }
  if (!['reject', 'synthetic-match'].includes(options.legacyScoreMode)) {
    throw new Error('--legacy-score-mode deve ser reject ou synthetic-match.');
  }
  if (options.inputDir && (options.profilesPath || options.scoresPath)) {
    throw new Error('Use --input-dir ou --profiles/--scores, não os dois formatos ao mesmo tempo.');
  }
  if (!options.inputDir && (!options.profilesPath || !options.scoresPath)) {
    throw new Error('Informe --input-dir ou ambos --profiles e --scores.');
  }
  if (options.mode === 'dry-run' && options.legacyScoreMode === 'synthetic-match') {
    // Permitir o modo no dry-run para que o operador veja os IDs sintéticos antes do apply.
  }
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
    if (Object.hasOwn(result, normalised)) {
      throw new ValidationError(`${context}: coluna duplicada após normalização: ${normalised}.`);
    }
    result[normalised] = value;
  }
  return result;
}

function parseCsv(text, filePath) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let justClosedQuote = false;

  const pushField = () => {
    row.push(field);
    field = '';
    justClosedQuote = false;
  };
  const pushRow = () => {
    if (row.length === 1 && row[0] === '' && rows.length === 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        justClosedQuote = true;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field === '') {
      quoted = true;
    } else if (character === ',' ) {
      pushField();
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && next === '\n') index += 1;
      pushField();
      pushRow();
    } else if (justClosedQuote && !/\s/.test(character)) {
      throw new ValidationError(`${filePath}: CSV inválido próximo ao caractere ${index + 1}.`);
    } else {
      field += character;
    }
  }
  if (quoted) throw new ValidationError(`${filePath}: CSV terminou dentro de aspas.`);
  if (field !== '' || row.length > 0) {
    pushField();
    pushRow();
  }
  if (rows.length === 0) throw new ValidationError(`${filePath}: CSV vazio.`);

  const headers = rows.shift().map(normaliseKey);
  if (headers.some((header) => !header)) throw new ValidationError(`${filePath}: cabeçalho CSV contém coluna vazia.`);
  if (new Set(headers).size !== headers.length) throw new ValidationError(`${filePath}: cabeçalho CSV contém colunas duplicadas.`);
  return rows
    .filter((values) => values.some((value) => String(value).trim() !== ''))
    .map((values, index) => {
      if (values.length !== headers.length) {
        throw new ValidationError(`${filePath}, linha ${index + 2}: quantidade de colunas incompatível.`);
      }
      return Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex]]));
    });
}

function unwrapJson(value, filePath, expectedName) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') {
    throw new ValidationError(`${filePath}: JSON deve conter uma lista de registros.`);
  }
  for (const key of ['data', 'rows', expectedName, expectedName.replace('_', '-')]) {
    if (Array.isArray(value[key])) return value[key];
  }
  throw new ValidationError(`${filePath}: não foi encontrada uma lista em data, rows ou ${expectedName}.`);
}

async function loadRows(filePath, expectedName) {
  const contents = await readFile(filePath, 'utf8');
  const extension = extname(filePath).toLowerCase();
  if (extension === '.csv') return parseCsv(contents, filePath);
  if (extension !== '.json') throw new ValidationError(`${filePath}: use um arquivo .json ou .csv.`);
  let parsed;
  try {
    parsed = JSON.parse(contents.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new ValidationError(`${filePath}: JSON inválido (${error instanceof Error ? error.message : 'erro desconhecido'}).`);
  }
  return unwrapJson(parsed, filePath, expectedName);
}

async function discoverFile(directory, names) {
  const entries = await readdir(directory, { withFileTypes: true });
  const matches = entries
    .filter((entry) => entry.isFile() && names.includes(entry.name.toLowerCase()))
    .map((entry) => resolve(directory, entry.name));
  if (matches.length === 0) {
    throw new ValidationError(`${directory}: não encontrei ${names.join(' ou ')}.`);
  }
  if (matches.length > 1) {
    throw new ValidationError(`${directory}: exportação ambígua; remova uma das opções: ${matches.map((path) => path.split(/[\\/]/).pop()).join(', ')}.`);
  }
  return matches[0];
}

async function resolveInputFiles(options) {
  if (options.inputDir) {
    const directory = resolve(options.inputDir);
    return {
      profilesPath: await discoverFile(directory, ['profiles.json', 'profiles.csv']),
      scoresPath: await discoverFile(directory, ['game_scores.json', 'game_scores.csv', 'game-scores.json', 'game-scores.csv']),
    };
  }
  return { profilesPath: resolve(options.profilesPath), scoresPath: resolve(options.scoresPath) };
}

function pick(row, aliases) {
  for (const alias of aliases) {
    const key = normaliseKey(alias);
    if (Object.hasOwn(row, key)) return row[key];
  }
  return undefined;
}

function contextFor(kind, index) {
  return `${kind}, linha ${index + 1}`;
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
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${context}: ${field} não é uma data ISO/RFC3339 válida.`);
  return date.toISOString();
}

function parseInteger(value, field, context) {
  const text = requiredText(value, field, context);
  if (!/^-?\d+$/.test(text)) throw new ValidationError(`${context}: ${field} deve ser inteiro.`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) throw new ValidationError(`${context}: ${field} excede o intervalo seguro.`);
  return parsed;
}

function parsePreferences(value, context) {
  if (value === undefined || value === null || String(value).trim() === '') return {};
  if (typeof value === 'object') {
    if (Array.isArray(value)) throw new ValidationError(`${context}: preferences deve ser objeto JSON.`);
    return value;
  }
  try {
    const parsed = JSON.parse(String(value));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('não é objeto');
    return parsed;
  } catch {
    throw new ValidationError(`${context}: preferences contém JSON inválido.`);
  }
}

function mapProfiles(rows, sourceName) {
  const profiles = rows.map((raw, index) => {
    const context = contextFor(sourceName, index);
    const row = normaliseRecord(raw, context);
    const createdAt = parseTimestamp(pick(row, ['created_at', 'inserted_at']), 'created_at', context);
    return {
      userId: parseUuid(pick(row, ['user_id', 'id', 'profile_id']), 'id/user_id', context),
      publicName: requiredText(pick(row, ['public_name', 'full_name', 'name']), 'full_name/public_name', context),
      preferences: parsePreferences(pick(row, ['preferences', 'settings']), context),
      createdAt,
      updatedAt: parseTimestamp(pick(row, ['updated_at']), 'updated_at', context, createdAt),
    };
  });
  profiles.forEach((profile, index) => {
    if ([...profile.publicName].length > MAX_PUBLIC_NAME_LENGTH) {
      throw new ValidationError(`${contextFor(sourceName, index)}: nome público excede ${MAX_PUBLIC_NAME_LENGTH} caracteres.`);
    }
  });
  ensureUnique(profiles.map((profile) => profile.userId), `${sourceName}: user_id duplicado`);
  return profiles;
}

function mapScores(rows, sourceName) {
  const scores = rows.map((raw, index) => {
    const context = contextFor(sourceName, index);
    const row = normaliseRecord(raw, context);
    const playedAt = parseTimestamp(pick(row, ['played_at', 'created_at']), 'played_at', context);
    const score = parseInteger(pick(row, ['score']), 'score', context);
    const familiesCount = parseInteger(pick(row, ['families_count', 'family_count']), 'families_count', context);
    if (score < 0) throw new ValidationError(`${context}: score não pode ser negativo.`);
    if (familiesCount < 0) throw new ValidationError(`${context}: families_count não pode ser negativo.`);
    return {
      id: parseUuid(pick(row, ['id', 'score_id']), 'id', context),
      userId: parseUuid(pick(row, ['user_id', 'profile_id']), 'user_id', context),
      matchId: pick(row, ['match_id']) ? parseUuid(pick(row, ['match_id']), 'match_id', context) : null,
      score,
      qualityCategory: requiredText(pick(row, ['quality_category', 'category']), 'quality_category', context),
      qualityDiagnosis: requiredText(pick(row, ['quality_diagnosis', 'diagnosis']), 'quality_diagnosis', context),
      familiesCount,
      ruleVersion: pick(row, ['rule_version']) ? requiredText(pick(row, ['rule_version']), 'rule_version', context) : DEFAULT_RULE_VERSION,
      playedAt,
    };
  });
  ensureUnique(scores.map((score) => score.id), `${sourceName}: id duplicado`);
  ensureUnique(
    scores.filter((score) => score.matchId).map((score) => `${score.matchId}:${score.userId}`),
    `${sourceName}: combinação match_id,user_id duplicada`,
  );
  return scores;
}

function ensureUnique(values, message) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new ValidationError(message);
    seen.add(value);
  }
}

function uuidToBytes(uuid) {
  return Buffer.from(uuid.replaceAll('-', ''), 'hex');
}

function bytesToUuid(bytes) {
  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function uuidV5(namespace, name) {
  const digest = createHash('sha1').update(Buffer.concat([uuidToBytes(namespace), Buffer.from(name, 'utf8')])).digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  return bytesToUuid(digest.subarray(0, 16));
}

function prepareDataset(raw, legacyScoreMode) {
  const profileIds = new Set(raw.profiles.map((profile) => profile.userId));
  const sourceOrphans = {
    scoresWithoutSourceProfile: raw.scores.filter((score) => !profileIds.has(score.userId)).map((score) => score.id),
    scoresWithoutMatchId: raw.scores.filter((score) => !score.matchId).map((score) => score.id),
  };
  if (sourceOrphans.scoresWithoutSourceProfile.length > 0) {
    throw new ValidationError('Exportação inconsistente: game_scores referencia perfil ausente.', sourceOrphans.scoresWithoutSourceProfile.map((id) => `score ${id}`));
  }
  if (sourceOrphans.scoresWithoutMatchId.length > 0 && legacyScoreMode === 'reject') {
    throw new ValidationError('Há game_scores sem match_id. Use --legacy-score-mode synthetic-match somente após aprovar a criação de partidas legadas.', sourceOrphans.scoresWithoutMatchId.map((id) => `score ${id}`));
  }

  const scores = raw.scores.map((score) => ({
    ...score,
    matchId: score.matchId || uuidV5(UUID_NAMESPACE_DNS, `jogo-clube:legacy-score:${score.id}`),
    syntheticMatch: !score.matchId,
  }));
  ensureUnique(
    scores.map((score) => `${score.matchId}:${score.userId}`),
    'game_scores: combinação match_id,user_id duplicada após normalização.',
  );
  return { profiles: raw.profiles, scores, sourceOrphans };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameTimestamp(left, right) {
  return new Date(left).getTime() === new Date(right).getTime();
}

function sameProfile(source, target) {
  return source.publicName === target.public_name
    && canonicalJson(source.preferences) === canonicalJson(target.preferences)
    && sameTimestamp(source.createdAt, target.created_at)
    && sameTimestamp(source.updatedAt, target.updated_at);
}

function sameScore(source, target) {
  return source.id === String(target.id).toLowerCase()
    && source.matchId === String(target.match_id).toLowerCase()
    && source.userId === String(target.user_id).toLowerCase()
    && source.score === Number(target.score)
    && source.qualityCategory === target.quality_category
    && source.qualityDiagnosis === target.quality_diagnosis
    && source.familiesCount === Number(target.families_count)
    && source.ruleVersion === target.rule_version
    && sameTimestamp(source.playedAt, target.played_at);
}

async function assertTargetTables(client) {
  const result = await client.query(`
    SELECT to_regclass('public.users') AS users,
           to_regclass('public.profiles') AS profiles,
           to_regclass('public.matches') AS matches,
           to_regclass('public.match_players') AS match_players,
           to_regclass('public.match_snapshots') AS match_snapshots,
           to_regclass('public.game_scores') AS game_scores
  `);
  const missing = Object.entries(result.rows[0])
    .filter(([, value]) => value === null)
    .map(([name]) => name);
  if (missing.length > 0) throw new Error(`Schema alvo incompleto; tabelas ausentes: ${missing.join(', ')}.`);
}

function uuidArray(values) {
  return values.length > 0 ? values : [];
}

async function readTarget(client, dataset) {
  const profileIds = uuidArray(dataset.profiles.map((profile) => profile.userId));
  const scoreIds = uuidArray(dataset.scores.map((score) => score.id));
  const userIds = uuidArray([...new Set([...dataset.profiles.map((profile) => profile.userId), ...dataset.scores.map((score) => score.userId)])]);
  const matchIds = uuidArray(dataset.scores.map((score) => score.matchId));
  const [users, profiles, scores, scoresByMatch, matches, syntheticParts, orphanCounts, top] = await Promise.all([
    client.query('SELECT id::text FROM users WHERE id = ANY($1::uuid[])', [userIds]),
    client.query(`SELECT user_id::text, public_name, preferences, created_at, updated_at
                    FROM profiles WHERE user_id = ANY($1::uuid[])`, [profileIds]),
    client.query(`SELECT id::text, match_id::text, user_id::text, score, quality_category,
                         quality_diagnosis, families_count, rule_version, played_at
                    FROM game_scores WHERE id = ANY($1::uuid[])`, [scoreIds]),
    client.query(`SELECT id::text, match_id::text, user_id::text
                    FROM game_scores WHERE match_id = ANY($1::uuid[])`, [matchIds]),
    client.query(`SELECT id::text, created_by::text, mode, status, seed, rule_version,
                         created_at, updated_at, finished_at
                    FROM matches WHERE id = ANY($1::uuid[])`, [matchIds]),
    client.query(`SELECT mp.match_id::text, mp.user_id::text, mp.seat, mp.display_name,
                         mp.is_bot, mp.status, mp.score, ms.version AS snapshot_version
                    FROM match_players mp
                    LEFT JOIN match_snapshots ms ON ms.match_id = mp.match_id AND ms.version = 0
                    WHERE mp.match_id = ANY($1::uuid[])`, [matchIds]),
    client.query(`
      SELECT
        (SELECT count(*) FROM profiles p LEFT JOIN users u ON u.id = p.user_id WHERE u.id IS NULL) AS profiles_without_users,
        (SELECT count(*) FROM game_scores gs LEFT JOIN users u ON u.id = gs.user_id WHERE u.id IS NULL) AS scores_without_users,
        (SELECT count(*) FROM game_scores gs LEFT JOIN profiles p ON p.user_id = gs.user_id WHERE p.user_id IS NULL) AS scores_without_profiles,
        (SELECT count(*) FROM game_scores gs LEFT JOIN matches m ON m.id = gs.match_id WHERE m.id IS NULL) AS scores_without_matches
    `),
    client.query(`SELECT gs.id::text, gs.score, gs.quality_category, gs.played_at, p.public_name
                    FROM game_scores gs
                    LEFT JOIN profiles p ON p.user_id = gs.user_id
                   ORDER BY gs.score DESC, gs.played_at ASC, gs.id ASC
                   LIMIT ${TOP_LIMIT}`),
  ]);
  return {
    userIds: new Set(users.rows.map((row) => String(row.id).toLowerCase())),
    profiles: new Map(profiles.rows.map((row) => [String(row.user_id).toLowerCase(), row])),
    scores: new Map(scores.rows.map((row) => [String(row.id).toLowerCase(), row])),
    scoresByMatchUser: new Map(scoresByMatch.rows.map((row) => [scoreKey(row.match_id, row.user_id), row])),
    matches: new Map(matches.rows.map((row) => [String(row.id).toLowerCase(), row])),
    syntheticParts: new Map(syntheticParts.rows.map((row) => [String(row.match_id).toLowerCase(), row])),
    orphanCounts: Object.fromEntries(Object.entries(orphanCounts.rows[0]).map(([key, value]) => [key, Number(value)])),
    top: top.rows,
  };
}

function scoreKey(matchId, userId) {
  return `${String(matchId).toLowerCase()}:${String(userId).toLowerCase()}`;
}

function sourceTop(dataset) {
  const profiles = new Map(dataset.profiles.map((profile) => [profile.userId, profile.publicName]));
  return [...dataset.scores]
    .sort((left, right) => right.score - left.score || new Date(left.playedAt) - new Date(right.playedAt) || left.id.localeCompare(right.id))
    .slice(0, TOP_LIMIT)
    .map((score) => ({
      id: score.id,
      score: score.score,
      quality_category: score.qualityCategory,
      played_at: score.playedAt,
      public_name: profiles.get(score.userId) || null,
    }));
}

function comparableTop(rows) {
  return rows.map((row) => ({
    id: String(row.id).toLowerCase(),
    score: Number(row.score),
    quality_category: row.quality_category,
    played_at: new Date(row.played_at).toISOString(),
    public_name: row.public_name ?? null,
  }));
}

function verifyTarget(dataset, target) {
  const errors = [];
  const missingUsers = dataset.profiles.filter((profile) => !target.userIds.has(profile.userId)).map((profile) => profile.userId);
  const missingScoreUsers = dataset.scores.filter((score) => !target.userIds.has(score.userId)).map((score) => score.id);
  const missingProfiles = dataset.scores.filter((score) => !target.profiles.has(score.userId)).map((score) => score.id);
  const missingMatches = dataset.scores.filter((score) => !target.matches.has(score.matchId)).map((score) => score.id);
  const missingScores = dataset.scores.filter((score) => !target.scores.has(score.id)).map((score) => score.id);
  const divergentProfiles = dataset.profiles.filter((profile) => target.profiles.has(profile.userId) && !sameProfile(profile, target.profiles.get(profile.userId))).map((profile) => profile.userId);
  const divergentScores = dataset.scores.filter((score) => target.scores.has(score.id) && !sameScore(score, target.scores.get(score.id))).map((score) => score.id);
  const invalidSyntheticMatches = dataset.scores
    .filter((score) => score.syntheticMatch && target.matches.has(score.matchId))
    .filter((score) => {
      const match = target.matches.get(score.matchId);
      const part = target.syntheticParts.get(score.matchId);
      return match.created_by !== score.userId
        || match.status !== 'finished'
        || match.rule_version !== DEFAULT_RULE_VERSION
        || match.seed !== `legacy-score:${score.id}`
        || !part
        || String(part.user_id).toLowerCase() !== score.userId
        || Number(part.seat) !== 0
        || Number(part.score) !== score.score
        || Number(part.snapshot_version) !== 0;
    })
    .map((score) => score.id);

  if (missingUsers.length) errors.push(`users ausentes para ${missingUsers.length} perfil(is).`);
  if (missingScoreUsers.length) errors.push(`users ausentes para ${missingScoreUsers.length} score(s).`);
  if (missingProfiles.length) errors.push(`profiles ausentes para ${missingProfiles.length} score(s).`);
  if (missingMatches.length) errors.push(`matches ausentes para ${missingMatches.length} score(s).`);
  if (missingScores.length) errors.push(`${missingScores.length} score(s) não encontrados no alvo.`);
  if (divergentProfiles.length) errors.push(`${divergentProfiles.length} perfil(is) divergente(s) no alvo.`);
  if (divergentScores.length) errors.push(`${divergentScores.length} score(s) divergente(s) no alvo.`);
  if (invalidSyntheticMatches.length) errors.push(`${invalidSyntheticMatches.length} partida(s) legada(s) sintética(s) divergente(s) no alvo.`);

  const expectedTop = sourceTop(dataset);
  const actualTop = comparableTop(target.top);
  if (canonicalJson(expectedTop) !== canonicalJson(actualTop)) errors.push('Top 50 do ranking diverge do export após a migração.');
  for (const count of Object.values(target.orphanCounts)) {
    if (count !== 0) {
      errors.push('O banco alvo contém registros órfãos nas relações verificadas.');
      break;
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    counts: {
      sourceProfiles: dataset.profiles.length,
      sourceScores: dataset.scores.length,
      targetProfilesMatched: dataset.profiles.filter((profile) => target.profiles.has(profile.userId)).length,
      targetScoresMatched: dataset.scores.filter((score) => target.scores.has(score.id)).length,
    },
    missing: { usersForProfiles: missingUsers, usersForScores: missingScoreUsers, profilesForScores: missingProfiles, matchesForScores: missingMatches, scores: missingScores },
    divergent: { profiles: divergentProfiles, scores: divergentScores, syntheticMatches: invalidSyntheticMatches },
    orphanCounts: target.orphanCounts,
    top50: { expected: expectedTop, actual: actualTop, equal: canonicalJson(expectedTop) === canonicalJson(actualTop) },
  };
}

function assertApplyPreconditions(dataset, target) {
  const errors = [];
  const missingUsers = dataset.profiles
    .map((profile) => profile.userId)
    .filter((userId) => !target.userIds.has(userId));
  const missingMatches = dataset.scores
    .filter((score) => !score.syntheticMatch && !target.matches.has(score.matchId))
    .map((score) => score.id);
  const occupiedScores = dataset.scores
    .filter((score) => target.scoresByMatchUser.has(scoreKey(score.matchId, score.userId)))
    .filter((score) => String(target.scoresByMatchUser.get(scoreKey(score.matchId, score.userId)).id).toLowerCase() !== score.id)
    .map((score) => score.id);
  const divergentProfiles = dataset.profiles
    .filter((profile) => target.profiles.has(profile.userId) && !sameProfile(profile, target.profiles.get(profile.userId)))
    .map((profile) => profile.userId);
  const divergentScores = dataset.scores
    .filter((score) => target.scores.has(score.id) && !sameScore(score, target.scores.get(score.id)))
    .map((score) => score.id);

  if (missingUsers.length) errors.push(`${missingUsers.length} user(s) necessários não existem no alvo; importe identidades antes dos perfis.`);
  if (missingMatches.length) errors.push(`${missingMatches.length} match(es) referenciados não existem no alvo.`);
  if (occupiedScores.length) errors.push(`${occupiedScores.length} score(s) já pertencem à combinação match_id,user_id.`);
  if (divergentProfiles.length) errors.push(`${divergentProfiles.length} perfil(is) existente(s) divergem do export.`);
  if (divergentScores.length) errors.push(`${divergentScores.length} score(s) existente(s) divergem do export.`);
  if (errors.length) throw new ValidationError('Pré-condições do apply falharam; nada foi escrito.', errors);
}

async function insertProfiles(client, dataset) {
  for (const profile of dataset.profiles) {
    await client.query(`
      INSERT INTO profiles (user_id, public_name, preferences, created_at, updated_at)
      VALUES ($1, $2, $3::jsonb, $4, $5)
      ON CONFLICT (user_id) DO NOTHING
    `, [profile.userId, profile.publicName, JSON.stringify(profile.preferences), profile.createdAt, profile.updatedAt]);
  }
}

async function insertSyntheticMatches(client, dataset) {
  for (const score of dataset.scores.filter((item) => item.syntheticMatch)) {
    const profile = dataset.profiles.find((item) => item.userId === score.userId);
    await client.query(`
      INSERT INTO matches
        (id, created_by, mode, status, seed, rule_version, current_round,
         current_player_index, state_version, created_at, updated_at, finished_at)
      VALUES ($1, $2, 'local', 'finished', $3, $4, 1, 0, 0, $5, $5, $5)
      ON CONFLICT (id) DO NOTHING
    `, [score.matchId, score.userId, `legacy-score:${score.id}`, DEFAULT_RULE_VERSION, score.playedAt]);
    await client.query(`
      INSERT INTO match_players
        (match_id, user_id, seat, display_name, is_bot, status, score, created_at)
      VALUES ($1, $2, 0, $3, false, 'finished', $4, $5)
      ON CONFLICT (match_id, seat) DO NOTHING
    `, [score.matchId, score.userId, profile.publicName, score.score, score.playedAt]);
    await client.query(`
      INSERT INTO match_snapshots (match_id, version, state, created_at)
      VALUES ($1, 0, $2::jsonb, $3)
      ON CONFLICT (match_id, version) DO NOTHING
    `, [score.matchId, JSON.stringify({ legacy: true, sourceScoreId: score.id }), score.playedAt]);
  }
}

async function insertScores(client, dataset) {
  for (const score of dataset.scores) {
    await client.query(`
      INSERT INTO game_scores
        (id, match_id, user_id, score, quality_category, quality_diagnosis,
         families_count, rule_version, played_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING
    `, [score.id, score.matchId, score.userId, score.score, score.qualityCategory,
      score.qualityDiagnosis, score.familiesCount, score.ruleVersion, score.playedAt]);
  }
}

async function runDatabaseMode(options, dataset) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definido. O script nunca recebe a conexão por argumento.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, application_name: 'jogo-clube-supabase-import' });
  const client = await pool.connect();
  try {
    await assertTargetTables(client);
    if (options.mode === 'verify') {
      return verifyTarget(dataset, await readTarget(client, dataset));
    }

    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [IMPORT_LOCK_KEY]);
    await assertTargetTables(client);
    assertApplyPreconditions(dataset, await readTarget(client, dataset));
    await insertProfiles(client, dataset);
    if (dataset.scores.some((score) => score.syntheticMatch)) await insertSyntheticMatches(client, dataset);
    await insertScores(client, dataset);
    const verification = verifyTarget(dataset, await readTarget(client, dataset));
    if (!verification.ok) {
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

function sourceOnlyReport(dataset, files, options) {
  const expectedTop = sourceTop(dataset);
  return {
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    legacyScoreMode: options.legacyScoreMode,
    inputFiles: { profiles: files.profilesPath.split(/[\\/]/).pop(), scores: files.scoresPath.split(/[\\/]/).pop() },
    sourceCounts: { profiles: dataset.profiles.length, gameScores: dataset.scores.length },
    sourceOrphans: dataset.sourceOrphans,
    top50: expectedTop,
    targetVerification: null,
    warnings: ['Nenhuma conexão foi aberta no dry-run; use --mode verify com DATABASE_URL para validar o PostgreSQL alvo.'],
  };
}

function printSummary(report) {
  console.log(`Modo: ${report.mode}`);
  console.log(`Fonte: ${report.sourceCounts.profiles} profile(s), ${report.sourceCounts.gameScores} game_score(s).`);
  console.log(`Top 50 calculado: ${report.top50?.actual ? (report.top50.equal ? 'confere' : 'diverge') : 'pronto para comparação'}.`);
  if (report.targetVerification) {
    const verification = report.targetVerification;
    console.log(`Alvo: ${verification.counts.targetProfilesMatched}/${verification.counts.sourceProfiles} profiles e ${verification.counts.targetScoresMatched}/${verification.counts.sourceScores} scores conferidos.`);
    console.log(`Órfãos: ${JSON.stringify(verification.orphanCounts)}.`);
    if (verification.errors.length) console.error(`Falhas de validação: ${verification.errors.join(' ')}`);
  }
  if (report.warnings?.length) for (const warning of report.warnings) console.warn(`Aviso: ${warning}`);
}

async function writeReport(report, reportPath) {
  if (!reportPath) return;
  const destination = resolve(reportPath);
  await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }).catch((error) => {
    if (error.code === 'EEXIST') throw new Error(`Relatório já existe: ${destination}. Escolha outro caminho para não sobrescrever evidência.`);
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
  const files = await resolveInputFiles(options);
  const [profileRows, scoreRows] = await Promise.all([
    loadRows(files.profilesPath, 'profiles'),
    loadRows(files.scoresPath, 'game_scores'),
  ]);
  const raw = {
    profiles: mapProfiles(profileRows, 'profiles'),
    scores: mapScores(scoreRows, 'game_scores'),
  };
  const dataset = prepareDataset(raw, options.legacyScoreMode);
  let report = sourceOnlyReport(dataset, files, options);

  if (options.mode !== 'dry-run') {
    const targetVerification = await runDatabaseMode(options, dataset);
    report = { ...report, targetVerification, warnings: [] };
    if (!targetVerification.ok) throw new ValidationError('Validação do alvo falhou.', targetVerification.errors);
  }
  await writeReport(report, options.reportPath);
  printSummary(report);
  if (report.targetVerification && !report.targetVerification.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`Falha: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof ValidationError && error.errors.length > 0) {
      for (const detail of error.errors.slice(0, 20)) console.error(`- ${detail}`);
      if (error.errors.length > 20) console.error(`- ... e mais ${error.errors.length - 20} ocorrência(s).`);
    }
    process.exitCode = 1;
  });
}

export {
  canonicalJson,
  mapProfiles,
  mapScores,
  parseCsv,
  prepareDataset,
  sourceTop,
  uuidV5,
};
