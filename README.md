# MarkMEdit - KI-gestützter Knowledge Worker

Ein selbstgehosteter Service zum Erstellen und Bearbeiten von Wissensspeichern mit integrierter KI-Unterstützung.

## ✨ Features

- 📝 **Rich Markdown Editor** mit Monaco Editor
  - Live Preview (Editor, Split, Preview Modi)
  - Syntax Highlighting
  - Code Folding
  - 🖼️ **Bild-Upload** mit Drag & Drop, automatischer Optimierung und Thumbnails
  - 📊 **Mermaid-Diagramme** für Flowcharts, Sequenzdiagramme, Gantt, etc.
  - 📋 **Tabellen-Editor** mit WYSIWYG-Interface
- 🤖 **KI-Assistent** powered by Google Gemini
  - Textgenerierung und -verbesserung
  - Zusammenfassungen
  - Übersetzungen
  - Code-Generierung
- 🔬 **Research Tools** für wissenschaftliche Texte
  - Podcast-Skripte generieren
  - Zitate und Referenzen erstellen
  - Forschungsfragen entwickeln
- 🎬 **Präsentations-Konverter**
  - Markdown → HTML Präsentation
  - Reveal.js Integration
  - Download als standalone HTML
- 📚 **Dokumenten-Management**
  - Hierarchische Struktur mit Ordnern
  - Versions-Historie mit Git
  - Tagging und Metadaten
- � **Echtzeit-Kollaboration** (in Entwicklung)
  - WebSocket-basiert
  - Y.js CRDT für Konfliktlösung
- 🔌 **MCP (Model Context Protocol) Integration**
  - Willi-Mako: Energiemarkt-Fachwissen
  - Powabase: Energiemarkt-Daten (MaStR)
  - Erweiterbar für weitere MCP-Server
- 💾 **Export-Funktionen**
  - PDF Export
  - DOCX Export (geplant)
  - LaTeX Export (geplant)
  - EPUB Export (geplant)

## Architektur

```
Frontend (React)
  └── Monaco Editor
  └── Document Browser
  └── AI Assistant Panel
  └── Export Wizard

Backend (Node.js + Express)
  └── Document API (CRUD + Git)
  └── MCP Client (HTTP)
  └── Gemini API Integration
  └── Export Engine

Storage
  └── Git Repository (Dokumente)
  └── SQLite/PostgreSQL (Metadaten)
```

## Installation

### Voraussetzungen
- Docker & Docker Compose
- Node.js 20+ (für lokale Entwicklung)
- Google Gemini API Key
- Optional: Zugangsdaten zu eigenen MCP-Servern

### Quick Start

```bash
# Umgebungsvariablen konfigurieren
cp .env.example .env
# Editiere .env und füge deine API Keys hinzu

# Mit Docker Compose starten
docker-compose up -d

# Öffne http://localhost:3000
```

### Lokale Entwicklung

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

## Konfiguration

### .env Beispiel
```env
# Gemini API
GEMINI_API_KEY=your_gemini_api_key_here

# MCP Server (Beispiel)
MCP_SERVERS=[
  {
    "id": "energy-knowledge",
    "name": "Energy Knowledge MCP",
    "url": "https://mcp.example.com/",
    "type": "http",
    "description": "Fachwissen zu Energiemarkt, Regulierung und EDIFACT"
  }
]

# Database
DATABASE_TYPE=sqlite
DATABASE_PATH=./data/markmedit.db

# Git Storage
GIT_REPO_PATH=./data/documents

# Server
PORT=3001
NODE_ENV=development
```

## Workflow

### 1. Dokument erstellen
- Erstelle ein neues "Book" (Wissensspeicher)
- Strukturiere mit Kapiteln und Abschnitten
- Nutze Markdown für die Formatierung

### 2. KI-gestützte Bearbeitung
- **Struktur generieren**: LLM erstellt Outline basierend auf Thema
- **Abschnitt erweitern**: KI schreibt detaillierte Abschnitte
- **Formulierungen verbessern**: Textoptimierung
- **Analysen einholen**: Nutze MCP-Services für Energiemarkt-Themen

### 3. Wissensspeicher pflegen
- Chat mit dem LLM über dein Dokument
- Iterative Verbesserungen
- Versionskontrolle via Git
- Kollaboration mit Team

### 4. Export & Präsentation
- Whitepapers als PDF
- Präsentationen als Reveal.js
- Slideshows für Meetings
- Quellenangaben und Zitate

## API Endpunkte

### Documents
```
GET    /api/documents          # Liste aller Dokumente
GET    /api/documents/:id      # Dokument abrufen
POST   /api/documents          # Neues Dokument erstellen
PUT    /api/documents/:id      # Dokument aktualisieren
DELETE /api/documents/:id      # Dokument löschen
GET    /api/documents/:id/history  # Git-Historie
```

### AI Operations
```
POST   /api/ai/generate-outline      # Struktur generieren
POST   /api/ai/expand-section        # Abschnitt erweitern
POST   /api/ai/improve-text          # Text verbessern
POST   /api/ai/summarize             # Zusammenfassung erstellen
POST   /api/ai/chat                  # Chat mit Kontext
```

### MCP Integration
```
POST   /api/mcp/search               # MCP Semantic Search
POST   /api/mcp/chat                 # MCP Chat
POST   /api/mcp/analyze              # Energie-spezifische Analyse (MCP Tool)
```

### Export
```
POST   /api/export/markdown          # Markdown Export
POST   /api/export/reveal            # Reveal.js Präsentation
POST   /api/export/pdf               # PDF Export
POST   /api/export/html              # HTML Export
```

## Technologie-Stack

### Backend
- Node.js 20+
- Express.js
- TypeScript
- @modelcontextprotocol/sdk (MCP Client)
- @google/generative-ai (Gemini)
- simple-git (Git Integration)
- SQLite3 / PostgreSQL

### Frontend
- React 18
- TypeScript
- Monaco Editor
- TailwindCSS
- React Query
- Zustand (State Management)

## Lizenz

MIT License - siehe LICENSE Datei

## Roadmap

- [x] Grundlegende Architektur
- [ ] Backend API Implementation
- [ ] Frontend React App
- [ ] MCP Services Integration
- [ ] Gemini AI Integration
- [ ] Export Engine (Reveal.js, PDF)
- [ ] Docker Deployment
- [ ] Kollaborations-Features
- [ ] Plugin-System für weitere LLMs
- [ ] Offline-Modus
