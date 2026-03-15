import requests  # type: ignore[import-untyped]
import re
import json
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

# Layer 3: Execution - Fetching RSS Feeds
# Deterministic script for grabbing the data

FEEDS: List[Dict[str, str]] = [
    {"url": "https://36kr.com/feed", "source": "36氪", "lang": "zh"},
    {"url": "https://www.ithome.com/rss/", "source": "IT之家", "lang": "zh"},
    {"url": "https://sspai.com/feed", "source": "少数派", "lang": "zh"},
    {"url": "https://the-decoder.com/feed/", "source": "THE DECODER", "lang": "en"},
    {"url": "https://www.artificialintelligence-news.com/feed/rss/", "source": "AI News", "lang": "en"}
]

TMP_DIR: str = "c:/Users/86133/Desktop/Demo/.tmp"
RAW_FILE: str = os.path.join(TMP_DIR, "raw_rss.json")

def decode_entities(text: str) -> str:
    if not text:
        return ""
    text = text.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").replace("&quot;", '"').replace("&#39;", "'")
    return re.sub(r'<[^>]*>', '', text).strip()

def extract_cdata(block: str, tag: str) -> str:
    cdata = re.search(f"<{tag}><!\[CDATA\[(.*?)\]\]></{tag}>", block, re.S | re.I)  # noqa: W605
    if cdata:
        return cdata.group(1)
    simple = re.search(f"<{tag}>(.*?)</{tag}>", block, re.S | re.I)
    return simple.group(1) if simple else ""

def fetch_rss() -> None:
    all_items: List[Dict[str, Any]] = []
    print(f"🚀 Starting RSS fetch to {RAW_FILE}...")
    
    for feed in FEEDS:
        try:
            print(f"  Fetching {feed['source']}...")
            resp = requests.get(feed['url'], headers={'User-Agent': 'Mozilla/5.0'}, timeout=15)
            xml: str = resp.text
            
            items: List[Any] = re.findall(r'<item>(.*?)</item>', xml, re.S | re.I)
            count: int = 0
            top_items: List[Any] = list(items[:10])
            for block in top_items:
                title: str = extract_cdata(block, 'title')
                link_match: Optional[re.Match[str]] = re.search(r'<link>(.*?)</link>', block, re.S | re.I)
                link: str = link_match.group(1).strip() if link_match else ""
                desc: str = extract_cdata(block, 'description')
                pub_date_match: Optional[re.Match[str]] = re.search(r'<pubDate>(.*?)</pubDate>', block, re.S | re.I)
                pub_date: str = pub_date_match.group(1).strip() if pub_date_match else ""
                
                clean_title: str = decode_entities(title)
                clean_desc: str = str(decode_entities(desc))[:200]
                
                if clean_title:
                    all_items.append({
                        "title": clean_title,
                        "link": link,
                        "description": clean_desc,
                        "pubDate": pub_date,
                        "source": feed['source'],
                        "lang": feed['lang']
                    })
                    count = count + 1
            print(f"    Fetched {count} items.")
        except Exception as e:
            print(f"    ❌ Error fetching {feed['source']}: {str(e)}")

    # Sort by date
    all_items.sort(key=lambda x: x.get('pubDate', ''), reverse=True)

    with open(RAW_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_items, f, ensure_ascii=False, indent=2)
    print(f"✅ Success: Saved {len(all_items)} items to {RAW_FILE}")

if __name__ == "__main__":
    if not os.path.exists(TMP_DIR):
        os.makedirs(TMP_DIR)
    fetch_rss()
