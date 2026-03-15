import { state, API } from './state.js';
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

import { markAsRead, applySortNews, showReadingPanel, saveNewsItem, renderCatOptions, addNewCatInModal, applySort, addSortSelect, addBatchToggle, addBtn, createCollectionCard, inlineEdit, createFilterRow, showViewItemModal, showEditItemModal, showAddItemModal, showAddCategoryModal, showEditResourceModal, showAddResourceModal, showAddLogModal, showEditLogModal, setupLivePreview } from './components.js';
import { enableDrag, initGlobalDrop, initRubberBand, addLongPressDrag } from './drag-drop.js';
import { DEFAULT_RESOURCES, readItems } from './state.js';

// ====== Dashboard (cleaned - no actions) ======
export function renderDashboard() {
    actionBar.innerHTML = '';
    const nc = state.collections?.cachedNews?.length || 0, mc = state.collections?.mcp?.items?.length || 0;
    const sc = state.collections?.skills?.items?.length || 0, snc = state.collections?.news?.items?.length || 0;
    const rc = (state.collections?.resources?.items?.length || 0) + DEFAULT_RESOURCES.length, jc = state.collections?.journal?.length || 0;
    const lr = state.collections?.lastRefresh ? new Date(state.collections.lastRefresh).toLocaleString('zh-CN') : '—';
    contentGrid.innerHTML = `<div class="dashboard">
        <h2 class="dashboard-title">📊 数据总览</h2><p class="dashboard-subtitle">上次刷新: ${lr}</p>
        <div class="dashboard-grid">
            <div class="dash-card" onclick="handleTabChange('news')"><div class="dash-number">${nc}</div><div class="dash-label">🔥 热门资讯</div></div>
            <div class="dash-card" onclick="handleTabChange('mcp')"><div class="dash-number">${mc}</div><div class="dash-label">🛠️ MCP</div></div>
            <div class="dash-card" onclick="handleTabChange('skills')"><div class="dash-number">${sc}</div><div class="dash-label">⚡ Skills</div></div>
            <div class="dash-card" onclick="handleTabChange('saved-news')"><div class="dash-number">${snc}</div><div class="dash-label">📰 资讯收藏</div></div>
            <div class="dash-card" onclick="handleTabChange('resources')"><div class="dash-number">${rc}</div><div class="dash-label">📚 资源合辑</div></div>
            <div class="dash-card" onclick="handleTabChange('journal')"><div class="dash-number">${jc}</div><div class="dash-label">📝 学习日记</div></div>
        </div></div>`;
}

