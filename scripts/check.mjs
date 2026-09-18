import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(path) : [path];
  }));
  return nested.flat();
}

const files = (await Promise.all(['src', 'scripts', 'test'].map(filesUnder)))
  .flat()
  .filter((path) => path.endsWith('.js') || path.endsWith('.mjs'));

for (const file of files) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--check', file], { stdio: 'inherit' });
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Syntax check failed: ${file}`)));
  });
}

console.log(`Syntax checked ${files.length} JavaScript files.`);

