import os
import re

dom_header = """
const actionBar = document.getElementById('action-bar');
const contentGrid = document.getElementById('content-grid');
const navBtns = document.querySelectorAll('.nav-item');
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');
// To prevent issues with ES module implicit globals, we initialize them at the top of these extracted files.
"""

files_to_patch = ["js/pages.js", "js/components.js", "js/drag-drop.js", "js/search.js"]

for filepath in files_to_patch:
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            code = f.read()
        
        # Inject right after imports
        parts = code.split("\n\n", 1)
        if len(parts) == 2:
            new_code = parts[0] + "\n" + dom_header + "\n" + parts[1]
        else:
            new_code = dom_header + "\n" + code
            
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_code)
            
print("DOM variables injected.")
