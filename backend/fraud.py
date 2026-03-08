"""
POST /api/fraudCheck  { "item_id": <int> }

Fetches the item, asks Gemini to assess counterfeit / fraud risk,
and writes a fraud_alerts row only when fraud_score >= FRAUD_THRESHOLD.

Returns:
  {}                           — score below threshold (no meaningful risk)
  { "fraud_alert_id": <int> } — row written; frontend can show a warning
  404                          — item not found
  400                          — item_id missing
  500                          — Gemini or DB error
"""

import json
import os

from flask import Blueprint, jsonify, request
from google import genai
from db import get_conn, release_conn

fraud_bp = Blueprint("fraud", __name__)

FRAUD_THRESHOLD = 0.5   # write to DB and return alert only above this score

_gemini_client: genai.Client | None = None


def _get_gemini() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return _gemini_client


# ─── Prompt ───────────────────────────────────────────────────────────────────

def _build_prompt(item: dict) -> str:
    def field(label: str, value) -> str:
        return f"{label}: {value}" if value else ""

    item_block = "\n".join(filter(None, [
        field("Name",        item.get("name")),
        field("Brand",       item.get("brand")),
        field("Category",    item.get("category")),
        field("Condition",   item.get("condition")),
        field("Year",        item.get("year")),
        field("Description", item.get("description")),
        field("Asking Price", f"${item['sale_cost']:.2f}" if item.get("sale_cost") else None),
    ]))

    return f"""You are a consumer protection specialist with deep expertise in secondhand market fraud, counterfeiting, and scam patterns.

Analyze the item below and assess how likely it is to be counterfeit, fraudulently represented, or part of a common scam when bought secondhand.

ITEM:
{item_block}

ASSESSMENT CRITERIA — reason through each:

1. CATEGORY RISK
   Some categories have extremely high counterfeit rates. Treat these as elevated baseline risk:
   - Luxury / designer goods: handbags (Louis Vuitton, Gucci, Chanel), wallets, belts, scarves
   - Footwear: Nike Air Jordan, Yeezy, Off-White, Travis Scott collabs — replicas are mass-produced
   - Trading cards: Pokémon, Magic: The Gathering, sports cards — reprints and re-sealed packs are common
   - Luxury watches: Rolex, AP, Patek — high-quality fakes are widespread
   - Electronics: AirPods, iPhones, GPUs — counterfeits and "frankensteined" units exist
   - Autographed memorabilia: jerseys, photos — forgeries are extremely common
   - Vintage / rare collectibles: coins, stamps, vintage toys — fakes and reproductions abound
   - Streetwear / hype brands: Supreme, BAPE, Palace — fakes are mass-produced

2. PRICE SIGNALS
   If the asking price is dramatically below what this item normally sells for in its stated condition,
   that is a major fraud signal. Use your training knowledge of current market prices.

3. DESCRIPTION RED FLAGS
   - Vague or evasive language about provenance or authenticity
   - Claimed condition inconsistent with age or described wear
   - "Authenticity certificates" for items that don't issue them, or easily forged ones
   - Missing serial numbers, tags, or packaging that genuine items always have

4. COMMON SCAM PATTERNS
   - Replica sold as genuine (most common)
   - Switch-and-bait: different item shipped than pictured
   - Refurbished or repaired sold as fully original
   - Stolen goods with serial numbers removed
   - Counterfeit grading labels (PSA/BGS slabs can be tampered with)
   - "Too good to be true" deals designed to move inventory fast

SCORING GUIDE:
  0.0–0.2  Low risk. Category rarely faked; no meaningful red flags.
  0.2–0.4  Moderate risk. Some counterfeiting exists; standard caution applies.
  0.4–0.6  Elevated risk. Commonly faked category or brand; specific inspection recommended.
  0.6–0.8  High risk. Strongly associated with fraud; multiple red flags present.
  0.8–1.0  Very high risk. Extremely commonly faked and/or critical red flags present.

Return ONLY valid JSON — no markdown, no explanation:
{{
  "fraud_score": <number 0.0–1.0>,
  "commonly_counterfeited": <true or false>,
  "red_flags": ["<specific actionable flag>", ...],
  "message": "<2–4 sentence human-readable summary: what makes this item risky and exactly what a buyer should check or demand before purchasing>"
}}"""


# ─── Route ────────────────────────────────────────────────────────────────────

@fraud_bp.route("/api/fraudCheck", methods=["POST"])
def fraud_check():
    data = request.get_json(silent=True) or {}
    item_id = data.get("item_id")
    if not item_id:
        return jsonify({"error": "item_id required"}), 400

    conn = get_conn()
    try:
        # 1. Load item
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, brand, category, description, year, sale_cost FROM items WHERE id = %s",
                (item_id,),
            )
            row = cur.fetchone()

        if row is None:
            return jsonify({"error": "Item not found"}), 404

        item = {
            "id":          row[0],
            "name":        row[1],
            "brand":       row[2],
            "category":    row[3],
            "description": row[4],
            "year":        row[5],
            "sale_cost":   float(row[6]) if row[6] is not None else None,
        }

        # 2. Ask Gemini
        prompt = _build_prompt(item)
        try:
            response = _get_gemini().models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            raw = response.text.strip()
            if raw.startswith("```"):
                import re
                raw = re.sub(r"^```(?:json)?\n?", "", raw)
                raw = re.sub(r"\n?```$", "", raw)
            gemini_data = json.loads(raw)
        except Exception as e:
            return jsonify({"error": f"Gemini error: {e}"}), 500

        fraud_score = float(gemini_data.get("fraud_score", 0))
        message     = gemini_data.get("message", "")
        red_flags   = gemini_data.get("red_flags", [])

        # 3. Only persist and alert if score crosses threshold
        if fraud_score < FRAUD_THRESHOLD:
            return jsonify({}), 200

        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO fraud_alerts (item_id, fraud_score, message, red_flags)
                   VALUES (%s, %s, %s, %s) RETURNING id""",
                (item["id"], fraud_score, message, json.dumps(red_flags)),
            )
            fraud_alert_id = cur.fetchone()[0]
        conn.commit()

        return jsonify({"fraud_alert_id": fraud_alert_id}), 201

    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        release_conn(conn)
