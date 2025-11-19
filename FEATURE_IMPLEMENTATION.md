# MarkMEdit - Feature Implementierung & Roadmap

## ✅ Neu implementierte Features (Vergleich zu HedgeDoc & Open-Notebook)

### 🔐 User Authentication & Management (✓ IMPLEMENTIERT)

Inspiriert von HedgeDoc's robustem Auth-System:

#### Backend Features:
- **JWT-basierte Authentifizierung** mit bcrypt Password-Hashing
- **User Registration & Login** mit E-Mail-Validierung
- **Session Management** mit Token-basierter Autorisierung
- **Profile Management** - Benutzer können Display Name und E-Mail ändern
- **Password Management** - Sichere Passwortänderung mit Validierung

#### Datenbankschema:
```sql
users (id, username, email, password_hash, display_name, created_at, updated_at, is_active)
sessions (id, user_id, token, expires_at, created_at)
groups (_EVERYONE, _LOGGED_IN - wie bei HedgeDoc)
user_groups (user_id, group_id, added_at)
```

#### API Endpoints:
- `POST /api/auth/register` - Neue Benutzerregistrierung
- `POST /api/auth/login` - Benutzer-Login (gibt JWT token zurück)
- `POST /api/auth/logout` - Logout (invalidiert Session)
- `GET /api/auth/me` - Aktuellen Benutzer abrufen
- `PUT /api/auth/profile` - Profil aktualisieren
- `PUT /api/auth/password` - Passwort ändern

#### Implementierte Dateien:
- `/backend/src/db/schema.ts` - Erweiterte Datenbankschemas
- `/backend/src/services/auth.ts` - Authentication Service
- `/backend/src/middleware/auth.ts` - Auth Middleware (authMiddleware, optionalAuthMiddleware)
- `/backend/src/routes/auth.ts` - Auth API Routes

---

### 🔒 Permission System (⚙️ IN ARBEIT)

Basierend auf HedgeDoc's granulares Berechtigungssystem:

#### Features:
- **Owner-based Permissions** - Jedes Dokument hat einen Besitzer
- **User-specific Permissions** - Individuelle Berechtigungen pro Benutzer (read, write, admin)
- **Group Permissions** - Berechtigungen für Gruppen (`_EVERYONE`, `_LOGGED_IN`, Custom Groups)
- **Permission Levels**: 
  - `read` - Dokument lesen
  - `write` - Dokument bearbeiten
  - `admin` - Volle Kontrolle (inkl. Berechtigungen ändern)

#### Datenbankschema:
```sql
documents (id, title, content, owner_id, created_at, updated_at, last_edited_by)
document_permissions (id, document_id, user_id?, group_id?, permission_level, created_at)
```

#### Service Methods (geplant):
- `checkPermission(documentId, userId, requiredLevel)` - Berechtigung prüfen
- `getDocumentPermissions(documentId)` - Alle Berechtigungen abrufen
- `setUserPermission(documentId, userId, level)` - Benutzer-Berechtigung setzen
- `setGroupPermission(documentId, groupId, level)` - Gruppen-Berechtigung setzen
- `transferOwnership(documentId, newOwnerId)` - Besitzer wechseln

#### Implementierte Dateien:
- `/backend/src/services/permissions.ts` - Permission Service (skeleton)

---

### 🤝 Real-time Collaboration (📋 GEPLANT)

Von HedgeDoc's Real-time-System inspiriert:

#### Geplante Features:
- **Y.js Integration** für CRDT-basierte kollaborative Bearbeitung
- **WebSocket-Server** für Echtzeit-Kommunikation
- **Cursor Sharing** - Sehe wo andere Benutzer tippen
- **Online Users** - Liste aktiver Benutzer im Dokument
- **Conflict Resolution** - Automatische Zusammenführung von Änderungen

