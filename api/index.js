/**
 * Vercel Serverless Function version of server.cjs
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Use process.cwd() to find data.json in the project root
const DATA_FILE = path.join(process.cwd(), 'data.json');

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
    // WARNING: This will NOT work permanently on Vercel!
    // Vercel filesystem is read-only. This only writes to a temporary instance.
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
        console.log('💾 数据已保存(仅限本次实例):', DATA_FILE);
    } catch (e) {
        console.error('写入数据失败:', e.message);
    }
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
function decodeEntities(str) {
    return str
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/<[^>]*>/g, '');
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

// RSS Feeds
const ALL_FEEDS = [
    { url: 'https://36kr.com/feed', source: '36氪', lang: 'zh' },
    { url: 'https://www.ithome.com/rss/', source: 'IT之家', lang: 'zh' },
    { url: 'https://sspai.com/feed', source: '少数派', lang: 'zh' },
    { url: 'http://rss.sina.com.cn/news/marquee/ddt.xml', source: '新浪要闻', lang: 'zh' },
    { url: 'https://the-decoder.com/feed/', source: 'THE DECODER', lang: 'en' },
    { url: 'https://www.artificialintelligence-news.com/feed/rss/', source: 'AI News', lang: 'en' },
];

async function fetchAllNews() {
    const results = [];
    const promises = ALL_FEEDS.map(async (feed) => {
        try {
            const xml = await fetchUrl(feed.url);
            const items = parseRssItems(xml);
            items.forEach(item => {
                item.source = feed.source;
                item.lang = feed.lang;
            });
            return items.slice(0, 10);
        } catch (e) {
            console.warn(`RSS 获取失败 [${feed.source}]:`, e.message);
            return [];
        }
    });
    const allResults = await Promise.all(promises);
    allResults.forEach(items => results.push(...items));
    results.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    return results;
}

// Translation
const translationCache = new Map();
async function translateText(text, from = 'en', to = 'zh-CN') {
    if (!text || text.length < 3) return text;
    const cacheKey = `${from}:${to}:${text}`;
    if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);
    try {
        const encodedText = encodeURIComponent(text.slice(0, 500));
        const apiUrl = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=${from}|${to}`;
        const response = await fetchUrl(apiUrl);
        const data = JSON.parse(response);
        if (data.responseData && data.responseData.translatedText) {
            const translated = data.responseData.translatedText;
            translationCache.set(cacheKey, translated);
            return translated;
        }
    } catch (e) { console.warn('翻译失败:', e.message); }
    return text;
}

async function translateNewsItems(items) {
    const translatedItems = [];
    for (const item of items) {
        if (item.lang === 'en') {
            const [translatedTitle, translatedDesc] = await Promise.all([
                translateText(item.title),
                translateText(item.description)
            ]);
            translatedItems.push({ ...item, title: translatedTitle, titleOriginal: item.title, description: translatedDesc, descOriginal: item.description });
        } else {
            translatedItems.push(item);
        }
    }
    return translatedItems;
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); } catch (e) { resolve({}); }
        });
    });
}

// Export the handler for Vercel
module.exports = async function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const parsed = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    const pathname = parsed.pathname;

    try {
        if (pathname === '/api/news' && req.method === 'GET') {
            const data = loadData();
            res.writeHead(200);
            res.end(JSON.stringify({ items: data.cachedNews || [] }));
            return;
        }

        if (pathname === '/api/news/refresh' && req.method === 'POST') {
            // In Serverless, we can't easily do background tasks after response
            // But we'll try to do it before responding (it might time out)
            const news = await fetchAllNews();
            const translated = await translateNewsItems(news);
            const data = loadData();
            data.cachedNews = translated;
            data.lastRefresh = new Date().toISOString();
            saveData(data);
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, items: translated }));
            return;
        }

        if (pathname === '/api/translate' && req.method === 'POST') {
            const body = await parseBody(req);
            const { text, from = 'en', to = 'zh-CN' } = body;
            const translated = await translateText(text, from, to);
            res.writeHead(200);
            res.end(JSON.stringify({ translated }));
            return;
        }

        if (pathname === '/api/collections' && req.method === 'GET') {
            const data = loadData();
            res.writeHead(200);
            res.end(JSON.stringify(data));
            return;
        }

        if (pathname === '/api/collections' && req.method === 'POST') {
            const body = await parseBody(req);
            const data = loadData();
            const { action, type } = body;

            // Handle actions (add-item, delete-item, etc.) - same as server.cjs
            if (action === 'add-item') {
                const { item } = body;
                if (!data[type]) data[type] = { categories: [], items: [] };
                if (data[type].items) data[type].items.push(item);
            } else if (action === 'delete-item') {
                const { index } = body;
                if (data[type] && data[type].items && data[type].items[index]) {
                    data[type].items.splice(index, 1);
                }
            }
            // ... (other actions omitted for brevity, but could be added)

            saveData(data);
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, data }));
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not Found', path: pathname }));

    } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
    }
};
