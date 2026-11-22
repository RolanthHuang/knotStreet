import * as esbuild from 'esbuild';
import fs from 'fs';
const minify = !process.argv.includes('--dev');
const gallery = process.argv.includes('--gallery');
const island = process.argv.includes('--island');
const r = await esbuild.build({
  entryPoints: [gallery ? 'src/gallery_main.js' : island ? 'src/main.js' : 'src/knot_main.js'], bundle: true, format: 'iife', minify, write: false, target: 'es2020',
  legalComments: 'none', logLevel: 'warning',
});
let js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>乾淨的神經 · 紐結環 Neural Knot</title></head><body><script>${js}</script></body></html>`;
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync(gallery ? 'dist/gallery.html' : island ? 'dist/island.html' : 'dist/index.html', html);
console.log('built', gallery ? 'gallery' : 'index', (html.length / 1024).toFixed(0) + ' KB');
