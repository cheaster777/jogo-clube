import { badRequest } from './errors';

export function bodyObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest('O corpo da requisição deve ser um objeto JSON.');
  }
  return value as Record<string, unknown>;
}

export function requiredString(body: Record<string, unknown>, name: string, min = 1, max = 255): string {
  const value = body[name];
  if (typeof value !== 'string') throw badRequest(`O campo ${name} é obrigatório.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw badRequest(`O campo ${name} deve ter entre ${min} e ${max} caracteres.`);
  }
  return normalized;
}

export function optionalString(body: Record<string, unknown>, name: string, max = 255): string | undefined {
  const value = body[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw badRequest(`O campo ${name} deve ser texto.`);
  const normalized = value.trim();
  if (normalized.length > max) throw badRequest(`O campo ${name} excede ${max} caracteres.`);
  return normalized || undefined;
}

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest('Informe um email válido.');
  }
  return email;
}

export function validatePassword(value: string): string {
  if (value.length < 8 || value.length > 128) {
    throw badRequest('A senha deve ter entre 8 e 128 caracteres.');
  }
  return value;
}

export function parseMatchCreate(body: Record<string, unknown>): {
  mode: 'local' | 'online';
  playerCount: number;
  playerNames: string[];
} {
  const modeValue = body.mode ?? 'local';
  if (modeValue !== 'local' && modeValue !== 'online') {
    throw badRequest('mode deve ser local ou online.');
  }

  const playerCount = body.playerCount === undefined ? 2 : Number(body.playerCount);
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 4) {
    throw badRequest('playerCount deve ser um inteiro entre 2 e 4.');
  }

  const rawNames = body.playerNames;
  if (rawNames !== undefined && (!Array.isArray(rawNames) || rawNames.length > playerCount)) {
    throw badRequest('playerNames deve ser uma lista com no máximo playerCount nomes.');
  }
  const names = Array.isArray(rawNames)
    ? rawNames.map((name, index) => {
        if (typeof name !== 'string') throw badRequest(`playerNames[${index}] deve ser texto.`);
        const normalized = name.trim();
        if (normalized.length > 80) throw badRequest(`playerNames[${index}] excede 80 caracteres.`);
        return normalized;
      })
    : [];

  return { mode: modeValue, playerCount, playerNames: names };
}

export function parseMatchCommand(body: Record<string, unknown>): {
  commandId: string;
  expectedVersion: number;
  type: 'DRAW_ACTION' | 'END_TURN';
} {
  const commandId = requiredString(body, 'command_id', 1, 128);
  const expectedVersion = Number(body.expected_version);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw badRequest('expected_version deve ser um inteiro maior ou igual a zero.');
  }
  if (body.type !== 'DRAW_ACTION' && body.type !== 'END_TURN') {
    throw badRequest('Comando de jogo não suportado.');
  }
  return { commandId, expectedVersion, type: body.type };
}

export function parsePositiveLimit(value: unknown, fallback = 50, max = 100): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw badRequest(`limit deve ser um inteiro entre 1 e ${max}.`);
  }
  return parsed;
}

export function parseOffset(value: unknown): number {
  if (value === undefined) return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw badRequest('offset deve ser um inteiro maior ou igual a zero.');
  }
  return parsed;
}

export function parseAfterVersion(value: unknown): number {
  if (value === undefined) return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw badRequest('afterVersion deve ser um inteiro maior ou igual a zero.');
  }
  return parsed;
}