// ====== Hot News (batch copy links) ======
export async function renderNews() {
    const mv = state.renderVersion;
    actionBar.innerHTML = '';

    // 1. Sort
    addSortSelect('news', () => renderNews());

    // Button order starts with sort, then refresh
    const btnR = document.createElement('button'); btnR.className = 'btn'; btnR.textContent = '🔄 刷新';
    btnR.addEventListener('click', async () => { btnR.textContent = '⏳...'; btnR.disabled = true; try { await fetch(`${API}/news/refresh`, { method: 'POST' }); showToast('刷新已启动'); } catch (e) { showToast('失败', 'error'); } btnR.textContent = '🔄 刷新'; btnR.disabled = false; });
    actionBar.appendChild(btnR);

    // 2. Batch Toggle
    const batchBtn = document.createElement('button');
    batchBtn.className = 'btn' + (state.batchMode ? ' btn-danger' : '');
    batchBtn.textContent = state.batchMode ? '❌ 取消' : '☑️ 批量';
    batchBtn.addEventListener('click', () => { state.batchMode = !state.batchMode; state.batchSelected.clear(); renderNews(); });
    actionBar.appendChild(Object.assign(document.createElement('div'), { className: 'action-spacer' }));
    actionBar.appendChild(batchBtn);

    if (state.batchMode) {
        // 3. Select All
        addBtn(actionBar, '✅ 全选', 'btn', () => {
            const cards = [...document.querySelectorAll('.news-card')];
            const all = state.batchSelected.size === cards.length;
            cards.forEach((card, idx) => {
                const badge = card.querySelector('.batch-badge');
                if (all) { state.batchSelected.delete(idx); card.classList.remove('batch-selected'); if (badge) badge.textContent = ''; }
                else { state.batchSelected.add(idx); card.classList.add('batch-selected'); if (badge) badge.textContent = '✓'; }
            });
        });

        const cats = state.collections?.news?.categories || [];
        // Removed 移动分类 config for Hot News
        addBtn(actionBar, '📋 批量复制链接', 'btn', () => {
            if (!state.batchSelected.size) return showToast('请先勾选', 'error');
            const links = [...state.batchSelected].map(idx => window._newsItems[idx]?.link).filter(Boolean);
            navigator.clipboard.writeText(links.join('\n')).then(() => showToast(`已复制 ${links.length} 条链接`));
        });
        addBtn(actionBar, '⭐ 批量收藏', 'btn', async () => {
            if (!state.batchSelected.size) return showToast('请先勾选', 'error');
            const items = [...state.batchSelected].map(idx => window._newsItems[idx]).filter(Boolean);
            showModal('⭐ 批量收藏', `<label>将 ${items.length} 条收藏至：</label><div class="cat-options" id="cat-options"></div><button class="btn-submit" id="btn-confirm-batch-fav">确认收藏 ✨</button>`);
            renderCatOptions('news', cats, cats[0] || '');
            document.getElementById('btn-confirm-batch-fav').addEventListener('click', async () => {
                const sel = document.querySelector('#cat-options .cat-option.selected');
                const cat = sel ? sel.dataset.cat : '未分类';
                for (const item of items) {
                    await apiPost({ action: 'add-item', type: 'news', item: { name: item.title, url: item.link, description: `来源: ${item.source}`, category: cat } });
                }
                hideModal(); state.batchSelected.clear(); renderNews(); showToast('批量收藏成功');
            });
        });
    }

    if (state.collections?.lastRefresh) { const ts = document.createElement('span'); ts.className = 'refresh-timestamp'; ts.textContent = new Date(state.collections.lastRefresh).toLocaleString('zh-CN'); actionBar.appendChild(ts); }
    contentGrid.innerHTML = '<div class="loading-state">✨ 加载中</div>';

    try {
        const data = await apiGet('/news'); if (state.renderVersion !== mv) return;
        let items = data.items || [];
        if (!items.length) { contentGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">🌟</div><p>暂无资讯，点击刷新</p></div>'; return; }
        items = applySortNews(items); window._newsItems = items; contentGrid.innerHTML = '';
        const sources = [...new Set(items.map(it => it.source).filter(Boolean))];
        if (sources.length > 1) contentGrid.appendChild(createFilterRow(sources, s => { document.querySelectorAll('.news-card').forEach(c => c.style.display = s ? (c.dataset.source === s ? '' : 'none') : ''); }, false, 'news'));
        items.forEach((item, i) => {
            const key = `news-${item.link || item.title}`, isRead = readItems[key];
            const card = document.createElement('div'); card.className = 'card news-card' + (isRead ? ' read' : '');
            if (state.batchMode && state.batchSelected.has(i)) card.classList.add('batch-selected');
            card.id = `news-item-${i}`; card.dataset.source = item.source || '';

            const badge = document.createElement('div'); badge.className = 'batch-badge'; card.appendChild(badge);
            if (!state.batchMode) badge.style.display = 'none';
            else if (state.batchSelected.has(i)) badge.textContent = '✓';

            // Click card → Toggle selection or open reading panel
            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-fav, .btn-copy')) return;
                if (state.batchMode) {
                    const isSelected = state.batchSelected.has(i);
                    if (isSelected) { state.batchSelected.delete(i); card.classList.remove('batch-selected'); badge.textContent = ''; }
                    else { state.batchSelected.add(i); card.classList.add('batch-selected'); badge.textContent = '✓'; }
                    return;
                }
                markAsRead(key, card); showReadingPanel(item);
            });

            const src = document.createElement('span'); src.className = 'card-source'; src.textContent = item.source; card.appendChild(src);
            const t = document.createElement('div'); t.className = 'card-title'; t.textContent = item.title;
            t.style.cursor = 'pointer';
            card.appendChild(t);
            if (item.description) { const d = document.createElement('p'); d.className = 'card-desc'; d.textContent = item.description; card.appendChild(d); }

            // Abstract the footer completely with the new button group
            const ft = document.createElement('div'); ft.className = 'card-footer';
            const leftFt = document.createElement('div'); leftFt.style.display = 'flex'; leftFt.style.gap = '5px';
            const dt = document.createElement('span'); dt.className = 'tag tag-accent'; dt.textContent = item.pubDate ? new Date(item.pubDate).toLocaleDateString('zh-CN') : '最新'; leftFt.appendChild(dt);
            if (item.lang === 'en') { const lt = document.createElement('span'); lt.className = 'tag tag-green'; lt.textContent = '已翻译'; leftFt.appendChild(lt); }
            if (isRead) { const rt = document.createElement('span'); rt.className = 'tag tag-blue'; rt.textContent = '已读'; leftFt.appendChild(rt); }
            ft.appendChild(leftFt);

            const btnBar = document.createElement('div'); btnBar.className = 'card-btn-bar';
            if (item.link) {
                const cp = document.createElement('button'); cp.className = 'btn-fav'; cp.style.background = 'var(--accent-light)'; cp.style.color = 'var(--accent)'; cp.textContent = '🔗 复制';
                cp.addEventListener('click', (e) => { e.stopPropagation(); navigator.clipboard.writeText(item.link).then(() => showToast(`已复制链接 📋`)); markAsRead(key, card); });
                btnBar.appendChild(cp);
            }
            const fv = document.createElement('button'); fv.className = 'btn-fav'; fv.textContent = '⭐ 收藏'; fv.addEventListener('click', (e) => { e.stopPropagation(); saveNewsItem(i); }); btnBar.appendChild(fv);
            card.appendChild(btnBar);

            card.appendChild(ft); contentGrid.appendChild(card);
        });
        state._displayedItems['news'] = items;
        initRubberBand(contentGrid, 'news');
    } catch (e) { if (state.renderVersion !== mv) return; contentGrid.innerHTML = '<div class="error-state">❌ 加载失败</div>'; }
}



