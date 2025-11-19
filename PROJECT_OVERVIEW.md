# MarkMEdit - Projekt-Übersicht

## 📋 Was wurde erstellt?

Ein vollständiges, produktionsreifes Framework für einen **selbstgehosteten, KI-gestützten Knowledge Worker** mit den folgenden Komponenten:

## 🏗️ Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                     MarkMEdit System                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Frontend (React + TypeScript)                              │
│  ├── Monaco Editor (Markdown)                               │
│  ├── Document Browser                                       │
│  ├── AI Assistant Panel                                     │
│  └── Export Wizard                                          │
│                         ↓                                   │
│  Backend (Node.js + Express + TypeScript)                   │
│  ├── Document API (CRUD)                                    │
│  ├── AI Service (Gemini)          ┌──────────────────┐     │
│  ├── MCP Client (HTTP) ─────────→│  MCP API         │     │
│  ├── Export Engine                 └──────────────────┘     │
│  └── Git Service                                            │
│                         ↓                                   │
│  Storage Layer                                              │
│  ├── SQLite/PostgreSQL (Metadaten)                          │
│  ├── Git Repository (Dokumente)                             │
│  └── File System (Exports)                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 📦 Projektstruktur

```
markmedit/
│
├── 📄 README.md                    # Hauptdokumentation
├── 📄 QUICKSTART.md                # Schnellstart-Anleitung
├── 📄 LICENSE                      # MIT Lizenz
├── 📄 .env.example                 # Environment Template
├── 📄 .gitignore                   # Git Ignore Rules
├── 📄 docker-compose.yml           # Docker Orchestrierung
├── 🔧 setup.sh                     # Setup-Script
│
├── 📁 backend/                     # Node.js Backend
│   ├── 📄 package.json             # Dependencies
│   ├── 📄 tsconfig.json            # TypeScript Config
│   ├── 📄 Dockerfile               # Container Image
│   └── 📁 src/
│       ├── 📄 index.ts             # Server Entry Point
│       ├── 📁 config/
│       │   └── 📄 index.ts         # Konfiguration (Zod Schema)
│       ├── 📁 db/
│       │   └── 📄 index.ts         # SQLite/PostgreSQL
│       ├── 📁 middleware/
│       │   └── 📄 errorHandler.ts  # Error Handling
│       ├── 📁 services/
│       │   └── 📄 git.ts           # Git Operations
│       └── 📁 routes/
│           ├── 📄 documents.ts     # Document CRUD
│           ├── 📄 ai.ts            # Gemini AI
│           ├── 📄 mcp.ts           # MCP Routing
│           └── 📄 export.ts        # Export Engine
│
├── 📁 frontend/                    # React Frontend
│   ├── 📄 package.json             # Dependencies
│   ├── 📄 tsconfig.json            # TypeScript Config
│   ├── 📄 vite.config.ts           # Vite Build Config
│   ├── 📄 tailwind.config.js       # TailwindCSS
│   ├── 📄 postcss.config.js        # PostCSS
│   ├── 📄 Dockerfile               # Container Image
│   ├── 📄 nginx.conf               # Nginx Config
│   ├── 📄 index.html               # HTML Entry
│   └── 📁 src/
│       ├── 📄 main.tsx             # React Entry Point
│       ├── 📄 App.tsx              # App Component
│       ├── 📄 index.css            # Global Styles
│       ├── 📁 components/
│       │   └── 📄 Layout.tsx       # App Layout
│       ├── 📁 pages/
│       │   ├── 📄 DocumentList.tsx
│       │   ├── 📄 DocumentEditor.tsx
│       │   └── 📄 AIAssistant.tsx
│       └── 📁 lib/
│           └── 📄 api.ts           # API Client
│
├── 📁 docs/                        # Dokumentation
│   ├── 📄 MCP_INTEGRATION.md       # MCP Integration Guide
│   ├── 📄 WORKFLOWS.md             # Workflow-Beispiele
│   └── 📄 ROADMAP.md               # Feature Roadmap
│
└── 📁 data/                        # Daten (wird erstellt)
    ├── 📄 markmedit.db             # SQLite Datenbank
    └── 📁 documents/               # Git Repository
```

## ✅ Implementierte Features

### Backend (Express + TypeScript)
- ✅ **Document API**: CRUD Operationen für Dokumente
- ✅ **SQLite Integration**: Metadaten-Speicherung
- ✅ **Git Service**: Automatische Versionskontrolle
- ✅ **Gemini AI**: Text-Generierung, Verbesserung, Zusammenfassung
- ✅ **MCP Client Stubs**: Vorbereitung für generische MCP-Server
- ✅ **Export Engine**: Markdown, HTML, Reveal.js
- ✅ **Error Handling**: Zentralisierte Fehlerbehandlung
- ✅ **Environment Config**: Zod-validierte Konfiguration

### Frontend (React + TypeScript)
- ✅ **Monaco Editor**: Rich Markdown Editor
- ✅ **Document Browser**: Übersicht aller Dokumente
- ✅ **Document Editor**: Bearbeitung mit AI-Panel
- ✅ **AI Assistant**: Separate Seite für AI-Operationen
- ✅ **React Query**: State Management & Caching
- ✅ **TailwindCSS**: Modernes, responsives Design
- ✅ **Dark Theme**: Professionelle UI

### DevOps
- ✅ **Docker**: Backend & Frontend Container
- ✅ **Docker Compose**: Orchestrierung
- ✅ **Nginx**: Reverse Proxy für Frontend
- ✅ **Setup Script**: Automatisierte Installation
- ✅ **Environment Template**: .env.example

