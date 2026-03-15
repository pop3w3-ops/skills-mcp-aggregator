import re

print("Starting main.js refactor...")

with open("main.js", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Identify chunks to remove
# We will just cut from "// ====== Utils ======" up to "// ====== Theme ======"
# because we extracted all of that. But wait, we need to keep the top DOM elements.

# Let's find the exact indices
utils_start = content.find("// ====== Utils ======")
theme_start = content.find("// ====== Theme ======")

if utils_start != -1 and theme_start != -1:
    content = content[:utils_start] + "\n" + content[theme_start:]

# 2. Add imports at the very beginning
imports = """import { state, API } from './js/state.js';
import { apiGet, apiPost, loadCollections } from './js/api.js';
import { showToast, renderMarkdown, escapeHtml, levenshtein, similarity, addNotification, updateNotifBadge, toggleNotifications, clearNotifications, showModal, hideModal, confirmAction } from './js/utils.js';

window.toggleNotifications = toggleNotifications;
window.clearNotifications = clearNotifications;

document.addEventListener('renderNotificationsRequest', () => {
    if(typeof renderNotifications === 'function') renderNotifications();
});

"""

# 3. We also need to remove the top declarations of variables we moved to state.
content = re.sub(r'let collections = \{.*?\};', '', content, count=1, flags=re.DOTALL)
content = re.sub(r'let notifications = .*?;', '', content, count=1, flags=re.DOTALL)
content = re.sub(r'let _displayedItems = \{\};', '', content, count=1, flags=re.DOTALL)
content = re.sub(r"const API = 'http://localhost:3001/api';", '', content, count=1, flags=re.DOTALL)
# Icon map
content = re.sub(r'const ICON_MAP = \{.*?\n\};', '', content, count=1, flags=re.DOTALL)

# Active filters
content = re.sub(r'const activeFilters = \{\};', '', content, count=1, flags=re.DOTALL)

# Batch globals
content = content.replace("let batchMode = false;", "")
content = content.replace("let batchSelected = new Set();", "")
content = content.replace("let renderVersion = 0;", "")
content = content.replace("let currentTab = 'dashboard';", "")


# 4. Now we must replace usages of these variables with state.xxx
# Using word boundaries to avoid matching partial strings
variables_to_map = [
    "collections", 
    "_displayedItems", 
    "ICON_MAP", 
    "activeFilters", 
    "batchMode", 
    "batchSelected", 
    "renderVersion", 
    "currentTab",
    "notifications"
]

for var in variables_to_map:
    content = re.sub(r'\b' + var + r'\b', f'state.{var}', content)

# But wait! If main.js has parameter names like `window.collections` we don't want to replace that.
# Actually, it's safer to just do `state.collections`. We don't have object keys named collections in the DOM.

# Write back
with open("main.js", "w", encoding="utf-8") as f:
    f.write(imports + content.lstrip())

print("main.js successfully refactored!")
