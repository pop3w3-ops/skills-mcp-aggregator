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

// Card drag-and-drop handled by ghost stack now
export function enableDrag(card, index, type) {
    // Native drag disabled per user request to allow custom slide-drag
    card.draggable = false;
}

// ====== GLOBAL DRAG & DROP BOOKMARK ======
export function initGlobalDrop() {
    const layer = document.createElement('div');
    layer.className = 'global-drop-layer';
    layer.innerHTML = '<div class="global-drop-layer-content">➕ 松开添加至当前分类</div>';
    document.body.appendChild(layer);

    let dragCounter = 0;

    document.addEventListener('dragenter', (e) => {
        if (!['saved-news', 'resources'].includes(state.currentTab)) return;
        if (e.dataTransfer.types.includes('application/x-moz-node') || document.querySelector('.card.being-dragged')) return;

        e.preventDefault();
        dragCounter++;
        layer.classList.add('active');
    });

    document.addEventListener('dragleave', (e) => {
        if (!['saved-news', 'resources'].includes(state.currentTab)) return;
        dragCounter--;
        if (dragCounter === 0) layer.classList.remove('active');
    });

    document.addEventListener('dragover', (e) => {
        if (!['saved-news', 'resources'].includes(state.currentTab)) return;
        e.preventDefault();
    });

    document.addEventListener('drop', async (e) => {
        if (!['saved-news', 'resources'].includes(state.currentTab)) return;
        e.preventDefault();
        dragCounter = 0;
        layer.classList.remove('active');

        if (document.querySelector('.card.being-dragged')) return;

        let url = e.dataTransfer.getData('URL') || e.dataTransfer.getData('text/uri-list');
        if (!url) {
            const text = e.dataTransfer.getData('text/plain');
            if (text && text.startsWith('http')) url = text;
        }

        if (url) {
            showToast('🔄 正在获取网页信息...');
            try {
                const res = await fetch(`${API}/fetch-title`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
                const { title } = await res.json();

                let tabName = state.currentTab === 'saved-news' ? 'news' : state.currentTab;
                let tag = state.activeFilters[state.currentTab] || (tabName === 'resources' ? '资源' : '未分类');
                if (!state.activeFilters[state.currentTab]) tag = tabName === 'resources' ? '资源' : '未分类';

                await apiPost({ action: 'add-item', type: tabName, item: { name: title || url, title: title || url, url: url, description: '', tag: tag, category: tag } });

                showToast(`✅ 已添加: ${title || url.slice(0, 20)}`);
                if (tabName === 'resources') renderResources();
                else renderCollection('news');

            } catch (err) {
                showToast(`❌ 添加失败`, 'error');
            }
        }
    });
}

// ====== PRO SELECTION: Rubber-band + Drag-to-category ===
// ======================================================

// ---- Rubber-band lasso ----
let _rbEl = null;
let _rbDragging = false;
let _rbOrigin = null;
let _rbScrollTimer = null;

export function initRubberBand(grid, type) {
    if (!_rbEl) {
        _rbEl = document.createElement('div');
        _rbEl.className = 'rubber-band-rect';
        document.body.appendChild(_rbEl);
        document.addEventListener('mousedown', _rbOnDown);
        document.addEventListener('mousemove', _rbOnMove);
        document.addEventListener('mouseup', _rbOnUp);
    }
}

export function _rbOnDown(e) {
    if (!state.batchMode) return;
    if (e.target.closest('.card, .pill, .btn, .btn-icon, select, .action-bar, .modal-overlay, .filter-row, .topbar, .sidebar, .notif-panel')) return;
    if (e.button !== 0) return;
    _rbOrigin = { x: e.clientX, y: e.clientY };
    _rbDragging = true;
    document.body.classList.add('no-selection');
    _rbEl.style.cssText = `display: block; left:${e.clientX}px; top:${e.clientY}px; width: 0; height: 0;`;
    e.preventDefault();
}

export function _rbOnMove(e) {
    if (!_rbDragging || !_rbOrigin) return;
    const x = Math.min(e.clientX, _rbOrigin.x);
    const y = Math.min(e.clientY, _rbOrigin.y);
    const w = Math.abs(e.clientX - _rbOrigin.x);
    const h = Math.abs(e.clientY - _rbOrigin.y);
    _rbEl.style.left = x + 'px';
    _rbEl.style.top = y + 'px';
    _rbEl.style.width = w + 'px';
    _rbEl.style.height = h + 'px';
    const EDGE = 50, SPEED = 12;
    clearInterval(_rbScrollTimer);
    if (e.clientY < EDGE) _rbScrollTimer = setInterval(() => window.scrollBy(0, -SPEED), 16);
    else if (e.clientY > window.innerHeight - EDGE) _rbScrollTimer = setInterval(() => window.scrollBy(0, SPEED), 16);
}

export function _rbOnUp() {
    if (!_rbDragging) return;
    _rbDragging = false;
    document.body.classList.remove('no-selection');
    clearInterval(_rbScrollTimer);
    const sr = _rbEl.getBoundingClientRect();
    _rbEl.style.display = 'none';
    if (sr.width > 8 && sr.height > 8) {
        document.querySelectorAll('#content-grid .card').forEach((card, idx) => {
            const cr = card.getBoundingClientRect();
            if (cr.left < sr.right && cr.right > sr.left && cr.top < sr.bottom && cr.bottom > sr.top) {
                const badge = card.querySelector('.batch-badge');
                if (state.batchSelected.has(idx)) {
                    state.batchSelected.delete(idx); card.classList.remove('batch-selected'); if (badge) badge.textContent = '';
                } else {
                    state.batchSelected.add(idx); card.classList.add('batch-selected'); if (badge) badge.textContent = '\u2713';
                }
            }
        });
    }
    _rbOrigin = null;
}

// ---- Mouse-slide ghost drag (Universal Sort/Categorize) ----
export function addLongPressDrag(card, cardIndex, type) {
    let lpActive = false, ghost = null, startX = 0, startY = 0;
    const MOVE_THRESHOLD = 5;

    const endDrag = () => {
        lpActive = false;
        if (ghost) { ghost.remove(); ghost = null; }
        document.querySelectorAll('.pill.drop-target, .pill.drop-hover, .card.drop-hover').forEach(p => p.classList.remove('drop-target', 'drop-hover'));
        card.classList.remove('being-dragged');
        document.body.classList.remove('no-selection');
        document.removeEventListener('pointermove', onGM);
        document.removeEventListener('pointerup', onGU);
    };

    const onGM = (e) => {
        if (!lpActive) {
            if (Math.abs(e.clientX - startX) > MOVE_THRESHOLD || Math.abs(e.clientY - startY) > MOVE_THRESHOLD) {
                lpActive = true;
                const disp = state._displayedItems[type] || [];
                const indices = state.batchMode && state.batchSelected.size > 0 ? [...state.batchSelected] : [cardIndex];
                ghost = buildStackGhost(indices, disp);
                document.body.appendChild(ghost);
                card.classList.add('being-dragged');
                document.body.classList.add('no-selection');
                document.querySelectorAll('.filter-row .pill[data-cat-name]').forEach(p => p.classList.add('drop-target'));
            } else return;
        }
        ghost.style.left = (e.clientX + 14) + 'px';
        ghost.style.top = (e.clientY - 18) + 'px';

        const el = document.elementFromPoint(e.clientX, e.clientY);
        // Categorization hover
        let overPill = el?.closest('.pill.drop-target');
        if (!overPill && el?.closest('.filter-row')) {
            let minDist = Infinity;
            document.querySelectorAll('.filter-row .pill[data-cat-name]').forEach(p => {
                const r = p.getBoundingClientRect();
                const d = Math.abs(e.clientX - (r.left + r.width / 2));
                if (d < minDist) { minDist = d; overPill = p; }
            });
        }
        document.querySelectorAll('.pill.drop-target').forEach(p => p.classList.toggle('drop-hover', p === overPill));

        // Reordering hover (only if NOT in batch mode)
        if (!state.batchMode) {
            const overCard = el?.closest('.card');
            document.querySelectorAll('#content-grid .card').forEach(c => c.classList.toggle('drop-hover', c === overCard && c !== card));
        }

        if (e.clientY < 50) window.scrollBy(0, -12);
        else if (e.clientY > window.innerHeight - 50) window.scrollBy(0, 12);
    };

    const onGU = async (e) => {
        if (!lpActive) { endDrag(); return; }
        const el = document.elementFromPoint(e.clientX, e.clientY);
        let pill = el?.closest('.pill.drop-target');
        if (!pill && el?.closest('.filter-row')) {
            // Find nearest pill in filter row
            let minDist = Infinity;
            document.querySelectorAll('.filter-row .pill[data-cat-name]').forEach(p => {
                const r = p.getBoundingClientRect();
                const d = Math.abs(e.clientX - (r.left + r.width / 2));
                if (d < minDist) { minDist = d; pill = p; }
            });
        }
        pill = pill || document.querySelector('.pill.drop-target.drop-hover');
        const targetCard = el?.closest('.card');

        if (pill) {
            // Categorize
            const tCat = pill.dataset.catName, tIcon = state.ICON_MAP[tCat] || '\u26a1';
            const disp = state._displayedItems[type] || [], src = state.collections?.[type]?.items || [];
            let dItems = state.batchMode && state.batchSelected.size > 0
                ? [...state.batchSelected].map(i => ({ ri: src.indexOf(disp[i]), itm: disp[i] })).filter(x => x.ri !== -1)
                : [{ ri: src.indexOf(disp[cardIndex]), itm: disp[cardIndex] }].filter(x => x.ri !== -1);

            if (dItems.length) {
                await animateCollapse(ghost, pill); ghost = null;
                for (const { ri, itm } of dItems) {
                    const updated = { ...itm, category: tCat, icon: tIcon };
                    if (type === 'resources') updated.tag = tCat;
                    await apiPost({ action: 'update-item', type, index: ri, item: updated });
                }
                state.batchMode = false; state.batchSelected.clear();
                showToast(`已移至「${tCat}」 ✨`);
                if (type === 'skills') renderSkills(); else if (type === 'resources') renderResources(); else renderCollection(type);
            }
        } else if (targetCard && !state.batchMode && targetCard !== card) {
            // Reorder (Single item)
            const targetIndex = parseInt(targetCard.id.split('-').pop());
            const src = state.collections?.[type]?.items || [];
            const disp = state._displayedItems[type] || [];
            const fromRi = src.indexOf(disp[cardIndex]), toRi = src.indexOf(disp[targetIndex]);
            if (fromRi !== -1 && toRi !== -1) {
                const [moved] = src.splice(fromRi, 1);
                src.splice(toRi, 0, moved);
                await apiPost({ action: 'import-section', type, data: state.collections[type] });
                showToast('已重新排列');
                if (type === 'skills') renderSkills(); else renderCollection(type);
            }
        }
        endDrag();
    };

    card.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        if (e.target.closest('.btn-icon, .btn-fav, .btn-copy, .batch-badge')) return;
        startX = e.clientX; startY = e.clientY;
        document.addEventListener('pointermove', onGM);
        document.addEventListener('pointerup', onGU);
    });
}