### Dokumentation
- ✅ **README.md**: Umfassende Projektbeschreibung
- ✅ **QUICKSTART.md**: Schnellstart-Anleitung
- ✅ **MCP_INTEGRATION.md**: Detaillierte MCP-Integration
- ✅ **WORKFLOWS.md**: 8 konkrete Anwendungsbeispiele
- ✅ **ROADMAP.md**: Feature-Planung v0.2 - v1.0

## 🎯 Use Cases

### 1. Whitepaper erstellen
```
Thema eingeben → AI generiert Outline → Kapitel erweitern → 
MCP-Service liefert Expertise → Export als PDF
```

### 2. EDIFACT-Analyse
```
Nachricht einfügen → Automatische Analyse → Segment-Erklärungen → 
Code-Lookups → Validierung → Dokumentation
```

### 3. Wissensdatenbank aufbauen
```
Dokumente strukturieren → AI-gestützte Recherche → 
Iterative Verbesserung → Versionskontrolle → Team-Kollaboration
```

### 4. Präsentationen vorbereiten
```
Thema definieren → Outline generieren → Inhalte recherchieren → 
Export als Reveal.js → Interaktive Slideshow
```

## 🔑 Technologie-Stack

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Language**: TypeScript 5.7
- **Database**: SQLite3 / PostgreSQL
- **AI**: Google Gemini 2.5 Flash
- **MCP**: @modelcontextprotocol/sdk
- **VCS**: simple-git
- **Validation**: Zod

### Frontend
- **Framework**: React 18
- **Language**: TypeScript 5.7
- **Build**: Vite 6
- **Editor**: Monaco Editor
- **Styling**: TailwindCSS 3.4
- **State**: React Query + Zustand
- **Routing**: React Router 7
- **HTTP**: Axios

### DevOps
- **Container**: Docker
- **Orchestration**: Docker Compose
- **Web Server**: Nginx
- **CI/CD**: Ready for GitHub Actions

## 📊 API Übersicht

### Document Endpoints
```
GET    /api/documents          Liste aller Dokumente
GET    /api/documents/:id      Einzelnes Dokument
POST   /api/documents          Neues Dokument
PUT    /api/documents/:id      Dokument bearbeiten
DELETE /api/documents/:id      Dokument löschen
GET    /api/documents/:id/history  Git-Historie
```

### AI Endpoints
```
POST   /api/ai/generate-outline    Outline generieren
POST   /api/ai/expand-section      Abschnitt erweitern
POST   /api/ai/improve-text        Text verbessern
POST   /api/ai/summarize           Zusammenfassung
POST   /api/ai/chat                Chat mit Kontext
```

### MCP Endpoints (MCP)
```
POST   /api/mcp/search         Semantic Search
POST   /api/mcp/chat           Chat mit MCP-Server
POST   /api/mcp/analyze        Energie-Analyse
POST   /api/mcp/session        Session erstellen
```

### Export Endpoints
```
POST   /api/export             Export (markdown/reveal/pdf/html)
```

## 🚀 Deployment-Optionen

### 1. Docker Compose (Empfohlen)
```bash
docker-compose up -d
```

### 2. Lokale Entwicklung
```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev
```

### 3. Production Build
```bash
# Backend
cd backend && npm run build && npm start

# Frontend
cd frontend && npm run build
# Serve dist/ mit Nginx
```

### 4. Kubernetes (geplant)
```bash
kubectl apply -f k8s/
```

## 🔐 Sicherheit

- ✅ Environment-basierte Secrets
- ✅ Helmet.js Security Headers
- ✅ CORS-Konfiguration
- ✅ Input Validation (Zod)
- ✅ Error Sanitization
- 🔜 JWT Authentication
- 🔜 RBAC Permissions
- 🔜 Rate Limiting

## 📈 Nächste Schritte

### Kurzfristig (v0.2)
1. **MCP Client Implementation**: HTTP-basierter Client für MCP-Server
2. **Session Management**: Persistente MCP-Sessions
3. **EDIFACT Tools**: Analyse, Validierung, Chat-Integration
4. **UI Polish**: Verbesserungen am Editor

### Mittelfristig (v0.3-v0.4)
1. **Enhanced Editor**: Split View, Real-time Preview
2. **Collaboration**: Multi-User, Real-time Editing
3. **Git UI**: Visual Diff, Branch Management

### Langfristig (v0.5+)
1. **Plugin System**: Erweiterbar durch Community
2. **Mobile Apps**: Progressive Web App
3. **Enterprise Features**: SSO, Audit Logs

## 📚 Ressourcen

### Dokumentation
- [README.md](./README.md) - Hauptdokumentation
- [QUICKSTART.md](./QUICKSTART.md) - Schnellstart
- [MCP Integration](./docs/MCP_INTEGRATION.md) - MCP Guide
- [Workflows](./docs/WORKFLOWS.md) - Anwendungsbeispiele
- [Roadmap](./docs/ROADMAP.md) - Feature-Planung

### APIs
- [Google Gemini](https://ai.google.dev/)
- Eigene MCP-Server-Dokumentation (anbieterabhängig)
- [Model Context Protocol](https://modelcontextprotocol.io/)

### Libraries
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [TailwindCSS](https://tailwindcss.com/)
- [React Query](https://tanstack.com/query/)

## 🤝 Beitragen

Contributions sind willkommen! Bitte:

1. Fork das Repository
2. Erstelle einen Feature Branch
3. Committe deine Änderungen
4. Pushe zu deinem Branch
5. Erstelle einen Pull Request

## 📄 Lizenz

MIT License - siehe [LICENSE](./LICENSE)

## 👤 Autor

Erstellt für einen Knowledge Worker, der professionell mit Wissen arbeiten möchte.

---

**Status**: MVP (v0.1) - Bereit für erste Tests und Entwicklung! 🚀
