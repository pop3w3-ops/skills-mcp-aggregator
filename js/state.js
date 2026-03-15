export const state = {
    collections: {},
    notifications: JSON.parse(localStorage.getItem('notifications') || '[]'),
    _displayedItems: {}, // Cache of sorted items per type
    ICON_MAP: {
        '本站操作': '🖱️', '设计与艺术': '🎨', '编程与开发': '💻', '文档与写作': '📝',
        '办公与效率': '🗂️', '数据库': '🗄️', '浏览器': '🌐', '系统监控': '📊',
        '搜索与资讯': '🔍', '金融与数据': '💰', '默认': '📂'
    },
    activeFilters: {},
    batchMode: false,
    batchSelected: new Set(),
    renderVersion: 0,
    currentTab: 'dashboard'
};

export const API = '/api';

// For legacy code that relies on window globals during refactor
window.appState = state;
window.API_URL = API;

export const DEFAULT_RESOURCES = [
    { name: 'MCP 服务器目录', description: 'MCP 服务器全面列表', url: 'https://mcpservers.org', tag: '资源站' },
    { name: 'MCP Market', description: 'MCP 服务器市场&排行', url: 'https://mcpmarket.com', tag: '市场' },
    { name: 'Awesome MCP Servers', description: '高质量 MCP 精选列表', url: 'https://github.com/punkpeye/awesome-mcp-servers', tag: 'GitHub' },
    { name: 'SkillsMP', description: 'Claude/Gemini 技能市场', url: 'https://skillsmp.com', tag: '市场' },
    { name: 'Awesome Agent Skills', description: '自主代理技能集合', url: 'https://github.com/heilcheng/awesome-agent-skills', tag: 'GitHub' },
    { name: 'MCP Awesome', description: 'MCP 可视化导航站', url: 'https://mcp-awesome.com', tag: '导航站' },
];
export let readItems = JSON.parse(localStorage.getItem('readItems') || '{}');

export let sortStates = {};
