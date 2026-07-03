import hashlib
import os
import json
import time

def hash_password(password: str, salt: bytes = None) -> str:
    if not salt:
        salt = os.urandom(16)
    pw_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return f"{salt.hex()}:{pw_hash.hex()}"

email = "jasmine.shen@wavenet.com.tw"
password = "Wavenet123"
hashed = hash_password(password)

users_path = r"d:\Antigravity project\Atlas\data\users.json"
with open(users_path, "r", encoding="utf-8") as f:
    users = json.load(f)

# Check if already exists
if any(u["email"] == email for u in users):
    print(f"User {email} already exists.")
else:
    users.append({
        "email": email,
        "password_hash": hashed,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S+08:00", time.localtime())
    })
    with open(users_path, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)
    print(f"Successfully added user {email}")
