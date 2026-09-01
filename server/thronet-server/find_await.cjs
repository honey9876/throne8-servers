const fs = require('fs');
const path = require('path');

function search(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'node_modules' && file !== 'dist') search(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.js')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            let inFunction = 0;
            let inClass = 0;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Extremely naive, but good enough to spot obvious top level awaits
                if (line.includes('await ') && !line.includes('//')) {
                    // Check if it's outside of a class or function
                    if (!line.match(/async .*\(|=>|function /) && !line.match(/^ *}/)) {
                        console.log(fullPath + ':' + (i + 1) + ' -> ' + line.trim());
                    }
                }
            }
        }
    }
}
search('./src');
