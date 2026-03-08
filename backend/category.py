"""
Two-step eBay category resolution using Gemini.

Step 1: Pick the best top-level category from ~30 options.
Step 2: Pick the best leaf category from the children of that top-level.

If a top-level has >150 leaves, we pre-filter by keyword scoring before
sending to Gemini to keep the prompt fast and cheap.
"""

import json
import os
import re
from functools import lru_cache

CATEGORY_FILE = os.path.join(os.path.dirname(__file__), "categoryMappings.json")
MAX_LEAVES_IN_PROMPT = 150


@lru_cache(maxsize=1)
def _load():
    """Parse category tree once and cache. Returns (top_list, leaves_by_top_id)."""
    with open(CATEGORY_FILE) as f:
        data = json.load(f)

    tops = []
    leaves_by_top = {}

    for top_node in data["rootCategoryNode"]["childCategoryTreeNodes"]:
        cat = top_node["category"]
        tops.append({"id": cat["categoryId"], "name": cat["categoryName"]})
        leaves = []
        _collect_leaves(top_node, leaves)
        leaves_by_top[cat["categoryId"]] = leaves

    return tops, leaves_by_top


def _collect_leaves(node: dict, out: list):
    if node.get("leafCategoryTreeNode"):
        cat = node["category"]
        out.append({"id": cat["categoryId"], "name": cat["categoryName"]})
        return
    for child in node.get("childCategoryTreeNodes", []):
        _collect_leaves(child, out)


def _extract_id(text: str, valid_ids: set) -> str | None:
    text = text.strip()
    if text in valid_ids:
        return text
    match = re.search(r"\d+", text)
    if match and match.group() in valid_ids:
        return match.group()
    return None


def _keyword_filter(leaves: list, query: str, limit: int) -> list:
    """Pre-filter large leaf lists by keyword overlap before sending to Gemini."""
    words = set(query.lower().split())
    scored = []
    for leaf in leaves:
        leaf_words = set(leaf["name"].lower().split())
        score = len(words & leaf_words)
        scored.append((score, leaf))
    scored.sort(key=lambda x: -x[0])
    return [leaf for _, leaf in scored[:limit]]


def resolve_category(client, name: str, description: str, category_hint: str) -> str:
    """
    Resolve item details to an eBay leaf category ID.
    Makes two fast Gemini calls (top-level pick, then leaf pick).
    Falls back gracefully if Gemini returns an unexpected value.
    """
    tops, leaves_by_top = _load()
    query = f"{name} {category_hint} {description[:200]}"

    # --- Step 1: pick top-level category ---
    top_options = "\n".join(f"{t['id']}: {t['name']}" for t in tops)
    top_prompt = f"""Pick the best eBay top-level category for this item. Reply with ONLY the category ID number.

Item: {name}
Category hint: {category_hint}
Brief description: {description[:300]}

Options:
{top_options}"""

    top_resp = client.models.generate_content(
        model="gemini-2.5-flash", contents=[top_prompt]
    )
    valid_top_ids = {t["id"] for t in tops}
    top_id = _extract_id(top_resp.text, valid_top_ids) or tops[0]["id"]

    # --- Step 2: pick leaf category ---
    leaves = leaves_by_top.get(top_id, [])
    if not leaves:
        return top_id  # non-leaf fallback

    if len(leaves) > MAX_LEAVES_IN_PROMPT:
        leaves = _keyword_filter(leaves, query, MAX_LEAVES_IN_PROMPT)

    leaf_options = "\n".join(f"{l['id']}: {l['name']}" for l in leaves)
    leaf_prompt = f"""Pick the most specific matching eBay listing category for this item. Reply with ONLY the category ID number.

Item: {name}
Category hint: {category_hint}
Brief description: {description[:300]}

Options:
{leaf_options}"""

    leaf_resp = client.models.generate_content(
        model="gemini-2.5-flash", contents=[leaf_prompt]
    )
    valid_leaf_ids = {l["id"] for l in leaves}
    leaf_id = _extract_id(leaf_resp.text, valid_leaf_ids)

    return leaf_id or (leaves[0]["id"] if leaves else top_id)
