import type Database from 'better-sqlite3';
import { MigrationError } from '../../migration-contract.js';

type Token = { value: string; kind: 'word' | 'identifier' | 'literal' | 'symbol' };
type Statement = { sql: string; tokens: Token[] };
const reject = () => { throw new MigrationError('SQL_NOT_ALLOWED', 'Unsupported migration SQL'); };

// A small lexical boundary, not a SQL parser. SQLite prepare remains the single-statement authority.
// In particular, breakpoints inside quoted values/identifiers or block comments are not separators.
function statements(source: string): Statement[] {
  const result: Statement[] = [];
  let tokens: Token[] = [], start = 0, i = 0;
  const finish = (end: number) => { if (tokens.length) result.push({ sql: source.slice(start, end), tokens }); tokens = []; };
  while (i < source.length) {
    const c = source[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (source.startsWith('--', i)) {
      const end = source.indexOf('\n', i);
      if (source.startsWith('--> statement-breakpoint', i) && source.slice(i + 24, end < 0 ? undefined : end).trim() === '') {
        finish(i); start = end < 0 ? source.length : end + 1;
      }
      i = end < 0 ? source.length : end + 1; continue;
    }
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2); if (end < 0) reject(); i = end + 2; continue;
    }
    if (['\'', '"', '`', '['].includes(c)) {
      const quote = c === '[' ? ']' : c;
      let value = '', closed = false; i++;
      while (i < source.length) {
        const next = source[i++]!;
        if (next !== quote) { value += next; continue; }
        if (c !== '[' && source[i] === quote) { value += quote; i++; continue; }
        closed = true; break;
      }
      if (!closed) reject();
      tokens.push({ value, kind: c === '\'' ? 'literal' : 'identifier' }); continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(source.slice(i));
    if (word) { tokens.push({ value: word[0], kind: 'word' }); i += word[0].length; continue; }
    tokens.push({ value: c, kind: 'symbol' }); i++;
  }
  finish(source.length); return result;
}
export function controlledStatements(sql: string): { sql: string; table?: string }[] {
  const result = statements(sql).map(({ sql, tokens }) => {
    const word = (at: number, value: string) => tokens[at]?.kind === 'word' && tokens[at]!.value.toUpperCase() === value;
    const identifier = (at: number) => {
      const token = tokens[at];
      if (!token || !['word', 'identifier'].includes(token.kind) || !token.value || token.value.includes('\0')) return reject();
      return token.value;
    };
    const semi = tokens.findIndex(t => t.kind === 'symbol' && t.value === ';');
    if (semi >= 0 && semi !== tokens.length - 1) reject();
    if (semi >= 0) tokens.pop();
    if (tokens.some(t => t.kind !== 'literal' && /^(recorder_migrations|sqlite_.*|load_extension)$/i.test(t.value))) reject();
    let at = 0, table: string | undefined;
    if (word(at++, 'CREATE')) {
      if (word(at, 'UNIQUE')) at++;
      const isTable = word(at, 'TABLE'), isIndex = word(at, 'INDEX');
      if (!isTable && !isIndex) reject();
      if (isTable && word(1, 'UNIQUE')) reject();
      at++;
      if (word(at, 'IF') && word(at + 1, 'NOT') && word(at + 2, 'EXISTS')) at += 3;
      identifier(at++);
      if (isIndex) { if (!word(at++, 'ON')) reject(); table = identifier(at++); }
      if (tokens[at]?.value !== '(' || tokens[at]?.kind !== 'symbol') reject();
      // Disallow CTAS/subqueries; identifiers and string contents are not interpreted as keywords.
      if (tokens.some(t => t.kind === 'word' && t.value.toUpperCase() === 'SELECT')) reject();
    } else if (word(0, 'ALTER') && word(1, 'TABLE')) {
      table = identifier(2);
      if (!word(3, 'ADD') || !word(4, 'COLUMN')) reject();
      identifier(5);
      if (!tokens[6] || tokens[6].kind !== 'word' || !/^(TEXT|INTEGER|REAL|BLOB|NUMERIC)$/i.test(tokens[6].value)) reject();
      // Deliberately nullable, ordinary columns only. No data transformation or constraint backfill.
      if (tokens.length !== 7 && !(tokens.length === 9 && word(7, 'DEFAULT') && word(8, 'NULL'))) reject();
    } else reject();
    return { sql, table };
  });
  if (!result.length) reject();
  return result;
}
export function runControlledSql(raw: Database.Database, sql: string) {
  for (const statement of controlledStatements(sql)) {
    if (statement.table) {
      const row = raw.prepare('SELECT type, sql FROM main.sqlite_schema WHERE name = ? COLLATE NOCASE').get(statement.table) as { type: string; sql: string } | undefined;
      const prefix = row?.sql ? statements(row.sql)[0]?.tokens.slice(0, 2).map(token => token.kind === 'word' ? token.value.toUpperCase() : '') : [];
      if (!row || row.type !== 'table' || prefix?.join(' ') !== 'CREATE TABLE') reject();
    }
    raw.prepare(statement.sql).run();
  }
}
