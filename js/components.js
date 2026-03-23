import { state, API, DEFAULT_RESOURCES, readItems, sortStates } from './state.js';
import { enableDrag, initGlobalDrop, initRubberBand, addLongPressDrag } from './drag-drop.js';
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







export function markAsRead(key, card) { readItems[key] = true; localStorage.setItem('readItems', JSON.stringify(readItems)); card?.classList.add('read'); }


export function applySortNews(items) { 
    const m = sortStates['news'] || 'rank'; 
    const s = [...items]; 
    if (m === 'rank') s.sort((a, b) => {
        const ra = a.rank || 999;
        const rb = b.rank || 999;
        if (ra !== rb) return ra - rb;
        return new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
    });
    if (m === 'name') s.sort((a, b) => (a.title || '').localeCompare(b.title || '')); 
    if (m === 'name-desc') s.sort((a, b) => (b.title || '').localeCompare(a.title || '')); 
    if (m === 'date') s.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0)); 
    return s; 
}



export function showReadingPanel(item) { showModal('📖 ' + (item.title || ''), `<div class="reading-panel"> <div class="reading-source"><span class="tag tag-accent">${escapeHtml(item.source || '')}</span><span class="tag tag-green">${item.pubDate ? new Date(item.pubDate).toLocaleDateString('zh-CN') : ''}</span></div>${item.titleOriginal ? `<p class="reading-original">${escapeHtml(item.titleOriginal)}</p>` : ''}<div class="reading-body">${renderMarkdown(item.description || '暂无摘要')}</div><a href="${escapeHtml(item.link || '#')}" target="_blank" class="btn-submit" style="display:inline-block;text-decoration:none;text-align:center;margin-top:14px">查看原文 ↗</a></div> `); }



export function saveNewsItem(i) {
    const item = window._newsItems?.[i]; if (!item) return;
    const existing = state.collections?.news?.items || [];
    if (existing.some(e => (e.name || e.title) === item.title || (e.url && e.url === item.link))) { showToast('已收藏过', 'error'); return; }
    const cats = state.collections?.news?.categories || [];
    showModal('⭐ 收藏', `<label> 标题</label><input type="text" id="fav-title" value="${escapeHtml(item.title)}" /><label>链接</label><input type="text" id="fav-url" value="${escapeHtml(item.link)}" /><label>分类</label><div class="cat-options" id="cat-options"></div><div class="new-cat-row"><input type="text" id="new-cat-input" placeholder="新分类..." /><button id="btn-new-cat">新建</button></div><button class="btn-submit" id="btn-confirm-fav">确认收藏 ✨</button>`);
    renderCatOptions('news', cats, cats[0] || '');
    document.getElementById('btn-new-cat').addEventListener('click', () => addNewCatInModal('news'));
    document.getElementById('btn-confirm-fav').addEventListener('click', async () => { const title = document.getElementById('fav-title').value.trim(), url = document.getElementById('fav-url').value.trim(); const sel = document.querySelector('#cat-options .cat-option.selected'); if (!title) return showToast('填写标题', 'error'); await apiPost({ action: 'add-item', type: 'news', item: { name: title, url, description: `来源: ${item.source} `, category: sel ? sel.dataset.cat : '未分类' } }); hideModal(); showToast('已收藏'); });
}



export function renderCatOptions(type, cats, sel) { const c = document.getElementById('cat-options'); c.innerHTML = ''; cats.forEach(cat => { const b = document.createElement('button'); b.className = 'cat-option' + (cat === sel ? ' selected' : ''); b.textContent = cat; b.dataset.cat = cat; b.addEventListener('click', () => { c.querySelectorAll('.cat-option').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); }); c.appendChild(b); }); }


export async function addNewCatInModal(type) { const i = document.getElementById('new-cat-input'), n = i.value.trim(); if (!n) return; await apiPost({ action: 'add-category', type, category: n }); i.value = ''; renderCatOptions(type, state.collections?.[type]?.categories || [], n); showToast(`已创建「${n}」`); }







