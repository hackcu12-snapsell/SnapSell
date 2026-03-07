import json
import re

from flask import Flask, jsonify, request
from flask_cors import CORS
from google import genai
from google.genai import types
from dotenv import load_dotenv
import os

from ebay import post_listing, upload_image

load_dotenv()

app = Flask(__name__)
CORS(app)

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

    prompt = """Analyze the item in this photo and return ONLY a valid JSON object with these fields:
{
  "name": "short item name",
  "description": "detailed description of the item",
  "condition": "one of: New | Like New | Good | Fair | Poor",
  "category": "item category (e.g. Electronics, Clothing, Collectibles, Tools, Furniture, Shoes, etc)",
  "brand": "brand or manufacturer if identifiable, or null",
  "year": "estimated year or era of manufacture if relevant (e.g. '2019', '1980s'), or null"
}
Return ONLY the JSON object. No markdown, no explanation."""

    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

    response = client.models.generate_content(
        model="gemini-2.5-flash",
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
    required = ["title", "description", "price", "category_id", "condition"]
    if missing := [f for f in required if f not in data]:
        return jsonify({"error": f"Missing fields: {missing}"}), 400

    verify = data.get("verify", True)  # defaults to dry run

    result = post_listing(
        title=data["title"],
        description=data["description"],
        price=float(data["price"]),
        category_id=str(data["category_id"]),
        condition=data["condition"],
        item_specifics=data.get("item_specifics", {}),
        image_urls=data.get("image_urls", []),
        verify=verify,
    )
    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True, port=5001)
