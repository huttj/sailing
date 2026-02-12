import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const steps = [
  { name: 'parse-posts', script: 'parse-posts.js' },
  { name: 'extract-ideas', script: 'extract-ideas.js' },
  { name: 'embed-ideas', script: 'embed-ideas.js' },
  { name: 'project-2d', script: 'project-2d.js' },
];

console.log('=== Sailing data pipeline ===\n');
const totalStart = Date.now();

for (const step of steps) {
  console.log(`--- ${step.name} ---`);
  const stepStart = Date.now();

  execSync(`node ${__dirname}/${step.script}`, {
    stdio: 'inherit',
    env: process.env,
  });

  const elapsed = ((Date.now() - stepStart) / 1000).toFixed(1);
  console.log(`--- ${step.name} completed in ${elapsed}s ---\n`);
}

const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
console.log(`=== Pipeline complete in ${totalElapsed}s ===`);
