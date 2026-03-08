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
import uuid

import jwt as pyjwt
from flask import Flask, jsonify, request, send_from_directory
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
from photo_enhance import enhance_bp
from category import resolve_category
from db import get_conn, release_conn

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*", "allow_headers": ["Content-Type", "Authorization"]}})

app.register_blueprint(auth_bp)
app.register_blueprint(fraud_bp)
app.register_blueprint(enhance_bp)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

JWT_SECRET = os.environ.get("JWT_SECRET", "")


def _require_user() -> int | None:
    """Decode JWT from Authorization header; return user_id or None."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        print(f"[auth] Missing/invalid Authorization header: {repr(auth[:60])}")
        return None
    try:
        payload = pyjwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"], options={"verify_sub": False})
        return int(payload["sub"])
    except Exception as e:
        print(f"[auth] JWT decode failed: {e}")
        return None


@app.route("/uploads/<path:filename>")
def serve_upload(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

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

    prompt = f"""Analyze the item in this photo {extra_context} and return ONLY a valid JSON object with these fields:

{{
  "name": "short item name",
  "description": "detailed description of the item - focus on details that are relevant to searching for the item on a site like ebay.",
  "condition": "one of: New | Like New | Good | Fair | Poor",
  "category": "item category (e.g. Electronics, Clothing, Collectibles, Tools, Furniture, Shoes, etc)",
  "brand": "brand or manufacturer if identifiable, or null",
  "year": "estimated year or era of manufacture if relevant (e.g. '2019', '1980s'), or null",
  "needs_review": false
}}

Set needs_review to true only if the item is unclear or ambiguous — e.g. you cannot confidently identify the name, the condition is hard to assess, or critical details are missing that would affect pricing accuracy.
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


