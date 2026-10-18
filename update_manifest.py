import json

with open('AquaTrace/manifest.json', 'r') as f:
    data = json.load(f)

data['content_security_policy'] = { "extension_pages": "script-src 'self'; object-src 'self';" }
data['minimum_chrome_version'] = "114"
data['description'] = "Estimate the water, energy & CO2 footprint of your ChatGPT, Claude, Gemini & DeepSeek chats — 100% local, nothing sent to any server."

with open('AquaTrace/manifest.json', 'w') as f:
    json.dump(data, f, indent=2)