export function applySort(items, type) {
    const m = sortStates[type] || (type === 'skills' ? 'clicks' : 'default');
    if (m === 'name') items.sort((a, b) => ((a.name || '').localeCompare(b.name || '')));
    if (m === 'name-desc') items.sort((a, b) => ((b.name || '').localeCompare(a.name || '')));
    if (m === 'clicks') items.sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
    return items;
}



export function addSortSelect(type, onSort) {
    const sel = document.createElement('select'); sel.className = 'sort-select';
    let opts = [['default', '📋 默认'], ['name', '🔤 A→Z'], ['name-desc', '🔤 Z→A']];
    if (type === 'news') opts = [['rank', '📌 排名优先'], ['date', '📅 最新优先'], ['name', '🔤 A→Z'], ['name-desc', '🔤 Z→A']];
    if (type === 'skills') opts = [['clicks', '🔥 热门优先'], ['name', '🔤 A→Z'], ['name-desc', '🔤 Z→A'], ['default', '📋 默认']];
    const currVal = sortStates[type] || (type === 'skills' ? 'clicks' : type === 'news' ? 'rank' : 'default');
    sel.innerHTML = opts.map(([v, l]) => `<option value="${v}"${currVal === v ? ' selected' : ''}>${l}</option>`).join('');
    sel.addEventListener('change', () => { sortStates[type] = sel.value; onSort(); }); actionBar.appendChild(sel);
}