export function buildStackGhost(indices, displayedItems) {
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost-stack';
    const count = indices.length, layers = Math.min(count, 3);
    for (let l = layers - 1; l >= 0; l--) {
        const item = displayedItems[indices[l]] || {};
        const layer = document.createElement('div');
        layer.className = 'drag-ghost-layer';
        layer.style.transform = `rotate(${(l - Math.floor(layers / 2)) * 4}deg) translateY(${- (layers - 1 - l) * 5}px) translateX(${(layers - 1 - l) * 5}px)`;
        layer.style.zIndex = l + 1;
        layer.innerHTML = `<span>${item.icon || '\u26a1'}</span> <span>${item.name || ''}</span>`;
        ghost.appendChild(layer);
    }
    if (count > 1) {
        const b = document.createElement('div'); b.className = 'drag-ghost-count'; b.textContent = count; ghost.appendChild(b);
    }
    return ghost;
}

export function animateCollapse(ghost, pill) {
    return new Promise(r => {
        const b = pill.getBoundingClientRect();
        ghost.style.transition = 'all 0.35s cubic-bezier(0.4,0,0.2,1)';
        ghost.style.left = (b.left + b.width / 2 - 95) + 'px';
        ghost.style.top = (b.top + b.height / 2 - 22) + 'px';
        ghost.style.transform = 'scale(0.15)';
        ghost.style.opacity = '0';
        setTimeout(() => { ghost.remove(); r(); }, 380);
    });
}


