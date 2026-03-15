import requests
import json
import os
import time

# Layer 3: Execution - Content Translation
# Deterministic script for translating the data

TMP_DIR = "c:/Users/86133/Desktop/Demo/.tmp"
RAW_FILE = os.path.join(TMP_DIR, "raw_rss.json")
PROCESSED_FILE = os.path.join(TMP_DIR, "processed_rss.json")

def translate_text(text, from_lang='en', to_lang='zh-CN'):
    if not text or len(text) < 3: return text
    try:
        # Using MyMemory API
        print(f"    Translating: {text[:30]}...")
        api_url = f"https://api.mymemory.translated.net/get?q={requests.utils.quote(text[:500])}&langpair={from_lang}|{to_lang}"
        resp = requests.get(api_url, timeout=10)
        data = resp.json()
        if data.get('responseData') and data['responseData'].get('translatedText'):
            return data['responseData']['translatedText']
    except Exception as e:
        print(f"    ❌ Translation Error: {str(e)}")
    return text

def process_translation():
    if not os.path.exists(RAW_FILE):
        print(f"❌ Error: {RAW_FILE} not found.")
        return

    print(f"🚀 Starting translation processing...")
    with open(RAW_FILE, 'r', encoding='utf-8') as f:
        items = json.load(f)

    processed_items = []
    en_count = 0
    for item in items:
        if item.get('lang') == 'en':
            en_count += 1
            original_title = item['title']
            original_desc = item['description']
            
            translated_title = translate_text(original_title)
            # Short sleep to avoid rate limiting
            time.sleep(0.1)
            translated_desc = translate_text(original_desc)
            time.sleep(0.1)
            
            item.update({
                "title": translated_title,
                "titleOriginal": original_title,
                "description": translated_desc,
                "descOriginal": original_desc
            })
        processed_items.append(item)

    with open(PROCESSED_FILE, 'w', encoding='utf-8') as f:
        json.dump(processed_items, f, ensure_ascii=False, indent=2)
    print(f"✅ Success: Processed {len(processed_items)} items ({en_count} translated) to {PROCESSED_FILE}")

if __name__ == "__main__":
    process_translation()