export function renderSkills() {
    const type = 'skills', td = state.collections?.[type] || { categories: [], items: [] };
    actionBar.innerHTML = ''; addSortSelect(type, () => renderSkills()); addBatchToggle(type);
    let items = applySort([...(td.items || [])], type);
    contentGrid.innerHTML = '';
    if (state.batchMode) contentGrid.classList.add('batch-mode'); else contentGrid.classList.remove('batch-mode');
    if (!items.length) { contentGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">⚡</div><p>暂无 Skill</p></div>'; return; }
    if (td.categories?.length) contentGrid.appendChild(createFilterRow(td.categories, cat => { document.querySelectorAll('.collection-card').forEach(c => c.style.display = cat ? (c.dataset.category === cat ? '' : 'none') : ''); }, true, type));
    items.forEach((item, i) => {
        const card = createCollectionCard(item, i, type);
        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-icon')) return;
            if (state.batchMode) {
                // iOS-style tap to select
                const isSelected = state.batchSelected.has(i);
                if (isSelected) { state.batchSelected.delete(i); card.classList.remove('batch-selected'); card.querySelector('.batch-badge').textContent = ''; }
                else { state.batchSelected.add(i); card.classList.add('batch-selected'); card.querySelector('.batch-badge').textContent = '✓'; }
                return;
            }
            const fn = item.path ? item.path.split(/[/\\]/).pop() : (item.name || '').replace(/\s+/g, '-').toLowerCase();
            navigator.clipboard.writeText(`@${fn} `).then(() => showToast(`已复制 @${fn} 📋`));
            if (!item.clicks) item.clicks = 0;
            item.clicks += 1;
            const realIndex = state.collections[type].items.findIndex(it => (it.name || it.title) === (item.name || item.title));
            if (realIndex !== -1) apiPost({ action: 'increment-clicks', type: 'skills', index: realIndex });
            renderSkills();
        });
        card.style.cursor = state.batchMode ? 'pointer' : 'copy';
        enableDrag(card, i, type);
        contentGrid.appendChild(card);
    });
    // Record displayed order so drag can resolve real indices
    state._displayedItems['skills'] = items;
    // Init rubber-band lasso on the grid
    initRubberBand(contentGrid, type);
}

