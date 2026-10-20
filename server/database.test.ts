import { describe, expect, it } from 'vitest';
import { databaseName } from './database.ts';

describe('databaseName', () => {
  it('reads a plain database name', () => {
    expect(databaseName('postgresql://iq:secret@127.0.0.1:5442/iq?schema=public')).toBe('iq');
  });

  it('rejects a name that could change the statement', () => {
    expect(() => databaseName('postgresql://iq:secret@127.0.0.1:5442/iq";drop')).toThrow(/plain database name/);
  });
});
