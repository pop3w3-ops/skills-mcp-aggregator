/**
 * Vercel Serverless Function version of server.cjs (ESM Version)
 */
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';

import Redis from 'ioredis';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const DATA_FILE = path.join(process.cwd(), 'data.json');
const KV_KEY = 'app_collections_data';

// 初始化 Redis 客户端
let redis;
function getRedis() {
    if (!redis) {
        const url = process.env.KV_REDIS_URL;
        if (!url) {
            console.warn('⚠️ 未找到 KV_REDIS_URL，数据库功能将不可用');
            return null;
        }
        redis = new Redis(url, {
            connectTimeout: 10000,
            maxRetriesPerRequest: 3
        });
        redis.on('error', (err) => console.error('Redis 连接错误:', err.message));
    }
    return redis;
}

// ========== 数据持久化 (ioredis 版) ==========
async function loadData() {
    const client = getRedis();
    try {
        if (client) {
            const raw = await client.get(KV_KEY);
            if (raw) return JSON.parse(raw);
        }

        // 如果 Redis 为空或连不上，尝试从 data.json 读取 (初次同步)
        if (fs.existsSync(DATA_FILE)) {
            const fileData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
            if (client) {
                await client.set(KV_KEY, JSON.stringify(fileData));
                console.log('🌱 数据已同步至云端 Redis');
            }
            return fileData;
        }
    } catch (e) {
        console.error('数据库解析失败:', e.message);
    }
    
    // 兜底默认数据
    return {
        news: { categories: ['AI 前沿', '大模型', '开源项目', '行业应用'], items: [] },
        mcp: { categories: ['数据库', '浏览器', '文件处理', '搜索', '效率工具'], items: [] },
        skills: { categories: ['编程', '写作', '数据分析', '设计', '通用'], items: [] },
        resources: { categories: ['资源站', '市场', 'GitHub', '导航站'], items: [] },
        journal: []
    };
}

async function saveData(data) {
    const client = getRedis();
    if (!client) return;
    try {
        await client.set(KV_KEY, JSON.stringify(data));
        console.log('✅ 项目变更已保存至云端');
    } catch (e) {
        console.error('数据库保存失败:', e.message);
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
    } catch (e) { console.error('36kr hot list error:', e.message); }
    return [];
}

async function fetchSspaiHot() {
    try {
        const url = `https://sspai.com/api/v1/article/tag/page/get?limit=15&offset=0&tag=%E7%83%AD%E6%A6%9C`; // URL encoded "热榜"
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
    } catch (e) { console.error('sspai hot list error:', e.message); }
    return [];
}

async function fetchGithubTrending() {
    try {
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

// Feeds
const ALL_FEEDS = [
    { url: 'https://www.ithome.com/rss/', source: 'IT之家', lang: 'zh' },
    { url: 'https://the-decoder.com/feed/', source: 'THE DECODER', lang: 'en' },
];

async function fetchAllNews() {
    const results = [];
    
    // Fetch Hot Lists
    const hot36kr = await fetch36krHot();
    const hotSspai = await fetchSspaiHot();
    const hotGithub = await fetchGithubTrending();
    results.push(...hot36kr, ...hotSspai, ...hotGithub);

    // Fetch remaining RSS feeds
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
            return [];
        }
    });
    const allResults = await Promise.all(promises);
    allResults.forEach(items => results.push(...items));
    results.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    return results;
}

// Translation using Google Translate Unofficial Edge API
async function translateNewsItems(items) {
    const translated = [];
    for (const item of items) {
        if (item.lang === 'en') {
            try {
                // Free google translate API, no rate limit issues typically
                await new Promise(r => setTimeout(r, 200));
                
                // Translate Title
                const titleRes = await fetchUrl(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(item.title)}`);
                const titleData = JSON.parse(titleRes);
                if (titleData && titleData[0] && titleData[0][0]) {
                    item.titleOriginal = item.title;
                    item.title = titleData[0].map(x => x[0]).join('');
                }

                // Translate Description if short enough
                if (item.description && item.description.length < 1500) {
                    await new Promise(r => setTimeout(r, 200));
                    const descRes = await fetchUrl(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(item.description)}`);
                    const descData = JSON.parse(descRes);
                    if (descData && descData[0] && descData[0][0]) {
                        item.description = descData[0].map(x => x[0]).join('');
                    }
                }
            } catch (e) { console.error('Translation error:', e.message); }
        }
        translated.push(item);
    }
    return translated;
}

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
            const { action, type, index, item, category, entries, oldName, newName } = body;
            
            if (!data.journal) data.journal = [];

            switch (action) {
                case 'add-item':
                    if (!data[type]) data[type] = { categories: [], items: [] };
                    // 简单的去重检查
                    const isDup = data[type].items.some(it => (it.name || it.title) === (item.name || item.title));
                    if (!isDup) {
                        data[type].items.push(item);
                    }
                    break;

                case 'delete-item':
                    if (data[type]?.items?.[index]) {
                        data[type].items.splice(index, 1);
                    }
                    break;

                case 'update-item':
                    if (data[type]?.items?.[index]) {
                        data[type].items[index] = item;
                    }
                    break;

                case 'increment-clicks':
                    if (data[type]?.items?.[index]) {
                        data[type].items[index].clicks = (data[type].items[index].clicks || 0) + 1;
                    }
                    break;

                case 'update-journal':
                    data.journal = entries || [];
                    break;

                case 'add-category':
                    if (data[type] && !data[type].categories.includes(category)) {
                        data[type].categories.push(category);
                    }
                    break;

                case 'delete-category':
                    if (data[type]) {
                        data[type].categories = data[type].categories.filter(c => c !== category);
                        data[type].items = data[type].items.filter(it => it.category !== category);
                    }
                    break;

                case 'rename-category':
                    if (data[type]) {
                        data[type].categories = data[type].categories.map(c => c === oldName ? newName : c);
                        data[type].items = data[type].items.map(it => ({ 
                            ...it, 
                            category: it.category === oldName ? newName : it.category 
                        }));
                    }
                    break;

                case 'import-section':
                    if (body.data) data[type] = body.data;
                    break;
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
