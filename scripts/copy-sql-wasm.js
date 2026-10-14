const fs = require('fs');
const path = require('path');

const src = require.resolve('sql.js/dist/sql-wasm.wasm');
const dest = path.join(__dirname, '..', 'assets', 'sql', 'sql-wasm.wasm');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log(`copied ${path.relative(process.cwd(), src)} -> ${path.relative(process.cwd(), dest)}`);
