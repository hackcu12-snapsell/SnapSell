"""
POST /api/enhancePhoto  { "item_id": <int> }

Loads the item's primary image, sends it to Gemini image editing
(background removal + lighting/sharpness enhancement, product unchanged),
saves the result to /uploads/, and writes a row to edited_photos.

Returns:
  { "edited_photo_id": <int>, "url": "/uploads/..." }
  404 — item or image not found
  400 — missing item_id
  500 — Gemini error or DB error
"""

import base64
import os
import uuid

from flask import Blueprint, jsonify, request
from google import genai
from google.genai import types
from db import get_conn, release_conn

enhance_bp = Blueprint("photo_enhance", __name__)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")

EDIT_PROMPT = """\
You are a professional product photographer and photo editor. \
Edit the product image exactly as described below for an online marketplace listing.

APPLY THESE CHANGES ONLY:
1. Remove the background completely and replace it with a clean, \
pure white background (#FFFFFF). The cutout edge should be clean and precise.
2. Even out the lighting — reduce harsh shadows, eliminate hotspots, \
and make the illumination consistent, bright, and professional.
3. Gently increase sharpness and clarity to make product details crisp. \
This should be a subtle enhancement, not over-processed.

DO NOT CHANGE ANY OF THE FOLLOWING — violating these rules makes the image unusable:
- Product shape, silhouette, or proportions
- Product color, tone, or finish (do not whiten, desaturate, or shift colors)
- Any branding, logos, text, labels, tags, or markings on the product
- The product's overall scale or framing within the image

The output should look like a clean, professional product listing photo \
as seen on eBay or Amazon: white background, even lighting, sharp details, \
with the product looking exactly as it does in real life.\
"""


def _extract_image_part(response) -> tuple[bytes, str] | tuple[None, None]:
    """Pull the first image part out of a Gemini response. Returns (bytes, mime_type)."""
    try:
        parts = response.candidates[0].content.parts
    except (IndexError, AttributeError):
        return None, None

    for part in parts:
        inline = getattr(part, "inline_data", None)
        if inline is None:
            continue
        data = inline.data
        mime = inline.mime_type or "image/png"
        # SDK may return raw bytes or a base64 string depending on version
        if isinstance(data, str):
            data = base64.b64decode(data)
        return data, mime

    return None, None


@enhance_bp.route("/api/enhancePhoto", methods=["POST"])
def enhance_photo():
    data = request.get_json(silent=True) or {}
    item_id = data.get("item_id")
    if not item_id:
        return jsonify({"error": "item_id required"}), 400

    conn = get_conn()
    try:
        # 1. Fetch item's primary image record
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, url FROM item_image WHERE item_id = %s ORDER BY id LIMIT 1",
                (item_id,),
            )
            row = cur.fetchone()

        if row is None:
            return jsonify({"error": "No image found for item"}), 404

        item_image_id, image_url = row[0], row[1]

        # 2. Load image bytes from local uploads folder
        filename = os.path.basename(image_url)
        image_path = os.path.join(UPLOAD_FOLDER, filename)
        if not os.path.exists(image_path):
            return jsonify({"error": "Image file not found on server"}), 404

        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
        mime_type = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"

        with open(image_path, "rb") as f:
            image_bytes = f.read()

        # 3. Call Gemini image editing
        client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                types.Part.from_text(EDIT_PROMPT),
            ],
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
            ),
        )

        edited_bytes, output_mime = _extract_image_part(response)
        if edited_bytes is None:
            # Gemini sometimes returns only text explaining why it won't edit
            text_response = ""
            try:
                text_response = response.candidates[0].content.parts[0].text or ""
            except Exception:
                pass
            return jsonify({"error": "Gemini did not return an edited image", "detail": text_response[:300]}), 500

        # 4. Save edited image to uploads folder
        out_ext = "png" if output_mime and "png" in output_mime else "jpg"
        out_filename = f"enhanced_{uuid.uuid4().hex}.{out_ext}"
        out_path = os.path.join(UPLOAD_FOLDER, out_filename)
        with open(out_path, "wb") as f:
            f.write(edited_bytes)

        edited_url = f"/uploads/{out_filename}"

        # 5. Persist to edited_photos (same url format as item_image)
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO edited_photos (item_image_id, url) VALUES (%s, %s) RETURNING id",
                (item_image_id, edited_url),
            )
            edited_photo_id = cur.fetchone()[0]
        conn.commit()

        return jsonify({"edited_photo_id": edited_photo_id, "url": edited_url}), 201

    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        release_conn(conn)