// ====== Collections (MCP / 资讯收藏) ======
export function renderCollection(type) {
    const labels = { mcp: 'MCP', news: '资讯' };
    const td = state.collections?.[type] || { categories: [], items: [] };
    actionBar.innerHTML = ''; addSortSelect(type, () => renderCollection(type));
    addBatchToggle(type);

    let items = applySort([...(td.items || [])], type);
    contentGrid.innerHTML = '';
    if (state.batchMode) contentGrid.classList.add('batch-mode'); else contentGrid.classList.remove('batch-mode');
    if (!items.length) { contentGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">✨</div><p>暂无${labels[type]}</p></div>`; return; }
    if (td.categories?.length) contentGrid.appendChild(createFilterRow(td.categories, cat => { document.querySelectorAll('.collection-card').forEach(c => c.style.display = cat ? (c.dataset.category === cat ? '' : 'none') : ''); }, true, type));
    items.forEach((item, i) => {
        const card = createCollectionCard(item, i, type);
        if (state.batchMode) {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-icon')) return;
                const isSelected = state.batchSelected.has(i);
                if (isSelected) { state.batchSelected.delete(i); card.classList.remove('batch-selected'); card.querySelector('.batch-badge').textContent = ''; }
                else { state.batchSelected.add(i); card.classList.add('batch-selected'); card.querySelector('.batch-badge').textContent = '✓'; }
            });
        }
        enableDrag(card, i, type);
        contentGrid.appendChild(card);
    });
    state._displayedItems[type] = items;
    initRubberBand(contentGrid, type);
}

// ====== Resources ======
export function renderResources() {
    const type = 'resources';
    actionBar.innerHTML = '';
    addBatchToggle(type);
    const rd = state.collections?.resources || { categories: [], items: [] }, ui = rd.items || [], all = [...DEFAULT_RESOURCES, ...ui];
    contentGrid.innerHTML = '';
    const tags = [...new Set([...(rd.categories || []), ...all.map(r => r.tag || r.category || '').filter(Boolean)])];
    if (tags.length) contentGrid.appendChild(createFilterRow(tags, tag => { document.querySelectorAll('.resource-card').forEach(c => c.style.display = tag ? (c.dataset.tag === tag ? '' : 'none') : ''); }, false, 'resources'));
    all.forEach((res, i) => {
        const isUser = i >= DEFAULT_RESOURCES.length;
        const card = document.createElement('div'); card.className = 'card resource-card collection-card';
        card.id = `resources-item-${i}`;
        card.dataset.tag = res.tag || res.category || '';
        // Selection badge for resources
        const badge = document.createElement('div'); badge.className = 'batch-badge'; card.appendChild(badge);
        if (!state.batchMode) badge.style.display = 'none';
        else if (state.batchSelected.has(i)) { card.classList.add('batch-selected'); badge.textContent = '✓'; }

        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-icon')) return;
            if (state.batchMode) {
                const isSelected = state.batchSelected.has(i);
                if (isSelected) { state.batchSelected.delete(i); card.classList.remove('batch-selected'); badge.textContent = ''; }
                else { state.batchSelected.add(i); card.classList.add('batch-selected'); badge.textContent = '✓'; }
                return;
            }
            if (isUser) showViewItemModal('resources', res);
            else window.open(res.url, '_blank');
        });
        if (isUser) {
            const bb = document.createElement('div'); bb.className = 'card-btn-bar';
            const eb = document.createElement('button'); eb.className = 'btn-icon'; eb.textContent = '✏'; eb.addEventListener('click', (e) => { e.stopPropagation(); const rIdx = state.collections['resources'].items.findIndex(it => (it.name || it.title) === res.name); showEditResourceModal(rIdx !== -1 ? rIdx : i - DEFAULT_RESOURCES.length, res); });
            bb.appendChild(eb);
            const db = document.createElement('button'); db.className = 'btn-icon danger'; db.textContent = '✕'; db.addEventListener('click', async (e) => { e.stopPropagation(); if (!await confirmAction('删除？')) return; const rIdx = state.collections['resources'].items.findIndex(it => (it.name || it.title) === res.name); await apiPost({ action: 'delete-item', type: 'resources', index: rIdx !== -1 ? rIdx : i - DEFAULT_RESOURCES.length }); showToast('已删除'); renderResources(); });
            bb.appendChild(db);
            card.appendChild(bb);
        }
        const t = document.createElement('div'); t.className = 'card-title'; t.textContent = res.name; card.appendChild(t);
        const d = document.createElement('p'); d.className = 'card-desc'; d.textContent = res.description; card.appendChild(d);
        const ft = document.createElement('div'); ft.className = 'card-footer';
        if (!isUser) { const st = document.createElement('span'); st.className = 'tag tag-system'; st.textContent = '系统内置'; ft.appendChild(st); }
        const tc = ['tag-accent', 'tag-green', 'tag-pink']; const tg = document.createElement('span'); tg.className = 'tag ' + tc[i % 3]; tg.textContent = res.tag || res.category || '资源'; ft.appendChild(tg);
        card.appendChild(ft);
        addLongPressDrag(card, i, type);
        contentGrid.appendChild(card);
    });
    state._displayedItems[type] = all;
    initRubberBand(contentGrid, type);
}