@app.route("/api/save-item", methods=["POST"])
def save_item():
    user_id = _require_user()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    image_file = request.files.get("image")
    if not image_file:
        return jsonify({"error": "image required"}), 400

    # Save image locally
    ext = (image_file.filename or "item.jpg").rsplit(".", 1)[-1].lower() or "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    image_file.save(os.path.join(UPLOAD_FOLDER, filename))
    image_url = f"/uploads/{filename}"

    name = request.form.get("name", "").strip()
    description = request.form.get("description", "").strip()
    category = request.form.get("category", "").strip() or None
    brand = request.form.get("brand", "").strip() or None
    year_raw = request.form.get("year", "").strip()
    year = int(year_raw) if year_raw.isdigit() else None
    purchase_price = float(request.form.get("purchase_price", "0") or 0)

    if not name:
        return jsonify({"error": "name required"}), 400

    conn = get_conn()
    item_id = None
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO items (userid, name, description, category, brand, year, status, sale_cost)
                   VALUES (%s, %s, %s, %s, %s, %s, 'inventory', %s) RETURNING id""",
                (user_id, name, description, category, brand, year, purchase_price),
            )
            item_id = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO item_image (item_id, url) VALUES (%s, %s)",
                (item_id, image_url),
            )
            conn.commit()
    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"DB insert failed: {e}"}), 500
    finally:
        release_conn(conn)

    # Trigger price agent and log result

    #this is the point where we could trigger the verify add item +place holder data 
    print(f"\n[save-item] Item {item_id} saved — triggering appraisal...")
    try:
        resp = http_requests.post(
            f"{PRICE_AGENT_URL}/appraise",
            json={"item_id": str(item_id)},
            timeout=90,
        )
        if resp.ok:
            a = resp.json()
            print(f"[save-item] Appraisal complete for item {item_id}:")
            print(f"  name:       {name}")
            print(f"  low/mean/high: ${a.get('lowest_value')} / ${a.get('mean_value')} / ${a.get('high_value')}")
            print(f"  confidence: {a.get('value_confidence')}")
            print(f"  volume:     {a.get('volume')} comparable sales")
            print(f"  reasoning:  {a.get('value_reasoning')}")
            print(f"  decision:   {a.get('decision')}")
        else:
            print(f"[save-item] Price agent returned {resp.status_code} for item {item_id}: {resp.text[:200]}")
    except Exception as e:
        print(f"[save-item] Price agent error for item {item_id}: {e}")

    # Read appraisal back from DB to return to frontend
    appraisal_data = None
    conn2 = get_conn()
    try:
        with conn2.cursor() as cur:
            cur.execute(
                """SELECT lowest_value, mean_value, high_value, value_confidence,
                          volume, value_reasoning, caveat, decision
                   FROM appraisals WHERE item_id = %s ORDER BY date DESC LIMIT 1""",
                (item_id,),
            )
            row = cur.fetchone()
            if row:
                appraisal_data = {
                    "lowest_value":     float(row[0]) if row[0] is not None else None,
                    "mean_value":       float(row[1]) if row[1] is not None else None,
                    "high_value":       float(row[2]) if row[2] is not None else None,
                    "value_confidence": float(row[3]) if row[3] is not None else None,
                    "volume":           row[4],
                    "value_reasoning":  row[5],
                    "caveat":           row[6],
                    "decision":         row[7],
                }
    except Exception as e:
        print(f"[save-item] Failed to read appraisal from DB: {e}")
    finally:
        release_conn(conn2)

    return jsonify({
        "item_id":   item_id,
        "image_url": image_url,
        "item":      {"name": name, "description": description, "category": category, "brand": brand, "year": year},
        "appraisal": appraisal_data,
    }), 201


@app.route("/api/list-on-ebay", methods=["POST"])
def list_on_ebay():
    user_id = _require_user()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    item_id  = data.get("item_id")
    title    = (data.get("title") or "").strip()
    desc     = (data.get("description") or "").strip()
    price    = float(data.get("price") or 0)
    condition = data.get("condition", "Good")

    if not item_id or not title or not price:
        return jsonify({"error": "item_id, title, and price are required"}), 400

    # Pull item + image + appraisal_id from DB
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT category FROM items WHERE id = %s AND userid = %s",
                (item_id, user_id),
            )
            item_row = cur.fetchone()
            if not item_row:
                return jsonify({"error": "Item not found"}), 404
            category_hint = item_row[0] or ""

            cur.execute("SELECT url FROM item_image WHERE item_id = %s LIMIT 1", (item_id,))
            img_row = cur.fetchone()
    except Exception as e:
        return jsonify({"error": f"DB error: {e}"}), 500
    finally:
        release_conn(conn)

    # Upload image to eBay EPS
    ebay_image_url = None
    if img_row:
        local_filename = os.path.basename(img_row[0])
        full_path = os.path.join(UPLOAD_FOLDER, local_filename)
        if os.path.exists(full_path):
            with open(full_path, "rb") as f:
                image_bytes = f.read()
            try:
                ebay_image_url = upload_image(image_bytes, "image/jpeg", local_filename)
                print(f"[list-on-ebay] Image uploaded to EPS: {ebay_image_url}")
            except Exception as e:
                print(f"[list-on-ebay] Image upload failed (continuing without image): {e}")

    # Resolve category and post listing
    category_id = resolve_category(client, name=title, description=desc, category_hint=category_hint)
    try:
        result = post_listing(
            title=title,
            description=desc,
            price=price,
            category_id=str(category_id),
            condition=condition,
            image_urls=[ebay_image_url] if ebay_image_url else [],
            verify=False,
        )
    except Exception as e:
        return jsonify({"error": f"eBay listing failed: {e}"}), 500

    if result.get("ack") not in ("Success", "Warning"):
        return jsonify({"error": "eBay listing rejected", "details": result}), 500

    ebay_item_id = result.get("item_id")
    listing_url  = f"https://sandbox.ebay.com/itm/{ebay_item_id}"
    print(f"[list-on-ebay] Listed item {item_id} on eBay: {listing_url}")

    # Update items: status, listing URL, posted date
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE items
                   SET status = 'listed', ebay_listing_url = %s, posted_date = NOW()
                   WHERE id = %s""",
                (listing_url, item_id),
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"[list-on-ebay] DB update failed: {e}")
    finally:
        release_conn(conn)

    return jsonify({"ebay_item_id": ebay_item_id, "listing_url": listing_url}), 201


if __name__ == "__main__":
    app.run(debug=True, port=5001)
