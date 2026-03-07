import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const composePath = resolve(__dirname, '../../docker-compose.yml');

describe('docker-compose configuration', () => {
  it('does not use the obsolete compose version field', () => {
    const composeFile = readFileSync(composePath, 'utf8');

    expect(composeFile).not.toMatch(/^\s*version\s*:/m);
  });

  it('starts tsx-based services with --import instead of --loader', () => {
    const composeFile = readFileSync(composePath, 'utf8');

    expect(composeFile).not.toContain('"--loader"');
    expect(composeFile).toContain('"--import"');
  });
});
