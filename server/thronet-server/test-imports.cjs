const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// We want to replace each `import ... from ...;` with `console.log("Importing..."); import ... from ...;`
// But ES modules don't allow that. 