export function addBatchToggle(type) {
    const btn = document.createElement('button'); btn.className = 'btn' + (state.batchMode ? ' btn-danger' : '');
    btn.textContent = state.batchMode ? '❌ 取消' : '☑️ 批量';
    btn.addEventListener('click', () => {
        state.batchMode = !state.batchMode;
        state.batchSelected.clear();
        if (type === 'skills') renderSkills();
        else if (type === 'resources') renderResources();
        else renderCollection(type);
    });
    actionBar.appendChild(Object.assign(document.createElement('div'), { className: 'action-spacer' }));
    actionBar.appendChild(btn);
    if (state.batchMode) {
        // 全选
        addBtn(actionBar, '✅ 全选', 'btn', () => {
            const cards = [...document.querySelectorAll('.collection-card')];
            const allSelected = state.batchSelected.size === cards.length;
            cards.forEach((card, idx) => {
                const badge = card.querySelector('.batch-badge');
                if (allSelected) { state.batchSelected.delete(idx); card.classList.remove('batch-selected'); if (badge) badge.textContent = ''; }
                else { state.batchSelected.add(idx); card.classList.add('batch-selected'); if (badge) badge.textContent = '✓'; }
            });
        });
        // 批量移动分类
        const moveBtn = document.createElement('button'); moveBtn.className = 'btn'; moveBtn.textContent = '🗂 移动分类';
        moveBtn.addEventListener('click', () => {
            if (!state.batchSelected.size) return showToast('请先勾选', 'error');
            const cats = state.collections?.[type]?.categories || [];
            const ch = cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
            showModal('🗂 批量移动分类', `<label> 目标分类</label><select id="batch-cat">${ch}<option value="">未分类</option></select><button class="btn-submit" id="btn-confirm-batch-move">确认移动 ✨</button>`);
            setTimeout(() => {
                document.getElementById('btn-confirm-batch-move')?.addEventListener('click', async () => {
                    const targetCat = document.getElementById('batch-cat').value;
                    const targetIcon = state.ICON_MAP[targetCat] || (type === 'skills' ? '⚡' : (type === 'mcp' ? '🛠️' : '📰'));
                    const items = state.collections?.[type]?.items || [];
                    const realIndices = [...state.batchSelected]
                        .map(idx => {
                            const dispItem = state._displayedItems[type]?.[idx] || items[idx];
                            return items.findIndex(it => (it.name || it.title) === (dispItem.name || dispItem.title));
                        })
                        .filter(i => i !== -1);
                    for (const rIdx of realIndices) {
                        if (items[rIdx]) {
                            const updated = { ...items[rIdx], category: targetCat, icon: targetIcon };
                            await apiPost({ action: 'update-item', type, index: rIdx, item: updated });
                        }
                    }
                    state.batchSelected.clear(); hideModal();
                    showToast(`已移动 ${indices.length} 条到「${targetCat}」`);
                    if (type === 'skills') renderSkills(); else if (type === 'resources') renderResources(); else renderCollection(type);
                });
            }, 50);
        });
        actionBar.appendChild(moveBtn);

        if (type !== 'skills') {
            // 批量复制链接 (For MCP / Resources / Saved-News)
            const copyBtn = document.createElement('button'); copyBtn.className = 'btn'; copyBtn.textContent = '📋 批量复制链接';
            copyBtn.addEventListener('click', () => {
                if (!state.batchSelected.size) return showToast('请先勾选', 'error');
                const items = state.collections?.[type]?.items || [];
                const links = [...state.batchSelected].map(idx => {
                    const it = state._displayedItems[type]?.[idx] || items[idx];
                    return it?.url || it?.link;
                }).filter(Boolean);
                if (!links.length) return showToast('所选项目无链接', 'error');
                navigator.clipboard.writeText(links.join('\n')).then(() => showToast(`已复制 ${links.length} 条链接`));
            });
            actionBar.appendChild(copyBtn);
        }

        const delBtn = document.createElement('button'); delBtn.className = 'btn btn-danger'; delBtn.textContent = '🗑 删除已选';
        delBtn.addEventListener('click', async () => {
            if (!state.batchSelected.size) return showToast('请勾选', 'error');
            if (!await confirmAction(`删除 ${state.batchSelected.size} 条？`)) return;
            const items = state.collections?.[type]?.items || [];
            const realIndices = [...state.batchSelected]
                .map(idx => {
                    const dispItem = state._displayedItems[type]?.[idx] || items[idx];
                    return items.findIndex(it => (it.name || it.title) === (dispItem.name || dispItem.title));
                })
                .filter(i => i !== -1)
                .sort((a, b) => b - a); // sort descending to avoid shifting issues when deleting
            for (const rIdx of realIndices) {
                await apiPost({ action: 'delete-item', type, index: rIdx });
            }
            state.batchSelected.clear(); showToast(`已删除`);
            if (type === 'skills') renderSkills(); else if (type === 'resources') renderResources(); else renderCollection(type);
        });
        actionBar.appendChild(delBtn);
    }

    // Now add standard "Add" buttons at the end
    if (type === 'skills') {
        addBtn(actionBar, '➕ 添加', 'btn', () => showAddItemModal(type));
        addBtn(actionBar, '📂 新建分类', 'btn btn-ghost', () => showAddCategoryModal(type));
    } else if (type === 'mcp' || type === 'news') {
        let titleAdd = type === 'mcp' ? '添加 MCP' : '添加资讯';
        addBtn(actionBar, `➕ ${titleAdd} `, 'btn', () => showAddItemModal(type));
        addBtn(actionBar, '📂 新建分类', 'btn btn-ghost', () => showAddCategoryModal(type));
    } else if (type === 'resources') {
        addBtn(actionBar, '➕ 添加资源', 'btn', showAddResourceModal);
        addBtn(actionBar, '📂 新建文件夹', 'btn btn-ghost', () => { showModal('📂 新建文件夹', `<label> 名称</label><input type="text" id="cat-name" placeholder="名称..." /><button class="btn-submit" id="btn-confirm-cat">确认 🎉</button>`); document.getElementById('btn-confirm-cat').addEventListener('click', async () => { const n = document.getElementById('cat-name').value.trim(); if (!n) return; await apiPost({ action: 'add-category', type: 'resources', category: n }); hideModal(); showToast(`已创建`); renderResources(); }); });
    }
}



export function addBtn(p, text, cls, fn) { const b = document.createElement('button'); b.className = cls; b.textContent = text; b.addEventListener('click', fn); p.appendChild(b); }



