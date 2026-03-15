import os
import json
import re

# Layer 3: Execution - Skill Sync Manager
# Scans skills/ directory and syncs to data.json with detailed categories

SKILLS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "Skills"))
DATA_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data.json"))

CATEGORIES = ["本站操作", "设计与艺术", "编程与开发", "文档与写作", "办公与效率"]

CATEGORY_MAP = {
    "algorithmic-art": "设计与艺术",
    "brand-guidelines": "设计与艺术",
    "canvas-design": "设计与艺术",
    "claude-api": "编程与开发",
    "context-log-generator": "本站操作",
    "doc-coauthoring": "文档与写作",
    "docx": "办公与效率",
    "frontend-design": "编程与开发",
    "internal-comms": "文档与写作",
    "launch-app": "本站操作",
    "mcp-builder": "编程与开发",
    "pdf": "办公与效率",
    "pptx": "办公与效率",
    "skill-creator": "本站操作",
    "slack-gif-creator": "设计与艺术",
    "theme-factory": "设计与艺术",
    "web-artifacts-builder": "编程与开发",
    "webapp-testing": "编程与开发",
    "xlsx": "办公与效率",
    "wechat-article": "文档与写作"
}

ICON_MAP = {
    "本站操作": "🖱️",
    "设计与艺术": "🎨",
    "编程与开发": "💻",
    "文档与写作": "📝",
    "办公与效率": "🗂️"
}

CN_DESCRIPTIONS = {
    "algorithmic-art": "用 p5.js 创建算法艺术，支持种子随机、参数探索和生成式设计。",
    "brand-guidelines": "将 Anthropic 品牌色彩和排版风格应用到各类设计素材中。",
    "canvas-design": "创建精美的 PNG/PDF 视觉作品，包括海报、插图和静态设计。",
    "claude-api": "使用 Claude API 和 Anthropic SDK 构建 AI 应用程序。",
    "context-log-generator": "自动总结今日对话上下文，生成开发日记并发布到网页时间轴。",
    "doc-coauthoring": "引导用户通过结构化流程协同撰写文档、提案和技术规格。",
    "docx": "创建、读取、编辑和操作 Word 文档(.docx)，支持目录、页眉等专业排版。",
    "frontend-design": "创建高品质、生产级的前端界面，包括网页、仪表盘和 React 组件。",
    "internal-comms": "撰写各类内部沟通文档：状态报告、领导层更新、公司通讯等。",
    "launch-app": "一键启动 AI 聚合器的 Node.js 后端和 Vite 前端开发服务器。",
    "mcp-builder": "创建高质量的 MCP (Model Context Protocol) 服务器，支持 Python 和 TypeScript。",
    "pdf": "读取、合并、拆分、旋转、加水印、加密 PDF 文件，支持 OCR 识别。",
    "pptx": "创建、编辑和操作 PowerPoint 演示文稿(.pptx)，支持模板和批注。",
    "skill-creator": "全功能技能管理中心：创建新技能、优化指令，并自动将变更同步刷新到网页 Skills 标签页。",
    "slack-gif-creator": "创建为 Slack 优化的动画 GIF，提供约束验证和动画概念。",
    "theme-factory": "为各类素材（幻灯片、文档、网页）应用 10+ 预设主题配色方案。",
    "web-artifacts-builder": "使用 React + Tailwind + shadcn/ui 构建复杂的多组件 Web 应用。",
    "webapp-testing": "使用 Playwright 测试本地 Web 应用，支持截图、日志和 UI 调试。",
    "xlsx": "创建、读取、编辑 Excel 电子表格(.xlsx)，支持公式、图表和数据清洗。",
    "wechat-article": "化身爆款微信号写手，按傅盛式风格进行有理有据、有情有态的文章创作，附带封面生成功能。"
}

def get_skill_info(skill_path):
    skill_md = os.path.join(skill_path, "SKILL.md")
    if not os.path.exists(skill_md):
        return None

    with open(skill_md, 'r', encoding='utf-8') as f:
        content = f.read()

    name = ""
    name_match = re.search(r'name:\s*(.*)', content)
    if name_match:
        name = name_match.group(1).strip()
    if not name:
        name = os.path.basename(skill_path)

    folder_name = os.path.basename(skill_path)
    description = CN_DESCRIPTIONS.get(folder_name, "")
    if not description:
        desc_match = re.search(r'description:\s*(.*)', content)
        description = desc_match.group(1).strip() if desc_match else ""

    category = CATEGORY_MAP.get(folder_name, "通用技能")
    
    # 确保未知分类被添加到整体列表中，虽然上面枚举了所有技能
    if category not in CATEGORIES and category != "通用技能":
        category = "通用技能"

    return {
        "name": name,
        "description": description,
        "category": category,
        "path": os.path.relpath(skill_path, os.path.dirname(DATA_FILE)).replace('\\', '/'),
        "icon": ICON_MAP.get(category, "⚡")
    }

def sync_skills():
    print(f"🔄 Syncing skills from {SKILLS_DIR}...")

    if not os.path.exists(DATA_FILE):
        print("❌ data.json not found")
        return

    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 提取现有的 clicks 数据
    existing_skills = data.get('skills', {}).get('items', [])
    clicks_map = {item['name']: item.get('clicks', 0) for item in existing_skills}

    skill_items = []

    for folder in sorted(os.listdir(SKILLS_DIR)):
        path = os.path.join(SKILLS_DIR, folder)
        if os.path.isdir(path):
            info = get_skill_info(path)
            if info:
                # 保留历史点击量
                info['clicks'] = clicks_map.get(info['name'], 0)
                skill_items.append(info)

    # Calculate actual used categories in order
    used_categories = [c for c in CATEGORIES if any(s['category'] == c for s in skill_items)]
    if any(s['category'] == "通用技能" for s in skill_items) and "通用技能" not in used_categories:
        used_categories.append("通用技能")

    # Update data.json
    data['skills'] = {
        "categories": used_categories,
        "items": skill_items
    }

    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"✅ Synced {len(skill_items)} skills into {len(used_categories)} categories.")

if __name__ == "__main__":
    sync_skills()
