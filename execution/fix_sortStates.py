import os

# 1. state.js
with open('js/state.js', 'r', encoding='utf-8') as f:
    state_code = f.read()

if "export let sortStates" not in state_code:
    state_code += "\nexport let sortStates = {};\n"
    with open('js/state.js', 'w', encoding='utf-8') as f:
        f.write(state_code)

# 2. components.js imports sortStates
with open('js/components.js', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace("DEFAULT_RESOURCES, readItems", "DEFAULT_RESOURCES, readItems, sortStates")
with open('js/components.js', 'w', encoding='utf-8') as f:
    f.write(code)

# 3. drag-drop.js fixes currentFilter -> state.activeFilters[state.currentTab]
with open('js/drag-drop.js', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace("currentFilter", "state.activeFilters[state.currentTab]")
with open('js/drag-drop.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("Fixed state dependencies!")
