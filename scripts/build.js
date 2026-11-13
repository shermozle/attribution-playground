import { mkdir, copyFile, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'favicon.svg', 'styles.css', 'app.js', 'model.js', 'guide.js', 'transport.js', 'run-history.js']) {
  await copyFile(file, `dist/${file}`);
}
console.log('Static site built in dist/');
