import requests
import json
from datetime import datetime
import sys

# Layer 3: Execution - Daily Log Sync
# Automated script for creating a journal entry and sending it to server.cjs API

API_URL = "http://localhost:3001/api/collections"

def log_summary(content):
    if not content:
        print("❌ Content is empty")
        return
    
    # Parse literal '\n' passed from CLI into actual newlines
    content = content.replace('\\n', '\n')
    
    print("🚀 Fetching current logs...")
    try:
        resp = requests.get(API_URL)
        data = resp.json()
        journal = data.get('journal', [])
        
        # Add new entry to the top
        new_entry = {
            "date": datetime.now().isoformat(),
            "content": content
        }
        journal.insert(0, new_entry)
        
        # Send back to server
        payload = {
            "action": "update-journal",
            "entries": journal
        }
        
        post_resp = requests.post(API_URL, json=payload)
        if post_resp.status_code == 200:
            print("✅ Daily log updated successfully.")
        else:
            print(f"❌ API Error: {post_resp.text}")
            
    except Exception as e:
        print(f"❌ Error syncing log: {str(e)}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python log_today.py 'summary content'")
    else:
        log_summary(sys.argv[1])
