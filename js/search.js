import { state, API, DEFAULT_RESOURCES } from './state.js';
import { apiGet, apiPost, loadCollections } from './api.js';
import { showToast, renderMarkdown, escapeHtml, levenshtein, similarity, addNotification, updateNotifBadge, toggleNotifications, clearNotifications, showModal, hideModal, confirmAction } from './utils.js';

const actionBar = document.getElementById('action-bar');
const contentGrid = document.getElementById('content-grid');
const navBtns = document.querySelectorAll('.nav-item');
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');
// To prevent issues with ES module implicit globals, we initialize them at the top of these extracted files.

// ====== Command Palette with FUZZY SEARCH ======
export function showCommandPalette() {
    showModal('🎯 快速搜索', `<input type="text" id="cmd-input" class="cmd-input" placeholder="搜索资讯、技能、MCP、资源... (支持模糊搜索)" autofocus /><div id="cmd-results" class="cmd-results"><div class="cmd-hint">输入关键词即可搜索全部模块 🔮<br>支持模糊匹配，相似结果也会出现</div></div>`);
    setTimeout(() => { const input = document.getElementById('cmd-input'); input?.focus(); input?.addEventListener('input', () => updateCmdResults(input.value)); }, 100);
}







export function updateCmdResults(query) {
    const container = document.getElementById('cmd-results'); if (!container) return;
    const q = query.toLowerCase().trim();
    if (!q) { container.innerHTML = '<div class="cmd-hint">输入关键词即可搜索全部模块 🔮<br>支持模糊匹配，相似结果也会出现</div>'; return; }
    const results = [];

    // Exact + fuzzy search across all data
    const addResult = (icon, label, sub, action, text) => {
        const ll = (label || '').toLowerCase(), tl = (text || '').toLowerCase();
        // Exact match
        if (ll.includes(q) || tl.includes(q)) {
            results.push({ icon, label, sub, action, sim: 1.0 });
            return;
        }
        // Fuzzy match via Levenshtein
        const sim = similarity(q, ll.slice(0, q.length + 5));
        if (sim >= 0.5) results.push({ icon, label, sub, action, sim });
    };

    (window._newsItems || []).forEach((item, i) => {
        addResult('🔥', item.title, item.source, () => { hideModal(); window.handleTabChange('news', `news-item-${i}`); }, item.title + ' ' + (item.description || ''));
    });
    [{ key: 'skills', icon: '⚡', tab: 'skills' }, { key: 'mcp', icon: '🛠️', tab: 'mcp' }, { key: 'news', icon: '📰', tab: 'saved-news' }].forEach(({ key, icon, tab }) => {
        (state.collections?.[key]?.items || []).forEach((item, i) => {
            addResult(icon, item.name || item.title, item.category, () => {
                hideModal();
                window.handleTabChange(tab);
                setTimeout(() => {
                    const activeList = state._displayedItems[key] || state.collections?.[key]?.items || [];
                    const dispIdx = activeList.findIndex(it => (it.name || it.title) === (item.name || item.title));
                    scrollHL(`${key}-item-${dispIdx !== -1 ? dispIdx : i}`);
                }, 400); // Increased timeout for DOM to settle
            }, (item.name || item.title || '') + ' ' + (item.description || ''));
        });
    });
    DEFAULT_RESOURCES.concat(state.collections?.resources?.items || []).forEach((res, i) => {
        addResult('📚', res.name, res.tag, () => { hideModal(); window.handleTabChange('resources'); setTimeout(() => scrollHL(`resources-item-${i}`), 400); }, res.name + ' ' + (res.description || ''));
    });

    // Sort by similarity (exact first, then fuzzy)
    results.sort((a, b) => b.sim - a.sim);

    container.innerHTML = results.length === 0 ? '<div class="cmd-hint">没有匹配 😅</div>' : results.slice(0, 15).map((r, i) => {
        const simPct = Math.round(r.sim * 100);
        const simClass = r.sim >= 0.9 ? 'high' : 'medium';
        return `<div class="cmd-item" data-i="${i}"><span class="cmd-icon">${r.icon}</span><div><div class="cmd-label">${escapeHtml(r.label || '')}</div>${r.sub ? `<div class="cmd-sub">${escapeHtml(r.sub)}</div>` : ''}</div><span class="cmd-similarity ${simClass}">${simPct}%</span></div>`;
    }).join('');
    container.querySelectorAll('.cmd-item').forEach((el, i) => el.addEventListener('click', () => results[i]?.action()));
}



export function scrollHL(id) {
    const el = document.getElementById(id);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('search-highlight');
        setTimeout(() => el.classList.remove('search-highlight'), 3500);
    }
}



export function initSearch() {
    const si = document.getElementById('global-search'); if (!si) return;
    si.addEventListener('focus', () => showCommandPalette());
}