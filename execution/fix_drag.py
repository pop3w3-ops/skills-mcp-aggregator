import os
import re

print("Fixing drag-drop extraction...")

with open('main.js', 'r', encoding='utf-8') as f:
    main_code = f.read()

# Find the start of the drag logic
start_idx = main_code.find("// ====== PRO SELECTION")

if start_idx != -1:
    drag_code = main_code[start_idx:]
    main_code = main_code[:start_idx]
    
    # Export all functions
    funcs_to_export = ["initRubberBand", "_rbOnDown", "_rbOnMove", "_rbOnUp", "addLongPressDrag", "buildStackGhost", "animateCollapse"]
    for func in funcs_to_export:
        drag_code = re.sub(r'function ' + func + r'\(', f'export function {func}(', drag_code)
        
    with open('js/drag-drop.js', 'a', encoding='utf-8') as f:
        f.write("\n" + drag_code)
        
    with open('main.js', 'w', encoding='utf-8') as f:
        f.write(main_code)
        
    print("Fixed!")
else:
    print("Not found.")
