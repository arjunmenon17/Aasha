#!/usr/bin/env python3
"""
If ngrok is running (ngrok http 8000), read the public URL from the local API
and update BASE_URL in backend/.env.
"""
import os
import re
import sys

try:
    import urllib.request
    with urllib.request.urlopen("http://127.0.0.1:4040/api/tunnels", timeout=5) as r:
        data = r.read().decode()
except Exception as e:
    print("Ngrok does not appear to be running. Start it first:", file=sys.stderr)
    print("  npx ngrok http 8000", file=sys.stderr)
    print("  (Or: ngrok http 8000  after installing and adding your authtoken)", file=sys.stderr)
    print("Then run this script again.", file=sys.stderr)
    sys.exit(1)

try:
    import json
    tunnels = json.loads(data).get("tunnels", [])
    https_url = None
    for t in tunnels:
        url = t.get("public_url", "")
        if url.startswith("https://"):
            https_url = url
            break
    if not https_url:
        print("No HTTPS tunnel found in ngrok.", file=sys.stderr)
        sys.exit(1)
except Exception as e:
    print(f"Could not parse ngrok response: {e}", file=sys.stderr)
    sys.exit(1)

# backend/scripts/ -> backend/.env
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
with open(env_path, "r") as f:
    content = f.read()

new_content = re.sub(r"^BASE_URL=.*$", f"BASE_URL={https_url}", content, count=1, flags=re.MULTILINE)
if new_content == content:
    print("BASE_URL line not found in .env", file=sys.stderr)
    sys.exit(1)

with open(env_path, "w") as f:
    f.write(new_content)

print(f"Updated BASE_URL to {https_url}")
print(f"Set your Twilio webhook to: {https_url}/api/webhooks/twilio")
