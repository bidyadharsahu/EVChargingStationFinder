const fs = require('fs');
let f = fs.readFileSync('src/app/App.tsx', 'utf8');
f = f.replace(/open24h: (true|false) \}/g, 'open24h: $1, source: "curated" }');
fs.writeFileSync('src/app/App.tsx', f);
