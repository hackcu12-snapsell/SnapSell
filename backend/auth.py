import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from flask import Blueprint, jsonify, request

from db import get_conn, release_conn

auth_bp = Blueprint("auth", __name__)

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_EXPIRY_DAYS = 7


def get_current_user_id():
    """Return user id (int) from Authorization Bearer token, or None if missing/invalid."""
    auth = request.headers.get("Authorization")
    token = None
    if auth and auth.startswith("Bearer "):
        token = auth[7:].strip()
    if not token:
        # Fallback: some proxies strip Authorization; allow X-Auth-Token
        token = request.headers.get("X-Auth-Token")
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        sub = payload.get("sub")
        return int(sub) if sub is not None else None
    except jwt.ExpiredSignatureError:
        print("[auth] Token expired")
        return None
    except jwt.InvalidTokenError as e:
        print(f"[auth] Invalid token: {type(e).__name__}")
        return None
    except (ValueError, TypeError) as e:
        print(f"[auth] Token decode error: {e}")
        return None


def _make_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),  # JWT spec expects sub to be a string
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _unique_username(cur, base: str) -> str:
    """Return base username or base+N if already taken."""
    username = base
    suffix = 1
    while True:
        cur.execute("SELECT 1 FROM users WHERE username = %s", (username,))
        if not cur.fetchone():
            return username
        username = f"{base}{suffix}"
        suffix += 1


@auth_bp.route("/signup", methods=["POST"])
def signup():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"success": False, "error": "Email and password required"}), 400
    if len(password) < 8:
        return jsonify({"success": False, "error": "Password must be at least 8 characters"}), 400

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM users WHERE email = %s", (email,))
            if cur.fetchone():
                return jsonify({"success": False, "error": "Email already in use"}), 409

            username = _unique_username(cur, email.split("@")[0])

            cur.execute(
                "INSERT INTO users (email, username, password_hash) VALUES (%s, %s, %s) RETURNING id",
                (email, username, password_hash),
            )
            user_id = cur.fetchone()[0]
            conn.commit()

        token = _make_token(user_id)
        return jsonify({"success": True, "userID": user_id, "token": token, "username": username})

    except Exception:
        conn.rollback()
        return jsonify({"success": False, "error": "Signup failed"}), 500
    finally:
        release_conn(conn)


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"success": False, "error": "Email and password required"}), 400

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username, password_hash FROM users WHERE email = %s", (email,)
            )
            row = cur.fetchone()

        if not row or not bcrypt.checkpw(password.encode(), row[2].encode()):
            # Same message for both cases — don't leak whether email exists
            return jsonify({"success": False, "error": "Invalid email or password"}), 401

        token = _make_token(row[0])
        return jsonify({
            "success": True,
            "userID": row[0],
            "token": token,
            "username": row[1],
            "userFirstName": None,
            "userLastName": None,
        })

    except Exception:
        return jsonify({"success": False, "error": "Login failed"}), 500
    finally:
        release_conn(conn)
