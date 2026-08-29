#!/bin/bash
# ============================================================
# scripts/hetzner-setup.sh
# Hetzner server par PEHLI BAAR chalao (root se)
# Usage: ssh root@IP "bash -s" < scripts/hetzner-setup.sh
# ============================================================

set -e

DOMAIN="yourdomain.com"      # ← apna domain
APP_DIR="/opt/app"

echo "════════════════════════════════════════"
echo "  Hetzner Server Setup"
echo "════════════════════════════════════════"

# ── 1. System Update ──────────────────────────────────────
echo ""
echo "📦 Step 1: System update..."
apt-get update -qq
apt-get upgrade -y -qq

# ── 2. Docker Install ─────────────────────────────────────
echo ""
echo "🐳 Step 2: Docker install..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    echo "✅ Docker installed"
else
    echo "✅ Docker already installed"
fi

# Docker Compose plugin
apt-get install -y -qq docker-compose-plugin

# ── 3. Firewall (UFW) ─────────────────────────────────────
echo ""
echo "🔥 Step 3: Firewall setup..."
apt-get install -y -qq ufw

ufw default deny incoming
ufw default allow outgoing

# Allowed ports
ufw allow 22/tcp    comment 'SSH'
ufw allow 80/tcp    comment 'HTTP'
ufw allow 443/tcp   comment 'HTTPS'

# Block dangerous ports explicitly
ufw deny 7001/tcp comment 'Redis - block public'
ufw deny 7002/tcp comment 'Redis - block public'
ufw deny 7003/tcp comment 'Redis - block public'
ufw deny 27017/tcp comment 'MongoDB - block public'
ufw deny 4000/tcp  comment 'App - behind Nginx'

# Enable (non-interactive)
echo "y" | ufw enable
ufw status

echo "✅ Firewall configured"

# ── 4. App Directory ──────────────────────────────────────
echo ""
echo "📁 Step 4: App directory..."
mkdir -p $APP_DIR/nginx/logs
mkdir -p $APP_DIR/logs
mkdir -p $APP_DIR/mongo
mkdir -p $APP_DIR/scripts
chmod 755 $APP_DIR

echo "✅ Directory: $APP_DIR"

# ── 5. SSL Certificate ────────────────────────────────────
echo ""
echo "🔒 Step 5: SSL Certificate (Let's Encrypt)..."
apt-get install -y -qq certbot

# Nginx band karke standalone mode mein certificate lo
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "admin@$DOMAIN" \
        -d "$DOMAIN" \
        -d "www.$DOMAIN"
    echo "✅ SSL certificate created"
else
    echo "✅ SSL certificate already exists"
fi

# Auto-renewal cron
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --deploy-hook 'docker exec nginx-gateway nginx -s reload'") | crontab -
echo "✅ Auto-renewal cron set"

# ── 6. Systemd Service ────────────────────────────────────
echo ""
echo "⚙️  Step 6: Systemd service..."
cat > /etc/systemd/system/thronet-app.service << EOF
[Unit]
Description=Thronet Application Stack
After=docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable thronet-app
echo "✅ Systemd service created (auto-start on reboot)"

# ── 7. Summary ────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "✅ SERVER SETUP COMPLETE!"
echo ""
echo "Ab ye steps karo:"
echo ""
echo "1. Local se files copy karo:"
echo "   scp docker-compose.prod.yml root@IP:$APP_DIR/"
echo "   scp .env.production root@IP:$APP_DIR/"
echo "   scp nginx/nginx.conf root@IP:$APP_DIR/nginx/"
echo "   scp scripts/mongo-init.sh root@IP:$APP_DIR/scripts/"
echo ""
echo "2. Hetzner par keyfile generate karo:"
echo "   cd $APP_DIR && bash scripts/generate-mongo-keyfile.sh"
echo ""
echo "3. Docker Hub se image pull karke start karo:"
echo "   cd $APP_DIR"
echo "   docker compose -f docker-compose.prod.yml pull"
echo "   docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "4. Logs dekho:"
echo "   docker compose -f docker-compose.prod.yml logs -f thronet-server"
echo "════════════════════════════════════════"