export function createCollectionCard(item, i, type) {
    const card = document.createElement('div'); card.className = 'card collection-card'; card.id = `${type}-item-${i}`; card.dataset.category = item.category || '';
    // iOS-style batch badge (always present, shown in batch mode)
    const badge = document.createElement('div'); badge.className = 'batch-badge'; card.appendChild(badge);
    if (!state.batchMode) badge.style.display = 'none';
    if (type !== 'skills' && !state.batchMode) card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-icon, .btn-fav, .btn-copy, .batch-badge')) return;
        showViewItemModal(type, item);
    });
    const bb = document.createElement('div'); bb.className = 'card-btn-bar';
    if (type === 'skills') {
        const clickBadge = document.createElement('span');
        clickBadge.className = 'click-badge';
        clickBadge.style.cssText = 'font-size: 0.75rem; color: var(--text-lighter); margin-right: auto; line-height: 28px; padding-left: 5px; cursor: default;';
        clickBadge.textContent = '🔥 ' + (item.clicks || 0);
        bb.appendChild(clickBadge);
    }
    if (type === 'news' && item.url) {
        const cb = document.createElement('button'); cb.className = 'btn-fav btn-copy'; cb.style.background = 'var(--accent-light)'; cb.style.color = 'var(--accent)'; cb.textContent = '🔗 复制';
        cb.addEventListener('click', (e) => { e.stopPropagation(); navigator.clipboard.writeText(item.url).then(() => showToast(`已复制链接 📋`)); });
        bb.appendChild(cb);
    }
    const eb = document.createElement('button'); eb.className = 'btn-icon'; eb.textContent = '✏'; eb.addEventListener('click', (e) => { e.stopPropagation(); const realIndex = state.collections[type].items.findIndex(it => (it.name || it.title) === (item.name || item.title)); showEditItemModal(type, realIndex !== -1 ? realIndex : i, item); }); bb.appendChild(eb);
    const db = document.createElement('button'); db.className = 'btn-icon danger'; db.textContent = '✕'; db.addEventListener('click', async (e) => { e.stopPropagation(); if (!await confirmAction('删除？')) return; const realIndex = state.collections[type].items.findIndex(it => (it.name || it.title) === (item.name || item.title)); await apiPost({ action: 'delete-item', type, index: realIndex !== -1 ? realIndex : i }); showToast('已删除'); if (type === 'skills') renderSkills(); else renderCollection(type); }); bb.appendChild(db);
    card.appendChild(bb);
    const t = document.createElement('div'); t.className = 'card-title'; t.textContent = (item.icon ? item.icon + ' ' : '') + (item.name || item.title || '未命名');
    t.addEventListener('dblclick', (e) => { e.stopPropagation(); const realIndex = state.collections[type].items.findIndex(it => (it.name || it.title) === (item.name || item.title)); inlineEdit(t, item, 'name', type, realIndex !== -1 ? realIndex : i); }); card.appendChild(t);
    const d = document.createElement('p'); d.className = 'card-desc'; d.textContent = item.description || '';
    d.addEventListener('dblclick', (e) => { e.stopPropagation(); const realIndex = state.collections[type].items.findIndex(it => (it.name || it.title) === (item.name || item.title)); inlineEdit(d, item, 'description', type, realIndex !== -1 ? realIndex : i); }); card.appendChild(d);
    const ft = document.createElement('div'); ft.className = 'card-footer';
    const tag = document.createElement('span'); tag.className = 'tag tag-accent'; tag.textContent = item.category || '未分类'; ft.appendChild(tag);
    if (item.url) { try { const l = document.createElement('span'); l.style.cssText = 'font-size:0.68rem;color:var(--text-muted)'; l.textContent = new URL(item.url).hostname; ft.appendChild(l); } catch (e) { } }
    card.appendChild(ft);
    // Long-press drag to category (Procreate-style)
    addLongPressDrag(card, i, type);
    return card;
}



export function inlineEdit(el, item, field, type, index) {
    const old = item[field] || item.title || '';
    const input = document.createElement('input'); input.type = 'text'; input.value = old;
    input.style.cssText = 'width:100%;padding:4px 8px;background:var(--bg-flat);border:2px solid var(--accent);border-radius:8px;color:var(--text);font-size:inherit;font-family:inherit';
    el.replaceWith(input); input.focus(); input.select();
    const save = async () => { const v = input.value.trim(); if (v && v !== old) { item[field] = v; await apiPost({ action: 'update-item', type, index, item }); showToast('已保存'); } if (type === 'skills') renderSkills(); else renderCollection(type); };
    input.addEventListener('blur', save); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { if (type === 'skills') renderSkills(); else renderCollection(type); } });
}