#### Technologie-Stack:
- `yjs` - CRDT Collaboration Framework
- `y-websocket` - WebSocket Provider für Y.js
- `ws` - WebSocket Server für Node.js

#### Benötigte Dateien (TODO):
- `/backend/src/services/realtime.ts` - Realtime Service
- `/backend/src/services/collaboration.ts` - Collaboration Manager
- `/backend/src/routes/realtime.ts` - WebSocket Routes
- `/frontend/src/hooks/useCollaboration.ts` - React Hook für Collaboration

---

### 🎙️ Open-Notebook Research Tools (📋 GEPLANT)

Integration von Open-Notebook's leistungsstarken Research-Features:

#### 1. Podcast Generation
- **Multi-Speaker Podcasts** (1-4 Sprecher vs. Google Notebook LM's 2-Sprecher-Limit)
- **Episode Profiles** - Vordefinierte Podcast-Stile und -Formate
- **Speaker Profiles** - Verschiedene TTS-Stimmen und Persönlichkeiten
- **Background Processing** - Async Podcast-Generierung via Queue-System

**Technologie:**
- `podcast-creator` - Podcast Generation Library
- TTS Providers: OpenAI TTS, Google TTS, ElevenLabs

**API Endpoints (geplant):**
```
POST /api/podcasts/generate - Podcast erstellen
GET /api/podcasts/episodes - Alle Episodes auflisten
GET /api/podcasts/{id}/audio - Audio herunterladen
GET /api/episode-profiles - Verfügbare Profile
GET /api/speaker-profiles - Verfügbare Sprecher
```

#### 2. Content Transformations
- **Automatische Zusammenfassungen** - AI-generierte Summaries
- **Insights Extraction** - Schlüsselpunkte aus langen Texten
- **Citation Management** - Automatische Quellenangaben
- **Multi-Format Support** - PDF, DOCX, PPT, Audio, Video Integration

**Features:**
- Batch-Transformationen über mehrere Dokumente
- Customizable Transformation Templates
- Context-aware AI Processing

#### 3. Advanced Context Management
- **Selective AI Context** - Wähle genau welche Inhalte die AI sieht
- **Privacy Controls** - Granulare Kontrolle über geteilte Daten
- **Source Attribution** - Tracke welche Quellen in AI-Antworten verwendet wurden

**Benötigte Dateien (TODO):**
```
/backend/src/services/podcast.ts - Podcast Service
/backend/src/services/transformations.ts - Content Transformation Service
/backend/src/services/citations.ts - Citation Manager
/backend/src/routes/podcasts.ts - Podcast API
/backend/src/routes/transformations.ts - Transformation API
/frontend/src/components/PodcastGenerator.tsx - UI Component
/frontend/src/components/TransformationPanel.tsx - UI Component
```

---

### 📝 Enhanced Editor Features (📋 GEPLANT)

Von HedgeDoc und modernen Editoren inspiriert:

#### Geplante Features:
- **Split View** - Side-by-side Markdown + Preview
- **Live Preview** - Real-time Markdown Rendering
- **Image Upload** - Drag & Drop Bilder direkt in Editor
- **Mermaid Diagrams** - Inline Diagramme
- **Table Editor** - Visueller Table-Builder
- **Code Syntax Highlighting** - Syntax-Highlighting für Code-Blöcke
- **Markdown Toolbar** - Quick-Access zu Markdown-Formatierung
- **Auto-Save** - Automatisches Speichern während Bearbeitung

#### Benötigte Dateien (TODO):
```
/frontend/src/components/SplitViewEditor.tsx
/frontend/src/components/LivePreview.tsx
/frontend/src/components/ImageUploader.tsx
/frontend/src/components/DiagramEditor.tsx
/frontend/src/components/TableBuilder.tsx
```

---

### 📤 Erweiterte Export-Funktionalität (📋 GEPLANT)

Zusätzlich zu den bestehenden Formaten (Markdown, HTML, Reveal.js):

#### Neue Formate:
- **DOCX** - Microsoft Word Export (via Pandoc)
- **LaTeX** - LaTeX Export für akademische Papers
- **EPUB** - E-Book Format
- **PDF** - Direkte PDF-Generierung (via Pandoc/Puppeteer)

#### Template System:
- **Custom Templates** - Benutzerdefinierte Export-Templates
- **Branding** - Logo, Header, Footer Customization
- **Metadata Injection** - Automatische Metadaten in Exports
- **Citation Formats** - APA, MLA, Chicago, IEEE

**Technologie:**
- `pandoc` - Universal Document Converter
- `puppeteer` - PDF Generation via Headless Chrome
- Custom Template Engine

**Benötigte Dateien (TODO):**
```
/backend/src/services/export-enhanced.ts
/backend/src/services/template-engine.ts
/backend/src/templates/ - Export Templates
```

---

## 📊 Implementierungsstatus

| Feature | Status | Priorität | Dateien |
|---------|--------|-----------|---------|
| User Authentication | ✅ Fertig | Hoch | 4 Dateien |
| Permission System | ⚙️ Skeleton | Hoch | 1 Datei |
| Real-time Collaboration | 📋 Geplant | Hoch | - |
| Podcast Generation | 📋 Geplant | Mittel | - |
| Content Transformations | 📋 Geplant | Mittel | - |
| Citation System | 📋 Geplant | Mittel | - |
| Enhanced Editor | 📋 Geplant | Mittel | - |
| Extended Export | 📋 Geplant | Niedrig | - |

---

## 🔧 Nächste Schritte

### Kurzfristig (Diese Woche):
1. ✅ User Authentication abschließen
2. ⚙️ Permission Service finalisieren
3. 🔄 Permission API Routes erstellen
4. 🎨 Frontend Auth-Komponenten erstellen

### Mittelfristig (Nächste 2 Wochen):
1. Real-time Collaboration mit Y.js
2. WebSocket Server Setup
3. Collaborative Editor UI
4. Online Users Display

### Langfristig (Nächster Monat):
1. Podcast Generation Integration
2. Content Transformation System
3. Enhanced Editor Features
4. Extended Export Functionality

---

## 🎯 Verbesserungen gegenüber Vorgängern

### vs. HedgeDoc:
- ✅ **Moderne Tech-Stack** (React 18, TypeScript 5.7, Vite 6)
- ✅ **AI-Integration** (Gemini, MCP)
- ✅ **Bessere UX** (TailwindCSS, Modern UI)
- 🔄 **Gleiche Core-Features** (Auth, Permissions, Real-time) - in Arbeit
- ➕ **Zusätzlich**: Podcast Gen, Content Transformations

### vs. Open-Notebook:
- ✅ **Fokus auf Markdown** (vs. Research-First)
- ✅ **Document Hierarchy** (Books/Chapters vs. Flat Notebooks)
- ✅ **Git-basierte Versionierung** (automatisch)
- 🔄 **Integration geplant**: Podcast Gen, Transformations, Citations
- ➕ **Zusätzlich**: Real-time Collaboration, Presentation Mode

---

## 📚 Dependencies

### Neu hinzugefügt:
```json
{
  "dependencies": {
    "bcryptjs": "^2.4.3",      // Password Hashing
    "ws": "^8.18.0",            // WebSocket Server
    "yjs": "^13.6.20",          // CRDT Collaboration
    "y-websocket": "^2.0.4"     // Y.js WebSocket Provider
  }
}
```

### Geplant (für Research-Features):
```json
{
  "dependencies": {
    "podcast-creator": "^latest",  // Podcast Generation
    "pandoc": "^latest",           // Document Conversion
    "puppeteer": "^latest"         // PDF Generation
  }
}
```

---

**Status:** Aktive Entwicklung | Version: 0.2.0 (in Arbeit)
**Letztes Update:** November 2025
