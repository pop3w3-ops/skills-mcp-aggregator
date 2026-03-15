import os
import re

print("Finalizing Module Imports & Globals...")

# 1. Add globals to state.js
with open('js/state.js', 'r', encoding='utf-8') as f:
    state_code = f.read()

if "DEFAULT_RESOURCES" not in state_code:
    state_code += """
export const DEFAULT_RESOURCES = [
    { name: 'MCP 服务器目录', description: 'MCP 服务器全面列表', url: 'https://mcpservers.org', tag: '资源站' },
    { name: 'MCP Market', description: 'MCP 服务器市场&排行', url: 'https://mcpmarket.com', tag: '市场' },
    { name: 'Awesome MCP Servers', description: '高质量 MCP 精选列表', url: 'https://github.com/punkpeye/awesome-mcp-servers', tag: 'GitHub' },
    { name: 'SkillsMP', description: 'Claude/Gemini 技能市场', url: 'https://skillsmp.com', tag: '市场' },
    { name: 'Awesome Agent Skills', description: '自主代理技能集合', url: 'https://github.com/heilcheng/awesome-agent-skills', tag: 'GitHub' },
    { name: 'MCP Awesome', description: 'MCP 可视化导航站', url: 'https://mcp-awesome.com', tag: '导航站' },
];
export let readItems = JSON.parse(localStorage.getItem('readItems') || '{}');
"""
    with open('js/state.js', 'w', encoding='utf-8') as f:
         f.write(state_code)


comps_exports = [
    "markAsRead", "applySortNews", "showReadingPanel", "saveNewsItem", 
    "renderCatOptions", "addNewCatInModal", "applySort", "addSortSelect",
    "addBatchToggle", "addBtn", "createCollectionCard", "inlineEdit", "createFilterRow",
    "showViewItemModal", "showEditItemModal", "showAddItemModal", "showAddCategoryModal",
    "showEditResourceModal", "showAddResourceModal", "showAddLogModal", "showEditLogModal",
    "setupLivePreview"
]
drag_exports = ["enableDrag", "initGlobalDrop", "initRubberBand"]

# Fix pages.js imports
with open('js/pages.js', 'r', encoding='utf-8') as f:
    pages_code = f.read()

pages_code = pages_code.replace("import * as components from './components.js';", f"import {{ {', '.join(comps_exports)} }} from './components.js';\nimport {{ {', '.join(drag_exports)} }} from './drag-drop.js';\nimport {{ DEFAULT_RESOURCES, readItems }} from './state.js';")
with open('js/pages.js', 'w', encoding='utf-8') as f:
    f.write(pages_code)

# Fix components.js imports (some might need drag or pages)
with open('js/components.js', 'r', encoding='utf-8') as f:
    comps_code = f.read()

# components use enableDrag, initRubberBand? No, mostly pages use them.
comps_code = comps_code.replace("import { state, API } from './state.js';", f"import {{ state, API, DEFAULT_RESOURCES, readItems }} from './state.js';\nimport {{ {', '.join(drag_exports)} }} from './drag-drop.js';")
# Prevent circular dependencies but export render calls via window object during refactor
with open('js/components.js', 'w', encoding='utf-8') as f:
    f.write(comps_code)

# Now, we manually append initRubberBand and friends from main.js into drag-drop.js if they are there.
with open('main.js', 'r', encoding='utf-8') as f:
    main_code = f.read()
    
rubber = main_code.find("let _rbEl = null;")
if rubber != -1:
    # We will just take everything from rubber band down to init() and move it to drag-drop.js
    end_rubber = main_code.find("// ====== Init ======")
    if end_rubber != -1:
        extracted_drag = main_code[rubber:end_rubber]
        main_code = main_code[:rubber] + main_code[end_rubber:]
        
        # We must add "export" to these functions: initRubberBand, _rbOnDown, _rbOnMove, _rbOnUp, addLongPressDrag, buildStackGhost, animateCollapse
        for func in ["initRubberBand", "_rbOnDown", "_rbOnMove", "_rbOnUp", "addLongPressDrag", "buildStackGhost", "animateCollapse"]:
            extracted_drag = re.sub(r'function ' + func + r'\(', f'export function {func}(', extracted_drag)
        
        # Append to drag-drop.js
        with open('js/drag-drop.js', 'r', encoding='utf-8') as f:
            dd_code = f.read()
            
        with open('js/drag-drop.js', 'w', encoding='utf-8') as f:
            f.write(dd_code + "\n" + extracted_drag)
        
        with open('main.js', 'w', encoding='utf-8') as f:
            f.write(main_code)

print("Done finalizing!")