// Filter row with CATEGORY DRAG sorting
export function createFilterRow(items, onFilter, showDel, type) {
    const row = document.createElement('div'); row.className = 'filter-row';
    const all = document.createElement('span'); all.className = 'pill';
    if (!state.activeFilters[type]) all.classList.add('active');
    all.textContent = '全部';
    all.addEventListener('click', () => { row.querySelectorAll('.pill').forEach(p => p.classList.remove('active')); all.classList.add('active'); state.activeFilters[type] = null; onFilter(null); }); row.appendChild(all);
    items.forEach((item, idx) => {
        const pill = document.createElement('span'); pill.className = 'pill'; pill.dataset.catIdx = idx; pill.dataset.catName = item;
        if (state.activeFilters[type] === item) pill.classList.add('active');
        pill.appendChild(document.createTextNode(item + ' '));
        if (showDel) {
            pill.draggable = true;
            // Category drag
            pill.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ catIdx: idx, type, kind: 'cat' })); pill.classList.add('dragging'); e.stopPropagation(); });
            pill.addEventListener('dragend', () => pill.classList.remove('dragging'));
            pill.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); pill.classList.add('drag-over'); });
            pill.addEventListener('dragleave', () => pill.classList.remove('drag-over'));
            pill.addEventListener('drop', async (e) => {
                e.preventDefault(); e.stopPropagation(); pill.classList.remove('drag-over');
                try {
                    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                    if (data.kind !== 'cat' || data.type !== type) return;
                    const from = data.catIdx, to = idx;
                    if (from === to) return;
                    const cats = state.collections?.[type]?.categories;
                    if (!cats) return;
                    const [moved] = cats.splice(from, 1);
                    cats.splice(to, 0, moved);
                    await apiPost({ action: 'import-section', type, data: state.collections[type] });
                    showToast('分类已重排');
                    if (type === 'skills') renderSkills(); else renderCollection(type);
                } catch (err) { }
            });
            const x = document.createElement('button'); x.className = 'delete-cat'; x.textContent = '✕';
            x.addEventListener('click', async (e) => { e.stopPropagation(); const cnt = (state.collections?.[type]?.items || []).filter(it => it.category === item).length; if (!await confirmAction(`删除「${item}」？含 ${cnt} 条`)) return; await apiPost({ action: 'delete-category', type, category: item }); if (state.activeFilters[type] === item) state.activeFilters[type] = null; showToast('已删除'); if (type === 'skills') renderSkills(); else renderCollection(type); }); pill.appendChild(x);
        }
        pill.addEventListener('click', (e) => { if (e.target.closest('.delete-cat')) return; row.querySelectorAll('.pill').forEach(p => p.classList.remove('active')); pill.classList.add('active'); state.activeFilters[type] = item; onFilter(item); }); row.appendChild(pill);
    });
    if (state.activeFilters[type]) setTimeout(() => onFilter(state.activeFilters[type]), 0);
    return row;
}





