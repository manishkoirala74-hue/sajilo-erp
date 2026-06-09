import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # We want to find:
    # setSaving(true);
    # ... any code without setSaving(false); ...
    # setSaving(false);
    # and replace with try...catch...finally.

    # Wait, some files might have multiple setSaving(true) or already have try-catch.
    if 'try {' in content and 'catch' in content:
        # Check if it has setSaving(false) in finally or after catch
        pass # Better to skip or manually check files that already have try-catch

    # A more robust approach for simple handleSave functions:
    # Find:
    # setSaving(true);
    # <statements>
    # setSaving(false);

    pattern = re.compile(
        r'(setSaving\(true\);\s*)([^{}]+?)(setSaving\(false\);)',
        re.MULTILINE | re.DOTALL
    )

    def replacer(match):
        prefix = match.group(1)
        body = match.group(2)
        suffix = match.group(3)
        
        # If body already contains try/catch, skip
        if 'try {' in body or 'catch ' in body:
            return match.group(0)

        # Indent the body
        indented_body = '\n'.join(['  ' + line if line.strip() else line for line in body.split('\n')])
        
        # Ensure we don't double replace
        return f"{prefix}try {{\n{indented_body}    }} catch (err) {{\n      toast.error(err.message || 'Error occurred while saving');\n    }} finally {{\n      {suffix}\n    }}"

    new_content, count = pattern.subn(replacer, content)
    
    if count > 0:
        # Also ensure toast is imported
        if 'toast' not in new_content and 'sonner' not in new_content:
            new_content = "import { toast } from 'sonner';\n" + new_content
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath} ({count} replacements)")

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith('.jsx'):
            process_file(os.path.join(root, file))
