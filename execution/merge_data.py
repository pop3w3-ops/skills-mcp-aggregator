import json
import os

# Layer 3: Execution - Data Merge
# Merges the processed RSS items into the main data.json file

PROCESSED_FILE = "c:/Users/86133/Desktop/Demo/.tmp/processed_rss.json"
DATA_FILE = "c:/Users/86133/Desktop/Demo/skills-mcp-aggregator/data.json"

def merge_data():
    if not os.path.exists(PROCESSED_FILE):
        print(f"❌ Error: {PROCESSED_FILE} not found.")
        return

    if not os.path.exists(DATA_FILE):
        print(f"❌ Error: {DATA_FILE} not found.")
        return

    print(f"🚀 Merging processed data into {DATA_FILE}...")
    
    with open(PROCESSED_FILE, 'r', encoding='utf-8') as f:
        processed_items = json.load(f)

    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Initialize news keys if not present
    if 'news' not in data:
        data['news'] = {"categories": ["AI 前沿", "大模型", "开源项目", "行业应用"], "items": []}
    
    # We replace the current items with the fetched ones (latest results)
    # Alternatively, we could append and de-duplicate, but for now, simple overwrite of latest.
    data['news']['items'] = processed_items

    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"✅ Success: Merged {len(processed_items)} items into {DATA_FILE}")

if __name__ == "__main__":
    merge_data()
