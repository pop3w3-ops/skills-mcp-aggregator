import { state, API } from './state.js';
import { showToast } from './utils.js';

export async function apiGet(path) {
    return (await fetch(`${API}${path}`)).json();
}

export async function apiPost(body) {
    try {
        const r = await fetch(`${API}/collections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const d = await r.json();
        if (d.data) state.collections = d.data;
        return d;
    } catch (e) {
        showToast('操作失败', 'error');
        return { ok: false };
    }
}

export async function loadCollections() {
    try {
        state.collections = await apiGet('/collections');
    } catch (e) {
        state.collections = {
            news: { categories: [], items: [] },
            mcp: { categories: [], items: [] },
            skills: { categories: [], items: [] },
            resources: { categories: [], items: [] },
            journal: []
        };
    }
}
