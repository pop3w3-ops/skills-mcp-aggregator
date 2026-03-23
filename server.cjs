/**
 * server.cjs - 后端服务器 v3
 * 功能：RSS 资讯聚合(中英文源) + 服务端翻译代理 + 用户收藏数据管理
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const DATA_FILE = path.join(__dirname, 'data.json');

// ========== 数据持久化 ==========
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error('读取数据失败:', e.message);
    }
    return {
        news: { categories: ['AI 前沿', '大模型', '开源项目', '行业应用'], items: [] },
        mcp: { categories: ['数据库', '浏览器', '文件处理', '搜索', '效率工具'], items: [] },
        skills: { categories: ['编程', '写作', '数据分析', '设计', '通用'], items: [] },
        resources: { categories: ['资源站', '市场', 'GitHub', '导航站'], items: [] }
    };
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log('💾 数据已保存到', DATA_FILE);
}

// ========== HTTP 请求工具 ==========
function fetchUrl(url, maxRedirects = 3) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error('too many redirects'));
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AgenticHub/3.0' },
            timeout: 10000
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let loc = res.headers.location;
                if (loc.startsWith('/')) {
                    const u = new URL(url);
                    loc = u.protocol + '//' + u.host + loc;
                }
                fetchUrl(loc, maxRedirects - 1).then(resolve).catch(reject);
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    });
}

// ========== RSS 解析 ==========
// HTML 实体解码（处理 &lt; &gt; &amp; 等）
function decodeEntities(str) {
    return str
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/<[^>]*>/g, ''); // 解码后再去掉HTML标签
}

function parseRssItems(xml) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1];
        const title = extractCDATA(block, 'title');
        const link = (block.match(/<link>(.*?)<\/link>/) || [])[1] || '';
        const desc = extractCDATA(block, 'description');
        const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
        const cleanTitle = decodeEntities(title.replace(/<[^>]*>/g, '')).trim();
        const cleanDesc = decodeEntities(desc.replace(/<[^>]*>/g, '')).trim().slice(0, 200);
        if (cleanTitle) {
            items.push({ title: cleanTitle, link: link.trim(), description: cleanDesc, pubDate, source: '' });
        }
    }
    return items;
}

function extractCDATA(block, tag) {
    const cdataMatch = block.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'));
    if (cdataMatch) return cdataMatch[1];
    const simpleMatch = block.match(new RegExp(`<${tag}>(.*?)<\\/${tag}>`, 'i'));
    return simpleMatch ? simpleMatch[1] : '';
}

// ========== 热榜 API 获取 ==========
async function fetch36krHot() {
    try {
        const dateStr = new Date().toISOString().split('T')[0];
        const url = `https://openclaw.36krcdn.com/media/hotlist/${dateStr}/24h_hot_list.json`;
        const raw = await fetchUrl(url);
        const data = JSON.parse(raw);
        if (data && data.hot_list) {
            return data.hot_list.slice(0, 15).map((item, idx) => ({
                title: item.title,
                link: item.url,
                description: item.content ? item.content.slice(0, 150) + '...' : '',
                pubDate: item.publish_time,
                source: '36氪',
                lang: 'zh',
                isHot: true,
                rank: idx + 1,
                heat: item.hot_value ? (item.hot_value > 10000 ? (item.hot_value/10000).toFixed(1) + 'w' : item.hot_value) : null
            }));
        }
    } catch (e) { console.warn('36kr hot list error:', e.message); }
    return [];
}

async function fetchSspaiHot() {
    try {
        const url = `https://sspai.com/api/v1/article/tag/page/get?limit=15&offset=0&tag=%E7%83%AD%E6%A6%9C`; 
        const raw = await fetchUrl(url);
        const data = JSON.parse(raw);
        if (data && data.data && data.data.length > 0) {
            return data.data.map((item, idx) => ({
                title: item.title,
                link: `https://sspai.com/post/${item.id}`,
                description: item.summary ? item.summary.slice(0, 150) + '...' : '',
                pubDate: new Date(item.released_time * 1000).toISOString(),
                source: '少数派',
                lang: 'zh',
                isHot: true,
                rank: idx + 1,
                heat: item.view_count || item.like_count || null
            }));
        }
    } catch (e) { console.warn('sspai hot list error:', e.message); }
    return [];
}

async function fetchGithubTrending() {
    try {
        // Find date 7 days ago
        const d = new Date();
        d.setDate(d.getDate() - 7);
        const dateStr = d.toISOString().split('T')[0];
        const url = `https://api.github.com/search/repositories?q=created:>${dateStr}&sort=stars&order=desc`;
        const raw = await fetchUrl(url);
        const data = JSON.parse(raw);
        if (data && data.items && data.items.length > 0) {
            return data.items.slice(0, 15).map((item, idx) => ({
                title: item.full_name,
                link: item.html_url,
                description: item.description ? item.description.slice(0, 150) + '...' : '',
                pubDate: item.created_at,
                source: 'GitHub',
                lang: 'en',
                isHot: true,
                rank: idx + 1,
                heat: item.stargazers_count ? (item.stargazers_count > 1000 ? (item.stargazers_count/1000).toFixed(1) + 'k' : item.stargazers_count) : null
            }));
        }
    } catch (e) { console.warn('GitHub trending error:', e.message); }
    return [];
}

// ========== RSS 源配置 ==========
const ALL_FEEDS = [
    { url: 'https://www.ithome.com/rss/', source: 'IT之家', lang: 'zh' },
    { url: 'http://rss.sina.com.cn/news/marquee/ddt.xml', source: '新浪要闻', lang: 'zh' },
    { url: 'https://the-decoder.com/feed/', source: 'THE DECODER', lang: 'en' },
];

async function fetchAllNews() {
    const results = [];
    
    // Fetch Hot Lists
    const hot36kr = await fetch36krHot();
    const hotSspai = await fetchSspaiHot();
    const hotGithub = await fetchGithubTrending();
    results.push(...hot36kr, ...hotSspai, ...hotGithub);

    const promises = ALL_FEEDS.map(async (feed) => {
        try {
            const xml = await fetchUrl(feed.url);
            const items = parseRssItems(xml);
            items.forEach(item => {
                item.source = feed.source;
                item.lang = feed.lang;
            });
            return items.slice(0, 15);
        } catch (e) {
            console.warn(`RSS 获取失败 [${feed.source}]:`, e.message);
            return [];
        }
    });
    const allResults = await Promise.all(promises);
    allResults.forEach(items => results.push(...items));
    // 按时间排序（最新在前）
    results.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    return results;
}

// ========== 翻译代理(服务端) ==========
// 用 Google Translate (无限制免Key API)
const translationCache = new Map();

async function translateText(text, from = 'en', to = 'zh-CN') {
    if (!text || text.length < 3) return text;
    const cacheKey = `${from}:${to}:${text}`;
    if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);

    try {
        await new Promise(r => setTimeout(r, 200));
        const encodedText = encodeURIComponent(text);
        const apiUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodedText}`;
        const response = await fetchUrl(apiUrl);
        const data = JSON.parse(response);
        if (data && data[0] && data[0][0]) {
            const translated = data[0].map(x => x[0]).join('');
            translationCache.set(cacheKey, translated);
            return translated;
        }
    } catch (e) {
        console.warn('翻译失败:', e.message);
    }
    return text; // 翻译失败返回原文
}

// 批量翻译新闻条目
async function translateNewsItems(items) {
    const translatedItems = [];
    for (const item of items) {
        if (item.lang === 'en') {
            // 英文新闻 → 翻译为中文
            const translatedTitle = await translateText(item.title);
            let translatedDesc = item.description;
            if (item.description && item.description.length < 1500) {
                translatedDesc = await translateText(item.description);
            }
            translatedItems.push({
                ...item,
                title: translatedTitle,
                titleOriginal: item.title,
                description: translatedDesc,
                descOriginal: item.description
            });
        } else {
            translatedItems.push(item);
        }
    }
    return translatedItems;
}

// ========== 解析请求体 ==========
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
    });
}

// ========== 路由处理 ==========
async function handleRequest(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const parsed = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsed.pathname;

    try {
        // === 资讯接口(从缓存读取) ===
        if (pathname === '/api/news' && req.method === 'GET') {
            const data = loadData();
            const cachedNews = data.cachedNews || [];
            console.log(`📰 返回缓存新闻 ${cachedNews.length} 条`);
            res.writeHead(200);
            res.end(JSON.stringify({ items: cachedNews }));
            return;
        }

        // === 手动刷新资讯(异步抓取+翻译+写入缓存) ===
        if (pathname === '/api/news/refresh' && req.method === 'POST') {
            console.log('🔄 手动刷新资讯...');
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, message: '刷新已启动' }));
            // 异步执行，不阻塞响应
            (async () => {
                try {
                    const news = await fetchAllNews();
                    console.log(`  获取到 ${news.length} 条，开始翻译...`);
                    const translated = await translateNewsItems(news);
                    const data = loadData();
                    data.cachedNews = translated;
                    data.lastRefresh = new Date().toISOString();
                    saveData(data);
                    console.log(`✅ 资讯刷新完成: ${translated.length} 条已缓存`);
                } catch (e) {
                    console.error('❌ 资讯刷新失败:', e.message);
                }
            })();
            return;
        }

        // === 翻译代理接口 ===
        if (pathname === '/api/translate' && req.method === 'POST') {
            const body = await parseBody(req);
            const { text, from = 'en', to = 'zh-CN' } = body;
            const translated = await translateText(text, from, to);
            res.writeHead(200);
            res.end(JSON.stringify({ translated }));
            return;
        }

        // === 提取网页标题 ===
        if (pathname === '/api/fetch-title' && req.method === 'POST') {
            const { url } = await parseBody(req);
            try {
                const html = await fetchUrl(url);
                const match = html.match(/<title>([^<]*)<\/title>/i);
                const title = match ? decodeEntities(match[1]).trim() : '';
                res.writeHead(200);
                res.end(JSON.stringify({ title, url }));
            } catch (e) {
                console.warn('获取网页标题失败:', e.message);
                res.writeHead(200);
                res.end(JSON.stringify({ title: '', url }));
            }
            return;
        }

        // === 收藏数据读取 ===
        if (pathname === '/api/collections' && req.method === 'GET') {
            const data = loadData();
            // Ensure journal exists
            if (!data.journal) data.journal = [];
            res.writeHead(200);
            res.end(JSON.stringify(data));
            return;
        }

        // === 收藏数据写入 ===
        if (pathname === '/api/collections' && req.method === 'POST') {
            const body = await parseBody(req);
            const data = loadData();
            const { action, type } = body;

            if (action === 'add-item') {
                const { item } = body;
                if (!data[type]) data[type] = { categories: [], items: [] };
                if (data[type].items) {
                    data[type].items.push(item);
                }
            } else if (action === 'delete-item') {
                const { index } = body;
                if (data[type] && data[type].items && data[type].items[index]) {
                    // Item 9: Sync folder deletion for skills/mcp
                    const itemToDelete = data[type].items[index];
                    if ((type === 'skills' || type === 'mcp') && itemToDelete.path) {
                        try {
                            if (fs.existsSync(itemToDelete.path)) {
                                const path = require('path');
                                const trashDir = path.join(__dirname, '..', 'Skills', '.trash');
                                if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir, { recursive: true });
                                const dest = path.join(trashDir, path.basename(itemToDelete.path) + '_' + Date.now());
                                fs.renameSync(itemToDelete.path, dest);
                                console.log(`🗑️ 已移至回收站: ${dest}`);
                            }
                        } catch (err) {
                            console.error(`❌ 移动到回收站失败 ${itemToDelete.path}:`, err);
                        }
                    }
                    data[type].items.splice(index, 1);
                }

            } else if (action === 'update-item') {
                const { index, item } = body;
                if (data[type] && data[type].items && index >= 0 && index < data[type].items.length) {
                    data[type].items[index] = item;
                }
            } else if (action === 'increment-clicks') {
                const { index } = body;
                if (data[type] && data[type].items && index >= 0 && index < data[type].items.length) {
                    if (!data[type].items[index].clicks) data[type].items[index].clicks = 0;
                    data[type].items[index].clicks += 1;
                }
            } else if (action === 'update-journal') {
                // Special handling for the journal page
                const { entries } = body;
                data.journal = entries;
            } else if (action === 'add-category') {
                const { category } = body;
                if (data[type] && !data[type].categories.includes(category)) {
                    data[type].categories.push(category);
                }
            } else if (action === 'delete-category') {
                const { category } = body;
                if (data[type]) {
                    data[type].categories = data[type].categories.filter(c => c !== category);
                    data[type].items = data[type].items.filter(item => item.category !== category);
                }
            } else if (action === 'rename-category') {
                const { oldName, newName } = body;
                if (data[type]) {
                    data[type].categories = data[type].categories.map(c => c === oldName ? newName : c);
                    data[type].items = data[type].items.map(item => ({ ...item, category: item.category === oldName ? newName : item.category }));
                }
            } else if (action === 'import-section') {
                // P2-13: 导入数据片段
                const importData = body.data;
                if (importData) {
                    if (type === 'journal') {
                        data.journal = importData;
                    } else {
                        data[type] = importData;
                    }
                }
            }

            saveData(data);
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, data }));
            return;
        }

        // === P2+-24: Webhook 接口 ===
        if (pathname === '/api/webhook' && req.method === 'POST') {
            const body = await parseBody(req);
            const { type, item } = body;
            if (!type || !item) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: '需要 type 和 item 字段' }));
                return;
            }
            const data = loadData();
            if (!data[type]) data[type] = { categories: [], items: [] };
            if (data[type].items) data[type].items.push(item);
            saveData(data);
            console.log(`🔗 Webhook: 收到 ${type} 条目 "${item.name || item.title || ''}"`);
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: '接口不存在' }));

    } catch (err) {
        console.error('Error:', err.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
    }
}

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
    console.log(`✅ 后端服务器 v5 已启动: http://localhost:${PORT}`);
    console.log(`   GET  /api/news          - AI 资讯(缓存读取)`);
    console.log(`   POST /api/news/refresh  - 手动刷新资讯`);
    console.log(`   POST /api/translate     - 翻译代理`);
    console.log(`   GET  /api/collections   - 读取收藏`);
    console.log(`   POST /api/collections   - 管理收藏(update/import/rename)`);
    console.log(`   POST /api/webhook       - 外部推送接口`);
    console.log(`   RSS源: ${ALL_FEEDS.map(f => f.source).join(', ')}`);
    // 启动时自动做一次刷新(如果缓存为空)
    const data = loadData();
    if (!data.cachedNews || data.cachedNews.length === 0) {
        console.log('🚀 首次启动，自动刷新资讯...');
        fetchAllNews().then(news => {
            console.log(`  获取到 ${news.length} 条，开始翻译...`);
            return translateNewsItems(news).then(translated => {
                const d = loadData();
                d.cachedNews = translated;
                d.lastRefresh = new Date().toISOString();
                saveData(d);
                console.log(`✅ 首次资讯刷新完成: ${translated.length} 条已缓存`);
            });
        }).catch(e => console.error('首次刷新失败:', e.message));
    }
});
