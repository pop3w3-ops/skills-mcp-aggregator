import json
from datetime import datetime

DATA_FILE = "c:/Users/86133/Desktop/Demo/skills-mcp-aggregator/data.json"

log_content = "🚀 今日开发总结：\n1. **架构革新**：全面落地三层架构 (Directives / Execution / Data)。\n2. **自动化同步**：实现了 sync_skills.py，自动归类 18 个现有 Skill 到“操作网页”和“通用技能”。\n3. **交互系统**：在前端主页新增了‘开发日记’页面，采用 Timeline 风格，并打通了前后端编辑链路。\n4. **元能力增强**：新增 launch-app, add-to-portfolio, context-log-generator 三大核心技能。\n5. **环境优化**：解决了 Pyright 类型检查报错，清理了冗余文件。"

try:
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    if 'journal' not in data:
        data['journal'] = []
    
    # Add if not already exists (content based check)
    if not any(log_content in entry['content'] for entry in data['journal']):
        data['journal'].insert(0, {
            "date": datetime.now().isoformat(),
            "content": log_content
        })
        
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("✅ Correctly initialized the journal in data.json.")
    else:
        print("✅ Journal already contains today's entry.")
except Exception as e:
    print(f"❌ Error during manual log update: {str(e)}")
