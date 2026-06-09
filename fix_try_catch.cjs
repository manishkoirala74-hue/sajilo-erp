const fs = require('fs');
const path = require('path');

function processFile(filepath) {
    let content = fs.readFileSync(filepath, 'utf8');

    // Find:
    // setSaving(true);
    // <statements>
    // setSaving(false);
    
    // We use a regex that looks for setSaving(true); followed by anything (non-greedy) not containing braces, up to setSaving(false);
    // To allow some curly braces (like if statements), we can just match anything non-greedy.
    // Wait, javascript regex dotAll: /.../s
    
    const pattern = /(setSaving\(true\);\s*)([\s\S]+?)(setSaving\(false\);)/g;
    
    let count = 0;
    const newContent = content.replace(pattern, (match, prefix, body, suffix) => {
        if (body.includes('try {') || body.includes('catch ')) {
            return match;
        }
        
        count++;
        const indentedBody = body.split('\n').map(line => line.trim() ? '  ' + line : line).join('\n');
        return `${prefix}try {\n${indentedBody}    } catch (err) {\n      toast.error(err.message || 'Error occurred while saving');\n    } finally {\n      ${suffix}\n    }`;
    });

    if (count > 0) {
        let finalContent = newContent;
        if (!finalContent.includes('toast') && !finalContent.includes('sonner')) {
            finalContent = "import { toast } from 'sonner';\n" + finalContent;
        }
        fs.writeFileSync(filepath, finalContent, 'utf8');
        console.log(`Updated ${filepath} (${count} replacements)`);
    }
}

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filepath = path.join(dir, file);
        const stat = fs.statSync(filepath);
        if (stat.isDirectory()) {
            walk(filepath);
        } else if (file.endsWith('.jsx')) {
            processFile(filepath);
        }
    }
}

walk('src');
