// build-standalone.mjs — 모든 모듈을 하나의 HTML로 합침
//   play.html      : 더블클릭(file://) 실행용 완전한 문서
//   (옵션) --fragment <path> : <html>/<head>/<body> 없이 본문만 출력 (호스팅 래퍼용)
import fs from 'node:fs';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
const order = ['util.js', 'items.js', 'characters.js', 'scenario.js', 'maps.js', 'audio.js', 'effects.js', 'stage.js', 'player.js', 'ally.js', 'enemy.js', 'ui.js', 'touch.js', 'main.js'];

let js = `import * as THREE from '${THREE_URL}';\n`;
for (const f of order) {
  let src = fs.readFileSync(path.join(dir, f), 'utf8');
  const exports = [...src.matchAll(/^export (?:const|function|class) (\w+)/gm)].map((m) => m[1]);
  src = src.replace(/^import .*?;\s*$/gm, '').replace(/^export /gm, '');
  js += `\n// ===== ${f} =====\n`;
  if (exports.length) js += `const { ${exports.join(', ')} } = (() => {\n${src}\nreturn { ${exports.join(', ')} };\n})();\n`;
  else js += `(() => {\n${src}\n})();\n`;
}
const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');
const fonts = '<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700;800&family=Noto+Serif+KR:wght@400;600;700&display=swap" rel="stylesheet" />';
const body = `<title>竹林の夜</title>
${fonts}
<style>
html, body { margin: 0; padding: 0; height: 100%; }
${css}
</style>
<canvas id="game"></canvas>
<div id="ui"></div>
<script type="module">
${js}
</script>
`;
const full = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <link rel="icon" href="data:," />
</head>
<body>
${body}</body>
</html>
`;
fs.writeFileSync(path.join(dir, 'play.html'), full);
console.log('play.html written:', (full.length / 1024).toFixed(0), 'KB');
const fi = process.argv.indexOf('--fragment');
if (fi > 0 && process.argv[fi + 1]) {
  fs.writeFileSync(process.argv[fi + 1], body);
  console.log('fragment written:', process.argv[fi + 1]);
}
