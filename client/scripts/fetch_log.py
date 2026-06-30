import requests

url = "https://storage.googleapis.com/eas-workflows-production/logs/3ab87f13-3f1d-487a-8ff7-0374f04f7aa6/17ffb343-d4a5-449d-9c98-f32cf4c7faa6/2026-06-23T14%3A24%3A20Z-c93e55fb-8aa8-4594-9602-7d372824ec68.txt?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=www-production%40exponentjs.iam.gserviceaccount.com%2F20260623%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Date=20260623T142539Z&X-Goog-Expires=900&X-Goog-SignedHeaders=host&X-Goog-Signature=5f85cc3f9cf7c42de76c6e30f4c245614b85cab80c59ebab72f314f20d8bb6eb85c02505e2e87fe07997d80da48fb72cff09317bbfa56d47b24fbd3e36bf0a639fdf50165896f9ebb01a0afcc1a85eec51f66d0f01aa5b2b96e452ea0ed40610c5f5c2a0b26595f5ea2fe82b2771f54dec68b6447ab2f345774090716348767f1ea8bffd555ff87b291bbbda07e8e0beb8316ab3a2a4a40d28d28a52a27e25594316e5de33aa97442e568ba0fcbce8d8abdd3eb6a83340b3ee5afd32ffec1b7dc810c68808fd756fd735155d94fb2d781192195e8fb30cb5d5efc4fc0231f8c81085445fe686ed002c5e802c7ea33afaeab3798d4bd4aa19bdae6a471245607c"

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
}

print("Fetching URL...")
r = requests.get(url, headers=headers)
print("Status Code:", r.status_code)
print("Headers:", r.headers)
print("Content Length:", len(r.content))

with open("decompressed_log.txt", "wb") as f:
    f.write(r.content)

print("Saved to decompressed_log.txt")
