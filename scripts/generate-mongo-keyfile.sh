#!/bin/bash
# ============================================================
# scripts/generate-mongo-keyfile.sh
# MongoDB replica set ke liye keyfile generate karo
# Ek baar chalao — Hetzner setup ke time
# ============================================================

KEYFILE_PATH="./mongo/keyfile"

mkdir -p ./mongo

if [ -f "$KEYFILE_PATH" ]; then
    echo "✅ Keyfile already exists at $KEYFILE_PATH"
    exit 0
fi

# Keyfile generate karo
openssl rand -base64 756 > "$KEYFILE_PATH"
chmod 400 "$KEYFILE_PATH"

echo "✅ MongoDB keyfile generated at $KEYFILE_PATH"
echo "⚠️  Ye file KABHI git mein push mat karo!"
echo "⚠️  Sab 3 mongo containers issi file ko use karenge (volume mount se)"