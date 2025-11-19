#!/bin/bash
set -e

echo "🚀 MarkMEdit Server Deployment"
echo "==============================="
echo "Server: 10.0.0.14"
echo "Ports: Frontend=3000, Backend=3001"
echo

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SERVER="root@10.0.0.14"
DEPLOY_DIR="/opt/markmedit"

echo -e "${YELLOW}📦 Schritt 1: Projekt vorbereiten${NC}"

# Erstelle .env wenn nicht vorhanden
if [ ! -f .env ]; then
    echo "Erstelle .env aus .env.server..."
    cp .env.server .env
    echo -e "${YELLOW}⚠️  WICHTIG: Füge deinen GEMINI_API_KEY in .env hinzu!${NC}"
    read -p "Gemini API Key eingeben (oder Enter für später): " GEMINI_KEY
    if [ ! -z "$GEMINI_KEY" ]; then
        sed -i "s/GEMINI_API_KEY=/GEMINI_API_KEY=$GEMINI_KEY/" .env
    fi
fi

echo
echo -e "${YELLOW}📤 Schritt 2: Auf Server kopieren${NC}"

# Erstelle Verzeichnis auf Server
ssh $SERVER "mkdir -p $DEPLOY_DIR"

# Kopiere Dateien (außer node_modules, data, etc.)
echo "Kopiere Projekt-Dateien..."
rsync -av --progress \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude 'build' \
    --exclude 'data' \
    --exclude '.git' \
    --exclude '*.log' \
    ./ $SERVER:$DEPLOY_DIR/

echo
echo -e "${YELLOW}🐋 Schritt 3: Docker auf Server prüfen${NC}"

# Prüfe Docker Installation
if ! ssh $SERVER "command -v docker &> /dev/null"; then
    echo -e "${RED}Docker nicht gefunden. Installiere Docker...${NC}"
    ssh $SERVER "curl -fsSL https://get.docker.com | sh"
    ssh $SERVER "systemctl enable docker && systemctl start docker"
fi

if ! ssh $SERVER "command -v docker-compose &> /dev/null"; then
    echo -e "${RED}Docker Compose nicht gefunden. Installiere Docker Compose...${NC}"
    ssh $SERVER 'curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose'
    ssh $SERVER "chmod +x /usr/local/bin/docker-compose"
fi

echo
echo -e "${YELLOW}🏗️  Schritt 4: Container bauen und starten${NC}"

ssh $SERVER "cd $DEPLOY_DIR && docker-compose -f docker-compose.server.yml down || true"
ssh $SERVER "cd $DEPLOY_DIR && docker-compose -f docker-compose.server.yml build"
ssh $SERVER "cd $DEPLOY_DIR && docker-compose -f docker-compose.server.yml up -d"

echo
echo -e "${YELLOW}⏳ Warte auf Container-Start...${NC}"
sleep 10

echo
echo -e "${YELLOW}🔍 Schritt 5: Status prüfen${NC}"

echo "Container Status:"
ssh $SERVER "cd $DEPLOY_DIR && docker-compose -f docker-compose.server.yml ps"

echo
echo "Backend Health Check:"
ssh $SERVER "curl -s http://localhost:3001/health | jq ." || echo "Health Check fehlgeschlagen oder jq nicht installiert"

echo
echo -e "${GREEN}✅ Deployment abgeschlossen!${NC}"
echo
echo "📊 Zugriff:"
echo "   Frontend: http://10.0.0.14:3000"
echo "   Backend:  http://10.0.0.14:3001"
echo
echo "📝 Nützliche Befehle:"
echo "   Logs ansehen:     ssh $SERVER 'cd $DEPLOY_DIR && docker-compose -f docker-compose.server.yml logs -f'"
echo "   Status prüfen:    ssh $SERVER 'cd $DEPLOY_DIR && docker-compose -f docker-compose.server.yml ps'"
echo "   Neustart:         ssh $SERVER 'cd $DEPLOY_DIR && docker-compose -f docker-compose.server.yml restart'"
echo "   Stoppen:          ssh $SERVER 'cd $DEPLOY_DIR && docker-compose -f docker-compose.server.yml down'"
echo
echo -e "${YELLOW}⚠️  Firewall-Hinweis:${NC}"
echo "Falls nicht erreichbar, prüfe Firewall-Regeln:"
echo "   ssh $SERVER 'ufw status'"
echo "   ssh $SERVER 'ufw allow 3000/tcp && ufw allow 3001/tcp'"
