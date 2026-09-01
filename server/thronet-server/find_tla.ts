import fs from 'fs';
import path from 'path';

function search(dir: string) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'node_modules' && file !== 'dist') search(fullPath);
        } else if (fullPath.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            // If the file contains await but NO async keyword
            // This is a naive heuristic for top-level await
            if (content.includes('await ') && !content.includes('async ') && !content.includes('async(')) {
                console.log(fullPath);
            }
            
            // Check specifically for await at start of line
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('await ') && !line.includes('//')) {
                    // Check if it's inside a function by counting braces very naively
                    const prevContent = lines.slice(0, i).join('\n');
                    const openBraces = (prevContent.match(/\{/g) || []).length;
                    const closeBraces = (prevContent.match(/\}/g) || []).length;
                    if (openBraces === closeBraces) {
                        console.log(`POTENTIAL TLA in ${fullPath}:${i+1}: ${line}`);
                    }
                }
            }
        }
    }
}
search('./src/Mentorship');
