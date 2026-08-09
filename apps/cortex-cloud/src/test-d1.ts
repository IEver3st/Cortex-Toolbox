import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';

interface BoundStatement {
  statement: StatementSync;
  values: SQLInputValue[];
}

export function createTestD1(): { binding: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  for (const migration of [
    '0001_initial.sql',
    '0002_ai_usage_detail.sql',
    '0003_commercial_ai.sql',
  ]) {
    sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  }

  const makeStatement = (query: string, values: SQLInputValue[] = []): D1PreparedStatement => {
    const bound: BoundStatement = { statement: sqlite.prepare(query), values };
    return {
      bind: (...next: unknown[]) => makeStatement(query, next as SQLInputValue[]),
      first: <T>() =>
        Promise.resolve((bound.statement.get(...bound.values) as T | undefined) ?? null),
      run: () => {
        const result = bound.statement.run(...bound.values);
        return Promise.resolve({
          success: true,
          meta: { changes: Number(result.changes) },
          results: [],
        } as unknown as D1Result);
      },
      all: <T>() =>
        Promise.resolve({
          success: true,
          results: bound.statement.all(...bound.values) as T[],
          meta: {},
        } as D1Result<T>),
      raw: <T>() =>
        Promise.resolve(
          bound.statement.all(...bound.values).map((row) => Object.values(row)) as T[],
        ),
    } as D1PreparedStatement;
  };

  const binding = {
    prepare: makeStatement,
    batch: async (statements: D1PreparedStatement[]) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    exec: (query: string) => {
      sqlite.exec(query);
      return Promise.resolve({ count: 0, duration: 0 });
    },
    dump: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown as D1Database;

  return { binding, sqlite };
}
