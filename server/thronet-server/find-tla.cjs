const fs = require('fs');
const path = require('path');

function searchFile(file) {
    const content = fs.readFileSync(file, 'utf-8');
    // Regex for top-level await (not perfect but good for this)
    const lines = content.split('\n');
    let insideFunction = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.match(/function.*\{/) || line.match(/=>\s*\{/)) insideFunction++;
        if (line.match(/\}/) && insideFunction > 0) insideFunction--;
        
        if (insideFunction === 0 && line.match(/(^|\s)await\s+/)) {
            if (!line.trim().startsWith('//') && !line.trim().startsWith('*')) {
                console.log(`Top-level await found in ${file}:${i + 1}: ${line.trim()}`);
            }
        }
    }
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'node_modules') walkDir(fullPath);
        } else if (fullPath.endsWith('.ts')) {
            searchFile(fullPath);
        }
    }
}

walkDir('./src');
