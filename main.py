from flask import Flask, Response, request, stream_with_context
import requests
import os

app = Flask(__name__)

GH_TOKEN = os.getenv("GH_TOKEN") 
REPO = "Pan-cakse/SUFFERING"

@app.route('/download')
def download_game():
    # 1. Get platform from launcher (windows, linux, or macos)
    target_os = request.args.get('os', 'windows') 
    search_query = f"suffering-{target_os}.zip"

    headers = {"Authorization": f"token {GH_TOKEN}"}

    # 2. Get Release Metadata
    release_url = f"https://api.github.com/repos/{REPO}/releases/latest"
    release_info = requests.get(release_url, headers=headers).json()
    
    # 3. Find the specific asset from the list in your screenshot
    asset_id = None
    for asset in release_info.get('assets', []):
        if search_query in asset['name']:
            asset_id = asset['id']
            break

    if not asset_id:
        return "Asset not found", 404

    # 4. Stream the file from GitHub to the user
    asset_url = f"https://api.github.com/repos/{REPO}/releases/assets/{asset_id}"
    headers["Accept"] = "application/octet-stream"
    
    req = requests.get(asset_url, headers=headers, stream=True)

    return Response(
        stream_with_context(req.iter_content(chunk_size=8192)),
        content_type=req.headers.get('content-type'),
        headers={"Content-Disposition": f"attachment; filename={search_query}"}
    )
