const esbuild = require('esbuild');
const fs = require('fs');

async function build() {
  fs.mkdirSync('dist', { recursive: true });
  await esbuild.build({
    entryPoints: ['src/index.js'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: 'dist/bundle.js',
  });
  fs.copyFileSync('manifest.json', 'dist/manifest.json');
  fs.copyFileSync('src/windows-mic.ps1', 'dist/windows-mic.ps1');
  fs.copyFileSync('src/nircmd.exe', 'dist/nircmd.exe');
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
