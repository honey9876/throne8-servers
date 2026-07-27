#!/bin/bash
# ============================================================
# scripts/build-push.sh — LOCAL par chalao
# Docker image build karke Docker Hub par push karo
# Usage: ./scripts/build-push.sh [tag]
# Example: ./scripts/build-push.sh v1.0.0
# ============================================================

set -e

# ── Config ───────────────────────────────────────────────────
DOCKER_USER="yourdockerhubusername"    # ← apna Docker Hub username
IMAGE_NAME="thronet-server"
DOCKERFILE_PATH="./server/thronet-server"
TAG=${1:-latest}
FULL_IMAGE="$DOCKER_USER/$IMAGE_NAME:$TAG"

echo "════════════════════════════════════════"
echo "  Building: $FULL_IMAGE"
echo "  Context:  $DOCKERFILE_PATH"
echo "════════════════════════════════════════"

# ── Pre-checks ───────────────────────────────────────────────
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker daemon chal nahi raha!"
    exit 1
fi

if [ ! -f "$DOCKERFILE_PATH/Dockerfile" ]; then
    echo "❌ Dockerfile nahi mila at $DOCKERFILE_PATH/Dockerfile"
    exit 1
fi

# ── Build ────────────────────────────────────────────────────
echo ""
echo "🔨 Step 1/3: Building Docker image..."
docker build \
    --platform linux/amd64 \
    --tag "$FULL_IMAGE" \
    --tag "$DOCKER_USER/$IMAGE_NAME:latest" \
    --file "$DOCKERFILE_PATH/Dockerfile" \
    "$DOCKERFILE_PATH"

echo "✅ Build complete!"

# ── Push ─────────────────────────────────────────────────────
echo ""
echo "📤 Step 2/3: Pushing to Docker Hub..."
echo "   (docker login karo agar nahi hua: docker login)"
docker push "$FULL_IMAGE"
docker push "$DOCKER_USER/$IMAGE_NAME:latest"

echo "✅ Push complete!"

# ── Instructions ─────────────────────────────────────────────
echo ""
echo "📋 Step 3/3: Hetzner par ye commands chalao:"
echo "════════════════════════════════════════"
echo "  ssh root@YOUR_HETZNER_IP"
echo "  cd /opt/app"
echo "  docker compose -f docker-compose.prod.yml pull"
echo "  docker compose -f docker-compose.prod.yml up -d"
echo "════════════════════════════════════════"
echo ""
echo "✅ Done! Image: $FULL_IMAGE"