// ====== 学习日记 (deduped date nav) ======
export function renderJournal() {
    actionBar.innerHTML = '';
    actionBar.appendChild(Object.assign(document.createElement('div'), { className: 'action-spacer' }));
    addBtn(actionBar, '✍️ 记录今日', 'btn btn-primary', showAddLogModal);
    const entries = state.collections?.journal || [];
    contentGrid.innerHTML = '';
    if (!entries.length) { contentGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><p>还没有学习记录</p></div>'; return; }
    const wrapper = document.createElement('div'); wrapper.className = 'journal-layout';
    const nav = document.createElement('div'); nav.className = 'journal-nav';
    const navTitle = document.createElement('div'); navTitle.className = 'journal-nav-title'; navTitle.textContent = '📅 日期导航'; nav.appendChild(navTitle);
    const sorted = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Dedup dates: each date only once, click navigates to first (latest) entry for that date
    const seenDates = new Set();
    sorted.forEach((entry, i) => {
        const dateStr = new Date(entry.date).toLocaleDateString('zh-CN');
        if (seenDates.has(dateStr)) return;
        seenDates.add(dateStr);
        const ni = document.createElement('div'); ni.className = 'journal-nav-item'; ni.textContent = dateStr;
        ni.addEventListener('click', () => {
            const t = document.getElementById(`journal-entry-${i}`);
            if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.querySelector('.journal-card')?.classList.add('journal-highlight'); setTimeout(() => t.querySelector('.journal-card')?.classList.remove('journal-highlight'), 2000); }
        });
        nav.appendChild(ni);
    });

    const timeline = document.createElement('div'); timeline.className = 'timeline';
    sorted.forEach((entry, idx) => {
        const e = document.createElement('div'); e.className = 'journal-entry'; e.id = `journal-entry-${idx}`;
        e.appendChild(Object.assign(document.createElement('div'), { className: 'journal-dot' }));
        const cd = document.createElement('div'); cd.className = 'journal-card';
        cd.appendChild(Object.assign(document.createElement('div'), { className: 'journal-date', textContent: new Date(entry.date).toLocaleString('zh-CN') }));
        const ct = document.createElement('div'); ct.className = 'journal-content'; ct.innerHTML = renderMarkdown(entry.content); cd.appendChild(ct);
        const ac = document.createElement('div'); ac.className = 'journal-actions';
        const eb = document.createElement('button'); eb.className = 'btn-journal'; eb.textContent = '✏️ 编辑'; eb.addEventListener('click', () => showEditLogModal(entry, idx)); ac.appendChild(eb);
        const db = document.createElement('button'); db.className = 'btn-journal'; db.style.color = '#e53e3e'; db.textContent = '🗑 删除'; db.addEventListener('click', async () => { if (!await confirmAction('删除？')) return; entries.splice(idx, 1); await apiPost({ action: 'update-journal', entries }); showToast('已删除'); renderJournal(); }); ac.appendChild(db);
        cd.appendChild(ac); e.appendChild(cd); timeline.appendChild(e);
    });
    wrapper.appendChild(nav); wrapper.appendChild(timeline); contentGrid.appendChild(wrapper);
}