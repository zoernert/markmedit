#!/bin/bash
set -e

echo "🚀 MarkMEdit Setup"
echo "=================="
echo

# Prüfe ob .env existiert
if [ ! -f .env ]; then
    echo "📝 Erstelle .env Datei..."
    cp .env.example .env
    echo "⚠️  WICHTIG: Bitte .env Datei mit deinen API Keys bearbeiten!"
    echo "   - GEMINI_API_KEY"
    echo "   - MCP_SERVERS (falls externe MCP-Dienste genutzt werden sollen)"
    echo
    read -p "Drücke Enter wenn du bereit bist..."
fi

# Erstelle Datenverzeichnis
echo "📁 Erstelle Datenverzeichnis..."
mkdir -p data/documents

# Backend Setup
echo "📦 Installiere Backend Dependencies..."
cd backend
npm install
cd ..

# Frontend Setup
echo "📦 Installiere Frontend Dependencies..."
cd frontend
npm install
cd ..

echo
echo "✅ Setup abgeschlossen!"
echo
echo "Nächste Schritte:"
echo "  1. Bearbeite .env Datei mit deinen API Keys"
echo "  2. Starte mit: npm run dev (beide Terminals)"
echo "     - Backend: cd backend && npm run dev"
echo "     - Frontend: cd frontend && npm run dev"
echo
echo "  Oder mit Docker:"
echo "     docker-compose up -d"
echo
echo "📚 Öffne http://localhost:3000 im Browser"
