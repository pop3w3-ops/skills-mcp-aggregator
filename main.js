import { state, API } from './js/state.js';
import { apiGet, apiPost, loadCollections } from './js/api.js';
import { showToast, renderMarkdown, escapeHtml, levenshtein, similarity, addNotification, updateNotifBadge, toggleNotifications, clearNotifications, showModal, hideModal, confirmAction } from './js/utils.js';
import { renderDashboard, renderNews, renderSkills, renderCollection, renderResources, renderJournal } from './js/pages.js';
import { createCollectionCard, addBatchToggle, addBtn, createFilterRow, inlineEdit, showViewItemModal, showEditItemModal, showAddItemModal, showAddCategoryModal, showEditResourceModal, showAddResourceModal, showAddLogModal, showEditLogModal, setupLivePreview } from './js/components.js';
import { enableDrag, initGlobalDrop } from './js/drag-drop.js';
import { showCommandPalette, updateCmdResults, scrollHL, initSearch } from './js/search.js';

window.toggleNotifications = toggleNotifications;
window.clearNotifications = clearNotifications;

// Map exports to window so internal legacy calls work during transition
Object.assign(window, { renderDashboard, renderNews, renderSkills, renderCollection, renderResources, renderJournal, createCollectionCard, addBatchToggle, addBtn, createFilterRow, inlineEdit, showViewItemModal, showEditItemModal, showAddItemModal, showAddCategoryModal, showEditResourceModal, showAddResourceModal, showAddLogModal, showEditLogModal, setupLivePreview, enableDrag, initGlobalDrop, showCommandPalette, updateCmdResults, scrollHL, initSearch });

document.addEventListener('renderNotificationsRequest', () => {
    if (typeof renderNotifications === 'function') renderNotifications();
});

window.toggleNotifications = toggleNotifications;
window.clearNotifications = clearNotifications;

document.addEventListener('renderNotificationsRequest', () => {
    if (typeof renderNotifications === 'function') renderNotifications();
});

/**
 * 代理中心 v10 — 右侧栏 + 分类拖拽 + 模糊搜索
 * Changes from v9:
 * - Category pill drag-and-drop
 * - Removed dedup from add modals
 * - Cleaned dashboard (no export/import/share)
 * - Levenshtein in search (fuzzy matching with similarity %)
 * - Stronger search highlight
 * - Journal date nav dedup (each date once, navigates to latest)
 */

const contentGrid = document.getElementById('content-grid');
const actionBar = document.getElementById('action-bar');
const navBtns = document.querySelectorAll('.nav-item');
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');

let sortStates = {};
let readItems = JSON.parse(localStorage.getItem('readItems') || '{}');
// Cache of sorted items per type so long-press drag can look up real data indices

// Category → icon mapping (mirrors sync_skills.py state.ICON_MAP)


const DEFAULT_RESOURCES = [
    { name: 'MCP 服务器目录', description: 'MCP 服务器全面列表', url: 'https://mcpservers.org', tag: '资源站' },
    { name: 'MCP Market', description: 'MCP 服务器市场&排行', url: 'https://mcpmarket.com', tag: '市场' },
    { name: 'Awesome MCP Servers', description: '高质量 MCP 精选列表', url: 'https://github.com/punkpeye/awesome-mcp-servers', tag: 'GitHub' },
    { name: 'SkillsMP', description: 'Claude/Gemini 技能市场', url: 'https://skillsmp.com', tag: '市场' },
    { name: 'Awesome Agent Skills', description: '自主代理技能集合', url: 'https://github.com/heilcheng/awesome-agent-skills', tag: 'GitHub' },
    { name: 'MCP Awesome', description: 'MCP 可视化导航站', url: 'https://mcp-awesome.com', tag: '导航站' },
];


// ====== Theme ======
function initTheme() { const s = localStorage.getItem('theme') || 'light'; document.documentElement.setAttribute('data-theme', s); const b = document.getElementById('theme-toggle'); if (b) b.textContent = s === 'dark' ? '☀️' : '🌙'; }
function toggleTheme() { const c = document.documentElement.getAttribute('data-theme'); const n = c === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', n); localStorage.setItem('theme', n); const b = document.getElementById('theme-toggle'); if (b) b.textContent = n === 'dark' ? '☀️' : '🌙'; }

// ====== Tabs ======
function handleTabChange(tab) {
    state.currentTab = tab; state.renderVersion++; state.batchMode = false; state.batchSelected.clear();
    navBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    document.getElementById('sidebar')?.classList.remove('open');
    // Update topbar title
    const titles = { dashboard: '📊 总览', news: '🔥 热门资讯', mcp: '🛠️ MCP', skills: '⚡ Skills', journal: '📝 学习日记', 'saved-news': '📰 资讯收藏', resources: '📚 资源合辑' };
    const tt = document.getElementById('topbar-title'); if (tt) tt.textContent = titles[tab] || '';
    if (tab === 'dashboard') renderDashboard();
    else if (tab === 'news') renderNews();
    else if (tab === 'mcp') renderCollection('mcp');
    else if (tab === 'skills') renderSkills();
    else if (tab === 'journal') renderJournal();
    else if (tab === 'saved-news') renderCollection('news');
    else if (tab === 'resources') renderResources();
}
navBtns.forEach(btn => btn.addEventListener('click', () => handleTabChange(btn.dataset.tab)));


// ====== Keyboard ======
function initKeyboard() {
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); showCommandPalette(); return; }
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') { if (e.key === 'Escape') hideModal(); return; }
        if (e.key === 'Escape') { hideModal(); document.getElementById('notif-panel')?.classList.remove('open'); return; }
        const tm = { '1': 'dashboard', '2': 'news', '3': 'mcp', '4': 'skills', '5': 'journal', '6': 'saved-news', '7': 'resources' };
        if (tm[e.key]) handleTabChange(tm[e.key]);
        if (e.key === 'n' || e.key === 'N') { if (state.currentTab === 'journal') showAddLogModal(); else if (state.currentTab === 'resources') showAddResourceModal(); else if (state.currentTab === 'skills') showAddItemModal('skills'); else if (['mcp', 'saved-news'].includes(state.currentTab)) showAddItemModal(state.currentTab === 'saved-news' ? 'news' : state.currentTab); }
    });
}

function initAutoRefresh() { setInterval(async () => { try { await fetch(`${API} /news/refresh`, { method: 'POST' }); } catch (e) { } }, 30 * 60 * 1000); }



// ====== Init ======
async function init() {
    initTheme();
    await loadCollections();
    initKeyboard();
    initAutoRefresh();
    initSearch();
    updateNotifBadge();
    initGlobalDrop();
    handleTabChange('dashboard');

    // Fix modal close button
    const modalClose = document.getElementById('modal-close');
    if (modalClose) {
        modalClose.addEventListener('click', hideModal);
    }
}
init();

window.handleTabChange = handleTabChange;
window.toggleTheme = toggleTheme;
window.toggleNotifications = toggleNotifications;
window.clearNotifications = clearNotifications;

// ======================================================
