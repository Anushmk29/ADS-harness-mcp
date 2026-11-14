import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');
const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const path = join(dir, f);
  return statSync(path).isDirectory() ? walk(path) : f.endsWith('.ts') ? [path] : [];
});

describe('module boundaries', () => {
  it('the harness is ads-only: nothing imports the removed content module', () => {
    const offenders = walk(src).filter(file => /['"][^'"]*modules\/content\//.test(readFileSync(file, 'utf8'))).map(file => relative(src, file));
    expect(offenders).toEqual([]);
  });
});
