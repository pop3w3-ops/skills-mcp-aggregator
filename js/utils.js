import { state } from './state.js';

export function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
    }, 2500);
    addNotification(msg);
}

export function renderMarkdown(text) {
    if (!text) return '';
    if (typeof marked !== 'undefined') {
        const t = text.replace(/\\n/g, '\n');
        return marked.parse(t, { breaks: true, gfm: true });
    }
    return escapeHtml(text).replace(/\n/g, '<br>');
}

export function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function levenshtein(a, b) {
    if (!a || !b) return Math.max((a || '').length, (b || '').length);
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
        d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] : Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + 1);
    return d[m][n];
}

export function similarity(a, b) {
    const ml = Math.max(a.length, b.length);
    return ml === 0 ? 1 : (ml - levenshtein(a, b)) / ml;
}

export function addNotification(msg) {
    state.notifications.unshift({ msg, time: new Date().toISOString() });
    if (state.notifications.length > 50) state.notifications.pop();
    localStorage.setItem('notifications', JSON.stringify(state.notifications));
    updateNotifBadge();
}

export function updateNotifBadge() {
    const b = document.getElementById('notif-badge');
    if (!b) return;
    const u = state.notifications.filter(n => !n.read).length;
    b.textContent = u;
    b.style.display = u > 0 ? '' : 'none';
}

export function renderNotifications() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    if (state.notifications.length === 0) {
        list.innerHTML = '<div class="notif-empty">暂无通知</div>';
        return;
    }
    list.innerHTML = state.notifications.map(n => `
        <div class="notif-item ${n.read ? 'read' : ''}">
            <div class="notif-msg">${escapeHtml(n.msg)}</div>
            <div class="notif-time">${new Date(n.time).toLocaleString('zh-CN')}</div>
        </div>
    `).join('');
}

export function toggleNotifications() {
    const p = document.getElementById('notif-panel');
    p.classList.toggle('open');
    if (p.classList.contains('open')) {
        renderNotifications();
        // Mark all as read
        state.notifications.forEach(n => n.read = true);
        localStorage.setItem('notifications', JSON.stringify(state.notifications));
        updateNotifBadge();
    }
}

export function clearNotifications() {
    state.notifications = [];
    localStorage.setItem('notifications', '[]');
    updateNotifBadge();
    document.dispatchEvent(new CustomEvent('renderNotificationsRequest'));
}

export function showModal(title, html, options = {}) {
    const mt = document.getElementById('modal-title');
    const mb = document.getElementById('modal-body');
    const mo = document.getElementById('modal-overlay');
    const m = mo?.querySelector('.modal');
    
    if (mt) mt.textContent = title;
    if (mb) mb.innerHTML = html;
    
    if (m) {
        if (options.wide) m.classList.add('wide');
        else m.classList.remove('wide');
    }
    
    if (mo) mo.classList.add('show');
}

export function hideModal() {
    const mo = document.getElementById('modal-overlay');
    const m = mo?.querySelector('.modal');
    if (mo) mo.classList.remove('show');
    if (m) m.classList.remove('wide');
}

export function confirmAction(msg) {
    return new Promise(r => {
        showModal('确认', `<p style="margin-bottom:16px">${msg}</p><div style="display:flex;gap:8px"><button class="btn-submit" id="confirm-yes" style="background:linear-gradient(135deg,#e53e3e,#fc6868)">确认</button><button class="btn-submit" id="confirm-no" style="background:var(--border);color:var(--text)">取消</button></div>`);
        setTimeout(() => {
            document.getElementById('confirm-yes')?.addEventListener('click', () => { hideModal(); r(true); });
            document.getElementById('confirm-no')?.addEventListener('click', () => { hideModal(); r(false); });
        }, 50);
    });
}
