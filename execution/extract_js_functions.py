import os
import re

def extract_function(source_code, function_name):
    """
    Extracts a top-level function from JS code by counting braces.
    Returns (extracted_text, remaining_code).
    """
    # Simple search for "function name(" or "async function name("
    import re
    
    # Try to find exactly the function declaration
    pattern = r'(//[^\n]*\n)*\s*(async\s+)?function\s+' + function_name + r'\s*\('
    match = re.search(pattern, source_code)
    
    if not match:
        return "", source_code
        
    start_index = match.start()
    
    # Now find the opening brace {
    brace_start = source_code.find("{", start_index)
    if brace_start == -1:
        return "", source_code
        
    # Count braces to find the matching closing brace
    brace_count = 0
    end_index = -1
    in_string = False
    in_char = False
    in_regex = False
    escape = False
    
    for i in range(brace_start, len(source_code)):
        char = source_code[i]
        
        # Super simplified string/regex skipping to avoid false braces
        # (Assuming well-formatted JS where we don't have crazy edge cases spanning files)
        if char == '\\' and not escape:
            escape = True
            continue
            
        if not escape:
            if char == '"' and not in_char and not in_regex:
                in_string = not in_string
            elif char == "'" and not in_string and not in_regex:
                in_char = not in_char
            elif char == '`' and not in_char and not in_string and not in_regex:
                pass # Template literals can have ${} which means we SHOULD count braces inside them!
        
        escape = False
        
        if not in_string and not in_char and not in_regex:
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    end_index = i
                    break
                    
    if end_index == -1:
        return "", source_code
        
    extracted = source_code[start_index:end_index+1]
    remaining = source_code[:start_index] + source_code[end_index+1:]
    
    return extracted, remaining


def process():
    print("Starting AST-style extraction Phase 2...")
    with open("main.js", "r", encoding="utf-8") as f:
        code = f.read()
        
    # Functions for js/pages.js
    page_funcs = [
        "renderDashboard", "renderNews", "renderSkills", 
        "renderCollection", "renderResources", "renderJournal"
    ]
    
    # Functions for js/components.js
    comp_funcs = [
        "markAsRead", "applySortNews", "showReadingPanel", "saveNewsItem", 
        "renderCatOptions", "addNewCatInModal", "applySort", "addSortSelect",
        "addBatchToggle", "addBtn", "createCollectionCard", "inlineEdit", "createFilterRow",
        "showViewItemModal", "showEditItemModal", "showAddItemModal", "showAddCategoryModal",
        "showEditResourceModal", "showAddResourceModal", "showAddLogModal", "showEditLogModal",
        "setupLivePreview"
    ]
    
    # Functions for js/drag-drop.js
    drag_funcs = [
        "enableDrag", "initGlobalDrop"
    ] # initRubberBand is just inline in main.js
    
    # Functions for js/search.js
    search_funcs = [
        "showCommandPalette", "updateCmdResults", "scrollHL", "initSearch"
    ]

    extracted_pages = []
    extracted_comps = []
    extracted_drag = []
    extracted_search = []
    
    for f in page_funcs:
        text, code = extract_function(code, f)
        if text: extracted_pages.append(text)
        
    for f in comp_funcs:
        text, code = extract_function(code, f)
        if text: extracted_comps.append(text)
        
    for f in drag_funcs:
        text, code = extract_function(code, f)
        if text: extracted_drag.append(text)
        
    for f in search_funcs:
        text, code = extract_function(code, f)
        if text: extracted_search.append(text)
        
    # Write the new files
    header = "import { state, API } from './state.js';\nimport { apiGet, apiPost, loadCollections } from './api.js';\nimport { showToast, renderMarkdown, escapeHtml, levenshtein, similarity, addNotification, updateNotifBadge, toggleNotifications, clearNotifications, showModal, hideModal, confirmAction } from './utils.js';\n\n"
    
    # For cross-dependencies we would ideally import them properly. Since we are splitting, we can just export all of them.
    # To avoid circular dep hell in this automated pass, we'll prefix everything with `export `
    def make_exports(funcs_list):
        res = []
        for text in funcs_list:
            # Just regex replace the first occurrence of function or async function
            import re
            text = re.sub(r'^(.*?)(async\s+function|function)', r'\1export \2', text, count=1, flags=re.DOTALL)
            res.append(text)
        return "\n\n".join(res)
        
    with open("js/pages.js", "w", encoding="utf-8") as f:
        f.write(header + "import * as components from './components.js';\n\n" + make_exports(extracted_pages))
        
    with open("js/components.js", "w", encoding="utf-8") as f:
        f.write(header + make_exports(extracted_comps))
        
    with open("js/drag-drop.js", "w", encoding="utf-8") as f:
        f.write(header + make_exports(extracted_drag))
        
    with open("js/search.js", "w", encoding="utf-8") as f:
        f.write(header + make_exports(extracted_search))
        
    # Rewrite main.js
    main_header = """import { state, API } from './js/state.js';
import { apiGet, apiPost, loadCollections } from './js/api.js';
import { showToast, renderMarkdown, escapeHtml, levenshtein, similarity, addNotification, updateNotifBadge, toggleNotifications, clearNotifications, showModal, hideModal, confirmAction } from './js/utils.js';
import * as pages from './js/pages.js';
import * as components from './js/components.js';
import * as dragDrop from './js/drag-drop.js';
import * as search from './js/search.js';

window.toggleNotifications = toggleNotifications;
window.clearNotifications = clearNotifications;

// Map exports to window so internal legacy calls work during transition
Object.assign(window, pages);
Object.assign(window, components);
Object.assign(window, dragDrop);
Object.assign(window, search);

document.addEventListener('renderNotificationsRequest', () => {
    if(typeof renderNotifications === 'function') renderNotifications();
});
"""
    # Remove old header
    code = re.sub(r"^import.*?'.*?';\n", "", code, flags=re.MULTILINE)
    
    with open("main.js", "w", encoding="utf-8") as f:
        f.write(main_header + "\n" + code.lstrip())
        
    print("AST Extraction successful!")

if __name__ == "__main__":
    process()
