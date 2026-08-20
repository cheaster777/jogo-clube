import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const candidates = ['database/migrations', 'supabase/migrations'];

async function exists(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function verifyDirectory(directory) {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'))
    .sort((left, right) => left.name.localeCompare(right.name));

  const versions = new Map();
  const invalid = [];

  for (const entry of entries) {
    const match = /^(\d{4,})_[a-z0-9][a-z0-9_-]*\.sql$/i.exec(entry.name);
    if (!match) {
      invalid.push(`${directory}/${entry.name}: nome deve seguir NNNN_descricao.sql`);
      continue;
    }

    const version = match[1];
    if (versions.has(version)) {
      invalid.push(`${directory}/${entry.name}: versão duplicada com ${versions.get(version)}`);
    } else {
      versions.set(version, entry.name);
    }

    const contents = await readFile(join(directory, entry.name), 'utf8');
    if (!contents.trim()) {
      invalid.push(`${directory}/${entry.name}: arquivo vazio`);
    }
  }

  if (invalid.length > 0) {
    throw new Error(invalid.join('\n'));
  }

  console.log(`Migrações verificadas: ${directory} (${entries.length} arquivo(s)).`);
}

let found = false;
for (const directory of candidates) {
  if (await exists(directory)) {
    found = true;
    await verifyDirectory(directory);
  }
}

if (!found) {
  console.log('Nenhum diretório de migrações encontrado; verificação ignorada nesta fase.');
}
