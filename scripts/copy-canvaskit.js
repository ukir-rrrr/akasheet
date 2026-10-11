// Copies CanvasKit's wasm (used by react-native-skia on web) into public/ so the dev server can serve it.
const fs = require('fs');
const path = require('path');

const src = require.resolve('canvaskit-wasm/bin/full/canvaskit.wasm');
const dest = path.join(__dirname, '..', 'public', 'canvaskit.wasm');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log(`copied ${path.relative(process.cwd(), src)} -> ${path.relative(process.cwd(), dest)}`);
