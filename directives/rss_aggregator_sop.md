# Directive: AI 资讯聚合 SOP (RSS Aggregator)

## 目标
根据 `AGENTS.md` 的架构原则，将 AI 资讯聚合器的抓取与翻译任务从主应用脚本中剥离，转由确定性的 Python 脚本执行，并通过中间文件 `.tmp/` 进行数据传递。

## 输入
- RSS 源列表 (定义在 `execution/config.py` 或脚本中)
- 语言目标: 英文翻译为中文 (zh-CN)

## 执行步骤
1. **抓取原始 RSS**: 运行 `execution/fetch_rss.py`。
   - 抓取多个中/英文源。
   - 输出至 `.tmp/raw_rss.json`。
2. **内容翻译**: 运行 `execution/translate_content.py`。
   - 读取 `.tmp/raw_rss.json`。
   - 对英文条目的 `title` 和 `description` 进行翻译。
   - 输出至 `.tmp/processed_rss.json`。
3. **数据合并**: 将 `.tmp/processed_rss.json` 的内容合并到业务数据 `skills-mcp-aggregator/data.json` 中。
4. **服务启动**: 运行前端应用以查看结果。

## 工具 (Layer 3)
- `execution/fetch_rss.py`: 使用 `feedparser` 或 `requests` 获取数据。
- `execution/translate_content.py`: 使用 `requests` 调用翻译接口。

## 异常处理
- 若抓取失败，跳过该源并记录到 `.tmp/error.log`。
- 若翻译接口限流，回退到原文字段并记录。

## 成功标准
- `data.json` 中 `news.items` 包含最新资讯且英文内容已翻译。
- 前端能正常展示中文资讯。