export function showViewItemModal(type, item) {
    const labels = { mcp: 'MCP 详情', resources: '资源详情', news: '收藏详情' };
    const title = labels[type] || '详情';
    const descHtml = item.description ? `<label> 描述</label> <div class="view-desc" style="white-space:pre-wrap;background:var(--bg-flat);padding:12px;border-radius:var(--radius-sm);border:1.5px solid var(--border);font-size:0.85rem;line-height:1.6;color:var(--text)">${escapeHtml(item.description)}</div>` : '';

    showModal('🔍 ' + title, `
        <label> 名称</label>
            <div style="background:var(--bg-flat);padding:10px 12px;border-radius:var(--radius-sm);border:1.5px solid var(--border);font-weight:700;margin-bottom:8px">${escapeHtml(item.name || item.title || '未命名')}</div>
        ${descHtml}
        <label>分类</label>
        <div style="display:inline-block;padding:4px 12px;background:var(--accent-light);color:var(--accent);border-radius:16px;font-size:0.75rem;font-weight:800;margin-bottom:12px">${escapeHtml(item.category || '未分类')}</div>
        ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" class="btn-submit" style="display:block;text-align:center;text-decoration:none">查看原文 ↗</a>` : ''}
    `);
}



export function showEditItemModal(type, index, item) {
    const cats = state.collections?.[type]?.categories || [];
    const ch = cats.map(c => `<option value="${escapeHtml(c)}" ${c === item.category ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
    showModal('✏️ 编辑', `<label> 名称</label><input type="text" id="edit-name" value="${escapeHtml(item.name || item.title || '')}" /><label>URL</label><input type="text" id="edit-url" value="${escapeHtml(item.url || '')}" /><label>描述</label><textarea id="edit-desc" style="overflow:hidden;resize:none">${escapeHtml(item.description || '')}</textarea><label>分类</label><select id="edit-cat">${ch}<option value="">未分类</option></select><button class="btn-submit" id="btn-confirm-edit">保存 ✨</button>`);

    const ta = document.getElementById('edit-desc');
    const adj = () => { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight) + 'px'; };
    ta.addEventListener('input', adj);
    setTimeout(adj, 10);

    document.getElementById('btn-confirm-edit').addEventListener('click', async () => {
        const n = document.getElementById('edit-name').value.trim(), u = document.getElementById('edit-url').value.trim(), d = document.getElementById('edit-desc').value.trim(), c = document.getElementById('edit-cat').value;
        if (!n) return showToast('名称', 'error');
        const icon = state.ICON_MAP[c] || item.icon || '⚡';
        await apiPost({ action: 'update-item', type, index, item: { ...item, name: n, url: u, description: d, category: c, icon } });
        hideModal(); showToast('已保存');
        if (type === 'skills') renderSkills(); else renderCollection(type);
    });
}



export function showAddItemModal(type) {
    const labels = { mcp: 'MCP', skills: 'Skill', news: '资讯' };
    const cats = state.collections?.[type]?.categories || [];
    const ch = cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    showModal(`➕ 添加${labels[type]} `, ` <label> 名称</label><input type="text" id="add-name" placeholder="名称..." /><label>URL</label><input type="text" id="add-url" placeholder="https://..." /><label>描述</label><textarea id="add-desc" placeholder="描述..." style="overflow:hidden;resize:none"></textarea><label>分类</label><select id="add-cat">${ch}<option value="">未分类</option></select><button class="btn-submit" id="btn-confirm-add">添加 ✨</button>`);

    const ta = document.getElementById('add-desc');
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; });

    document.getElementById('btn-confirm-add').addEventListener('click', async () => { const n = document.getElementById('add-name').value.trim(), u = document.getElementById('add-url').value.trim(), d = document.getElementById('add-desc').value.trim(), c = document.getElementById('add-cat').value; if (!n) return showToast('填写名称', 'error'); if (u && !u.startsWith('http')) return showToast('URL 需 http 开头', 'error'); const existing = state.collections?.[type]?.items || []; if (existing.some(e => e.name === n || (e.url && e.url === u))) { showToast('已存在', 'error'); return; } await apiPost({ action: 'add-item', type, item: { name: n, url: u, description: d, category: c } }); hideModal(); showToast('已添加'); if (type === 'skills') renderSkills(); else renderCollection(type); });
}



export function showAddCategoryModal(type) { showModal('📂 新建分类', `<label> 名称</label><input type="text" id="cat-name" placeholder="分类名..." /><button class="btn-submit" id="btn-confirm-cat">确认 🎉</button>`); document.getElementById('btn-confirm-cat').addEventListener('click', async () => { const n = document.getElementById('cat-name').value.trim(); if (!n) return; await apiPost({ action: 'add-category', type, category: n }); hideModal(); showToast(`已创建「${n}」`); if (type === 'skills') renderSkills(); else renderCollection(type); }); }




