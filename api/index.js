/**
 * Vercel Serverless Function version of server.cjs (ESM Version)
 */
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';

import { kv } from '@vercel/kv';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const DATA_FILE = path.join(process.cwd(), 'data.json');
const KV_KEY = 'app_collections_data';

// ========== 数据持久化 (Vercel KV 版) ==========
async function loadData() {
    try {
        // 优先从 KV 数据库读取
        const data = await kv.get(KV_KEY);
        if (data) return data;

        // 如果 KV 为空，尝试从项目根目录的 data.json 初始化（迁移逻辑）
        if (fs.existsSync(DATA_FILE)) {
            const fileData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
            await kv.set(KV_KEY, fileData);
            console.log('🌱 已从 data.json 完成数据库初始化');
            return fileData;
        }
    } catch (e) {
        console.error('数据库读取失败:', e.message);
    }
    return {
        news: { categories: ['AI 前沿', '大模型', '开源项目', '行业应用'], items: [] },
        mcp: { categories: ['数据库', '浏览器', '文件处理', '搜索', '效率工具'], items: [] },
        skills: { categories: ['编程', '写作', '数据分析', '设计', '通用'], items: [] },
        resources: { categories: ['资源站', '市场', 'GitHub', '导航站'], items: [] }
    };
}

async function saveData(data) {
    try {
        await kv.set(KV_KEY, data);
        console.log('✅ 数据已保存至 Vercel KV');
    } catch (e) {
        console.error('数据库写入失败:', e.message);
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
        const title = (block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
        const link = (block.match(/<link>(.*?)<\/link>/) || [])[1] || '';
        const desc = (block.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || '';
        const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
        const cleanTitle = decodeEntities(title.replace(/<[^>]*>/g, '')).trim();
        const cleanDesc = decodeEntities(desc.replace(/<[^>]*>/g, '')).trim().slice(0, 200);
        if (cleanTitle) {
            items.push({ title: cleanTitle, link: link.trim(), description: cleanDesc, pubDate, source: '' });
        }
    }
    return items;
}

// Feeds
const ALL_FEEDS = [
    { url: 'https://36kr.com/feed', source: '36氪', lang: 'zh' },
    { url: 'https://www.ithome.com/rss/', source: 'IT之家', lang: 'zh' },
    { url: 'https://sspai.com/feed', source: '少数派', lang: 'zh' },
    { url: 'https://the-decoder.com/feed/', source: 'THE DECODER', lang: 'en' },
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
            return [];
        }
    });
    const allResults = await Promise.all(promises);
    allResults.forEach(items => results.push(...items));
    results.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    return results;
}

// Translation stub
async function translateNewsItems(items) { return items; }

function parseBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); } catch (e) { resolve({}); }
        });
    });
}

// Vercel ESM Export
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

    const parsed = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    const pathname = parsed.pathname;

    try {
        if (pathname === '/api/news' && req.method === 'GET') {
            const data = await loadData();
            res.statusCode = 200;
            res.end(JSON.stringify({ items: data.cachedNews || [] }));
            return;
        }

        if (pathname === '/api/news/refresh' && req.method === 'POST') {
            const news = await fetchAllNews();
            const translated = await translateNewsItems(news);
            const data = await loadData();
            data.cachedNews = translated;
            data.lastRefresh = new Date().toISOString();
            await saveData(data);
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, items: translated }));
            return;
        }

        if (pathname === '/api/collections' && req.method === 'GET') {
            const data = await loadData();
            res.statusCode = 200;
            res.end(JSON.stringify(data));
            return;
        }

        if (pathname === '/api/collections' && req.method === 'POST') {
            const body = await parseBody(req);
            const data = await loadData();
            const { action, type } = body;
            // Simplified actions for brevity, can be expanded
            if (action === 'add-item') {
                const { item } = body;
                if (!data[type]) data[type] = { categories: [], items: [] };
                data[type].items.push(item);
            }
            await saveData(data);
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, data }));
            return;
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not Found', path: pathname }));

    } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
    }
}
