import os


# Must set SSL cert path before any HTTPS/SSL-using imports (fixes Windows/Anaconda
# FileNotFoundError in ssl.create_default_context when loading google-genai).
try:
   import certifi
   _cacert = certifi.where()
   if _cacert and os.path.exists(_cacert):
       os.environ["SSL_CERT_FILE"] = _cacert
       os.environ["REQUESTS_CA_BUNDLE"] = _cacert
except Exception:
   pass


from dotenv import load_dotenv

load_dotenv()


# On Windows/Anaconda, ssl.create_default_context() can raise FileNotFoundError
# because the default CA path is missing. Patch it to use certifi's bundle on failure.
import ssl
_ssl_create_default_context = ssl.create_default_context
def _create_default_context_with_certifi(*args, **kwargs):
   try:
       return _ssl_create_default_context(*args, **kwargs)
   except FileNotFoundError:
       import certifi
       ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
       ctx.load_verify_locations(certifi.where())
       return ctx
ssl.create_default_context = _create_default_context_with_certifi


import json
import re
import subprocess
import atexit
import time


from flask import Flask, jsonify, request
from flask_cors import CORS
from google import genai
from google.genai import types
import requests as http_requests
# ─── Price-agent subprocess ────────────────────────────────────────────────────


_node_proc: subprocess.Popen | None = None

def _start_price_agent() -> None:
    """Spawn the Node price-agent server unless PRICE_AGENT_URL points elsewhere."""
    global _node_proc

    # If an external URL is set, assume the service is managed elsewhere.
    if os.environ.get("PRICE_AGENT_EXTERNAL"):
        return

    agent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "price-agent"))

    # Prefer pre-compiled JS (production); fall back to ts-node (dev).
    dist_entry = os.path.join(agent_dir, "dist", "server.js")
    if os.path.exists(dist_entry):
        cmd = ["node", dist_entry]
    else:
        cmd = ["npx", "ts-node", "src/server.ts"]

    _node_proc = subprocess.Popen(cmd, cwd=agent_dir)
    atexit.register(_stop_price_agent)

    # Wait until the server accepts connections (max 15s).
    price_agent_url = os.environ.get("PRICE_AGENT_URL", "http://localhost:3001")
    for _ in range(30):
        try:
            http_requests.get(price_agent_url, timeout=0.5)
            break
        except Exception:
            time.sleep(0.5)

def _stop_price_agent() -> None:
    if _node_proc and _node_proc.poll() is None:
        _node_proc.terminate()

# Only start in the main process — Flask debug mode spawns a reloader child
# that would try to bind port 3001 a second time.
if os.environ.get("WERKZEUG_RUN_MAIN") != "true":
    _start_price_agent()

from ebay import post_listing, upload_image
from auth import auth_bp
from fraud import fraud_bp
from category import resolve_category

app = Flask(__name__)
CORS(app)

app.register_blueprint(auth_bp)
app.register_blueprint(fraud_bp)

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])


def parse_json_response(text: str) -> dict:
    """Gemini sometimes wraps JSON in markdown code fences despite being told not to."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    return json.loads(text.strip())


@app.route("/")
def home():
    return "SnapSell API"


@app.route("/api/analyze-item", methods=["POST"])
def analyze_item():
    if "image" not in request.files:
        return jsonify({"error": "No image provided"}), 400

    file = request.files["image"]
    image_bytes = file.read()
    mime_type = file.content_type or "image/jpeg"

    extra = request.form.get("description", "").strip()
    extra_context = f"\n\nAdditional context from the user: {extra}" if extra else ""

    prompt = f"""Analyze the item in this photo, described by the user as: ({extra_context}) and return ONLY a valid JSON object with these fields:

{{
  "name": "short item name",
  "description": "detailed description of the item",
  "condition": "one of: New | Like New | Good | Fair | Poor",
  "category": "item category (e.g. Electronics, Clothing, Collectibles, Tools, Furniture, Shoes, etc)",
  "brand": "brand or manufacturer if identifiable, or null",
  "year": "estimated year or era of manufacture if relevant (e.g. '2019', '1980s'), or null"
}}
Return ONLY the JSON object. No markdown, no explanation."""

    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

    response = client.models.generate_content(
        model="gemini-2.5-pro",
        contents=[image_part, prompt],
    )

    try:
        result = parse_json_response(response.text)
    except (json.JSONDecodeError, ValueError) as e:
        return jsonify({"error": "Failed to parse AI response", "raw": response.text}), 500

    return jsonify(result)


@app.route("/api/upload-image", methods=["POST"])
def upload_image_route():
    if "image" not in request.files:
        return jsonify({"error": "No image provided"}), 400
    file = request.files["image"]
    try:
        url = upload_image(file.read(), file.content_type or "image/jpeg", file.filename or "item-image")
        return jsonify({"url": url})
    except ValueError as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/post-listing", methods=["POST"])
def post_listing_route():
    data = request.get_json()
    required = ["title", "description", "price", "condition"]
    if missing := [f for f in required if f not in data]:
        return jsonify({"error": f"Missing fields: {missing}"}), 400

    # Auto-resolve category if not supplied
    category_id = data.get("category_id") or resolve_category(
        client,
        name=data["title"],
        description=data["description"],
        category_hint=data.get("category", ""),
    )

    verify = data.get("verify", True)

    result = post_listing(
        title=data["title"],
        description=data["description"],
        price=float(data["price"]),
        category_id=str(category_id),
        condition=data["condition"],
        item_specifics=data.get("item_specifics", {}),
        image_urls=data.get("image_urls", []),
        verify=verify,
    )
    result["resolved_category_id"] = str(category_id)
    return jsonify(result)


PRICE_AGENT_URL = os.environ.get("PRICE_AGENT_URL", "http://localhost:3001")


@app.route("/api/appraiseItem", methods=["POST"])
def appraise_item():
    data = request.get_json(silent=True) or {}
    item_id = data.get("item_id")
    if not item_id:
        return jsonify({"error": "item_id required"}), 400

    try:
        resp = http_requests.post(
            f"{PRICE_AGENT_URL}/appraise",
            json={"item_id": str(item_id)},
            timeout=90,
        )
    except http_requests.exceptions.RequestException as e:
        return jsonify({"error": f"Price agent unavailable: {e}"}), 500

    if resp.status_code == 404:
        return jsonify({"error": "Item not found"}), 404
    if not resp.ok:
        return jsonify({"error": "Appraisal pipeline failed"}), 500

    return jsonify(resp.json()), 201


if __name__ == "__main__":
    app.run(debug=True, port=5001)
