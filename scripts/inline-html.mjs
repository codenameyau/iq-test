import { readFileSync, rmSync, writeFileSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const htmlPath = new URL('index.html', dist);
const js = readFileSync(new URL('app.js', dist), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(new URL('app.css', dist), 'utf8');

let html = readFileSync(htmlPath, 'utf8');
html = html.replace(/<script\b[^>]*\bsrc="[^"]+"[^>]*>\s*<\/script>\s*/, '');
html = html.replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${css}\n</style>`);
html = html.replace('</body>', `<script>\n${js}\n</script>\n  </body>`);

if (/<script\b[^>]*\bsrc=/.test(html) || /<link\b[^>]*\bhref="(?!data:)/.test(html)) {
  throw new Error('dist/index.html still references an external file.');
}

writeFileSync(htmlPath, html);
rmSync(new URL('app.js', dist));
rmSync(new URL('app.css', dist));
console.log(`Wrote dist/index.html (${html.length} bytes)`);
