#!/usr/bin/env node
// Verify every package.json script that references scripts/*.ts points at a file that exists.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
const missing = Object.entries(pkg.scripts)
  .map(([name, command]) => ({ name, target: command.match(/scripts\/[\w.-]+\.ts/)?.[0] }))
  .filter(({ target }) => target && !existsSync(resolve(target)));

if (missing.length > 0) {
  console.error('package.json scripts with missing targets:');
  for (const { name, target } of missing) console.error(`  ${name} -> ${target}`);
  process.exit(1);
}
console.log('all package.json script targets exist');
