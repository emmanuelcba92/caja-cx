
const fs = require('fs');

function checkBraces(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    let braces = 0;
    let line = 1;
    let col = 1;
    let inString = null;
    let inComment = false;

    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i + 1];

        if (char === '\n') {
            line++;
            col = 1;
        } else {
            col++;
        }

        if (inComment) {
            if (char === '*' && nextChar === '/') {
                inComment = false;
                i++;
            }
            continue;
        }

        if (inString) {
            if (char === inString && content[i - 1] !== '\\') {
                inString = null;
            }
            continue;
        }

        if (char === '/' && nextChar === '*') {
            inComment = true;
            i++;
            continue;
        }

        if (char === '/' && nextChar === '/') {
            const nextNewline = content.indexOf('\n', i);
            i = nextNewline !== -1 ? nextNewline - 1 : content.length;
            continue;
        }

        if (char === '"' || char === "'" || char === '`') {
            inString = char;
            continue;
        }

        if (char === '{') braces++;
        if (char === '}') braces--;

        if (braces < 0) {
            console.log(`Unmatched closing brace at line ${line}, col ${col}`);
            return;
        }
    }

    if (braces > 0) {
        console.log(`Unmatched opening brace(s): ${braces} left open`);
    } else {
        console.log("Braces are balanced");
    }
}

checkBraces('E:\\Proyectos con IA\\Antigravity\\Caja\\frontend\\src\\components\\OrdenesView.jsx');