export function showEditResourceModal(i, res) { const cs = state.collections?.resources?.categories || []; const ch = cs.map(c => `<option value="${escapeHtml(c)}" ${c === (res.tag || res.category) ? 'selected' : ''}>${escapeHtml(c)}</option>`).join(''); showModal('✏️ 编辑', ` <label> 名称</label><input type="text" id="edit-res-name" value="${escapeHtml(res.name)}" /><label>URL</label><input type="text" id="edit-res-url" value="${escapeHtml(res.url)}" /><label>描述</label><textarea id="edit-res-desc">${escapeHtml(res.description)}</textarea><label>文件夹</label><select id="edit-res-tag">${ch}<option value="">未分类</option></select><button class="btn-submit" id="btn-confirm-edit-res">保存 ✨</button>`); document.getElementById('btn-confirm-edit-res').addEventListener('click', async () => { const n = document.getElementById('edit-res-name').value.trim(), u = document.getElementById('edit-res-url').value.trim(), d = document.getElementById('edit-res-desc').value.trim(), t = document.getElementById('edit-res-tag').value || '资源'; if (!n || !u) return showToast('请填写', 'error'); await apiPost({ action: 'update-item', type: 'resources', index: i, item: { name: n, url: u, description: d, tag: t, category: t } }); hideModal(); showToast('已更新'); renderResources(); }); }


export function showAddResourceModal() { const cs = state.collections?.resources?.categories || []; const ch = cs.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join(''); showModal('➕ 添加资源', ` <label> 名称</label><input type="text" id="res-name" placeholder="名称..." /><label>URL</label><input type="text" id="res-url" placeholder="https://..." /><label>描述</label><textarea id="res-desc" placeholder="描述..."></textarea><label>文件夹</label><select id="res-tag">${ch}<option value="">未分类</option></select><button class="btn-submit" id="btn-confirm-res">添加 🌟</button>`); document.getElementById('btn-confirm-res').addEventListener('click', async () => { const n = document.getElementById('res-name').value.trim(), u = document.getElementById('res-url').value.trim(), d = document.getElementById('res-desc').value.trim(), t = document.getElementById('res-tag').value || '资源'; if (!n || !u) return showToast('请填写', 'error'); if (!u.startsWith('http')) return showToast('URL 需 http', 'error'); await apiPost({ action: 'add-item', type: 'resources', item: { name: n, url: u, description: d, tag: t, category: t } }); hideModal(); showToast('已添加'); renderResources(); }); }





export function showAddLogModal() {
    showModal('📝 记录学习', `<div class="md-editor-split"><div id="journal-preview" class="md-editor-preview"><p style="color:var(--text-muted)">实时预览... ✨</p></div><textarea id="journal-input" class="md-editor-textarea" placeholder="在这里编写...\n支持 **粗体** *斜体* \`代码\` - 列表"></textarea></div> <button class="btn-submit" id="btn-save-log">保存 💾</button>`, { wide: true });
    setupLivePreview('journal-input', 'journal-preview');
    document.getElementById('btn-save-log').addEventListener('click', async () => { const c = document.getElementById('journal-input').value.trim(); if (!c) return showToast('请填写', 'error'); const entries = state.collections?.journal || []; entries.unshift({ date: new Date().toISOString(), content: c }); await apiPost({ action: 'update-journal', entries }); hideModal(); showToast('已保存'); renderJournal(); });
}


export function showEditLogModal(entry, index) {
    showModal('📝 编辑记录', `<div class="md-editor-split"><div id="journal-edit-preview" class="md-editor-preview"></div><textarea id="journal-edit-input" class="md-editor-textarea">${escapeHtml(entry.content)}</textarea></div> <button class="btn-submit" id="btn-update-log">更新 💾</button>`, { wide: true });
    setupLivePreview('journal-edit-input', 'journal-edit-preview');
    document.getElementById('btn-update-log').addEventListener('click', async () => { const c = document.getElementById('journal-edit-input').value.trim(); if (!c) return showToast('请填写', 'error'); const entries = state.collections?.journal || []; entries[index].content = c; await apiPost({ action: 'update-journal', entries }); hideModal(); showToast('已更新'); renderJournal(); });
}


export function setupLivePreview(tid, pid) { setTimeout(() => { const ta = document.getElementById(tid), pv = document.getElementById(pid); if (!ta || !pv) return; pv.innerHTML = renderMarkdown(ta.value) || '<p style="color:var(--text-muted)">实时预览... ✨</p>'; ta.addEventListener('input', () => { pv.innerHTML = renderMarkdown(ta.value) || '<p style="color:var(--text-muted)">实时预览... ✨</p>'; }); }, 50); }