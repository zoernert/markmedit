# MarkMEdit - Quick Start Guide

## 🚀 Schnellstart (Empfohlen: Docker)

### Voraussetzungen
- Docker & Docker Compose installiert
- Google Gemini API Key ([hier erstellen](https://makersuite.google.com/app/apikey))
- Optional: Zugang zu MCP-Servern

### Installation

```bash
# 1. Repository klonen oder herunterladen
cd markmedit

# 2. .env Datei erstellen
cp .env.example .env

# 3. API Keys in .env eintragen
# Öffne .env mit einem Editor und füge hinzu:
GEMINI_API_KEY=dein_gemini_api_key_hier

# Optional: MCP-Server konfigurieren
MCP_SERVERS=[
   {
      "id": "energy-knowledge",
      "name": "Energy Knowledge MCP",
      "url": "https://mcp.example.com/",
      "type": "http",
      "description": "Fachwissen zu Energiemarkt, Regulierung und EDIFACT"
   }
]

# 4. Starten mit Docker
docker-compose up -d

# 5. Öffne Browser
# http://localhost:3000
```

Das war's! 🎉

### Erste Schritte

1. **Dokument erstellen**
   - Klicke auf "+ Neues Dokument"
   - Gib einen Titel ein
   - Beginne mit dem Schreiben

2. **KI nutzen**
   - Öffne KI-Assistent (🤖 Button)
   - Wähle eine Funktion:
     - ✨ Abschnitt erweitern
     - 📝 Text verbessern
     - 📊 Zusammenfassung
   - 🔍 MCP-Suche ausführen

3. **Exportieren**
   - Klicke auf "Export"
   - Wähle Format: Markdown, Reveal.js, HTML, PDF
   - Download

## 💻 Lokale Entwicklung (ohne Docker)

### Voraussetzungen
- Node.js 20+
- npm oder pnpm

### Setup

```bash
# 1. Setup-Script ausführen
chmod +x setup.sh
./setup.sh

# 2. .env konfigurieren (siehe oben)

# 3. Backend starten (Terminal 1)
cd backend
npm run dev

# 4. Frontend starten (Terminal 2)
cd frontend
npm run dev

# 5. Öffne Browser
# http://localhost:3000
```

## 🔑 API Keys erhalten

### Google Gemini
1. Gehe zu https://makersuite.google.com/app/apikey
2. Erstelle neuen API Key
3. Kopiere den Key in `.env` → `GEMINI_API_KEY`

### MCP-Services (Optional)
1. Registriere dich bei deinem bevorzugten MCP-Anbieter
2. Erhalte Zugangsdaten, API-Keys oder Tokens
3. Ergänze die Informationen in `MCP_SERVERS` bzw. weiteren Variablen

## 📁 Projektstruktur

```
markmedit/
├── backend/              # Express API
│   ├── src/
│   │   ├── routes/      # API Endpunkte
│   │   ├── services/    # Business Logic
│   │   ├── db/          # Datenbank
│   │   └── config/      # Konfiguration
│   └── package.json
├── frontend/             # React App
│   ├── src/
│   │   ├── components/  # UI Komponenten
│   │   ├── pages/       # Seiten
│   │   ├── lib/         # Utilities
│   │   └── main.tsx     # Entry Point
│   └── package.json
├── data/                 # Daten (SQLite, Git Repo)
├── docs/                 # Dokumentation
├── docker-compose.yml    # Docker Config
└── .env.example          # Environment Template
```

## 🎯 Hauptfunktionen

### Dokumente verwalten
- Markdown-Editor mit Syntax Highlighting
- Git-basierte Versionskontrolle
- Hierarchische Struktur
- Tags & Kategorien

### KI-Assistenz
- **Gemini 2.5 Flash**: Texte generieren, verbessern, zusammenfassen
- **MCP-Services**: Energiemarkt-Expertise, EDIFACT, Regulierung
- Kontext-bewusste Vorschläge
- Iterative Verbesserungen

### Export
- Markdown (natürlich!)
- Reveal.js Präsentationen
- HTML Dokumente
- PDF (geplant)

### Versionskontrolle
- Automatische Git-Commits
- Historie ansehen
- Änderungen nachverfolgen
- Rollback möglich

## 🛠️ Konfiguration

### Datenbank
Standard: SQLite (keine Konfiguration nötig)

Optional PostgreSQL:
```env
DATABASE_TYPE=postgres
DATABASE_URL=postgresql://user:pass@localhost:5432/markmedit
```

### Git Repository
```env
GIT_REPO_PATH=./data/documents
GIT_AUTO_COMMIT=true
GIT_AUTHOR_NAME=MarkMEdit
GIT_AUTHOR_EMAIL=markmedit@localhost
```

### Features aktivieren/deaktivieren
```env
ENABLE_MCP=true          # MCP-Integration
ENABLE_AI=true           # Gemini AI
ENABLE_EXPORT=true       # Export-Funktionen
ENABLE_GIT_HISTORY=true  # Git Historie
```

## 🐛 Troubleshooting

### Backend startet nicht
```bash
# Prüfe Logs
docker-compose logs backend

# Häufige Ursachen:
# - GEMINI_API_KEY fehlt in .env
# - Port 3001 bereits belegt
# - Datenbankrechte
```

### Frontend zeigt "Connection Error"
```bash
# Prüfe ob Backend läuft
curl http://localhost:3001/health

# Sollte antworten:
# {"status":"ok","timestamp":"..."}
```

### Editor lädt nicht
```bash
# Monaco Editor CDN Problem?
# Prüfe Browser Console (F12)
# Eventuell Firewall/Ad-Blocker
```

### Git Commits funktionieren nicht
```bash
# Prüfe Verzeichnisrechte
ls -la data/documents

# Sollte beschreibbar sein
chmod -R 755 data/documents
```

## 📚 Weiterführende Docs

- [MCP Integration Guide](./docs/MCP_INTEGRATION.md)
- [Workflow-Beispiele](./docs/WORKFLOWS.md)
- [Roadmap](./docs/ROADMAP.md)

## 🤝 Support

- GitHub Issues: [Projekt-URL]
- Dokumentation: `/docs`
- Email: support@markmedit.local (Beispiel)

## 📝 Lizenz

MIT License - siehe LICENSE Datei

---

**Viel Erfolg mit MarkMEdit!** 🚀

Bei Fragen oder Problemen: Erstelle ein GitHub Issue oder kontaktiere uns.
