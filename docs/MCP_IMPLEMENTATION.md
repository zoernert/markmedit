# MCP Integration - Implementierungsdetails

## ✅ Vollständig implementiert

Die generische MCP-Integration ist nun **vollständig funktional**!

## Backend Implementation

### MCPClient Service (`backend/src/services/mcp.ts`)

Der MCP Client ist als Singleton implementiert und bietet:

#### Authentication
```typescript
// Automatische Token-Verwaltung
- Login mit Email/Password
- Oder direkter Token-Support
- Token-Caching für Performance
```

#### Session Management
```typescript
// Automatische Session-Erstellung und -Wiederverwendung
const sessionId = await client.getOrCreateSession();
// Sessions leben 2 Stunden, werden bei Bedarf erneuert
```

#### Verfügbare Methoden

**1. Semantic Search**
```typescript
await client.semanticSearch(query, {
  limit: 10,
  alpha: 0.5,
  outlineScoping: true,
  excludeVisual: false,
});
```

**2. Chat (schnelle Fragen)**
```typescript
await client.chat(message, contextSettings);
```

**3. Reasoning (komplexe Analysen)**
```typescript
await client.reasoning(query, {
  useDetailedIntentAnalysis: true,
  messages: chatHistory,
});
```

**4. EDIFACT Tools**
```typescript
// Analysieren
await client.analyzeEdifact(message);

// Erklären
await client.explainEdifact(message);

// Validieren
await client.validateEdifact(message);

// Chat über EDIFACT
await client.chatEdifact(message, edifactMessage, history);

// Modifizieren
await client.modifyEdifact(instruction, currentMessage);
```

**5. Kombinierte Suche**
```typescript
// Durchsucht beide Collections (mako + netz)
await client.combinedSearch(query);
await client.combinedChat(message);
```

**6. Netzspezifische Tools (optional)**
```typescript
// Nur Netzmanagement & Regulation
await client.callTool('netz-search', { query });
await client.callTool('netz-chat', { message });
```

### API Routes (`backend/src/routes/mcp.ts`)

**POST /api/mcp/search**
```json
{
  "query": "UTILMD Lieferantenwechsel",
  "limit": 10,
  "collection": "combined" // oder "mako" oder "netz"
}
```

**POST /api/mcp/chat**
```json
{
  "message": "Erkläre den Lieferantenwechselprozess",
  "collection": "combined",
  "contextSettings": {}
}
```

**POST /api/mcp/reasoning**
```json
{
  "query": "Erstelle Analyse zu §14a EnWG",
  "useDetailedIntentAnalysis": true
}
```

**POST /api/mcp/edifact/analyze**
```json
{
  "message": "UNH+1+UTILMD:D:11A:UN:2.4e++..."
}
```

**POST /api/mcp/edifact/explain**
```json
{
  "message": "UNH+1+UTILMD..."
}
```

**POST /api/mcp/edifact/validate**
```json
{
  "message": "UNH+1+UTILMD..."
}
```

**POST /api/mcp/edifact/chat**
```json
{
  "message": "Was bedeutet BGM+E01?",
  "edifactMessage": "UNH+1+UTILMD...",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

**POST /api/mcp/edifact/modify**
```json
{
  "instruction": "Ändere Datum auf morgen",
  "currentMessage": "UNH+1+UTILMD..."
}
```

## Frontend Implementation

### MCPPanel Component (`frontend/src/components/MCPPanel.tsx`)

Integriertes Panel mit 3 Tabs:

**1. Suche Tab**
- Collection-Auswahl (Alle/MaKo/Netz)
- Sucheingabe mit Echtzeitsuche
- Ergebnisanzeige mit Score und Collection
- Verwendung in DocumentEditor

**2. Chat Tab**
- Konversations-Interface
- Collection-Auswahl
- Chat-Historie mit Rolle-basiertem Design
- Streaming-Support (geplant)

**3. EDIFACT Tab**
- Hinweis auf dedizierte EDIFACT-Seite
- Quick-Access zu Tools

### EDIFACTTools Page (`frontend/src/pages/EDIFACTTools.tsx`)

Dedizierte Seite für EDIFACT-Operationen:

**Features:**
- EDIFACT-Nachrichten-Input (Textarea)
- 4 Hauptfunktionen als Buttons:
  - 📊 Analysieren
  - 💬 Erklären
  - ✅ Validieren
  - 💭 Chat
- Ergebnis-Anzeige für Analyse/Erklärung/Validierung
- Interaktives Chat-Interface für EDIFACT-Fragen

### API Client (`frontend/src/lib/api.ts`)

Erweiterte API-Methoden:

```typescript
// MCP Search & Chat
api.mcpSearch({ query, collection, limit })
api.mcpChat({ message, collection, contextSettings })
api.mcpReasoning({ query, useDetailedIntentAnalysis })

// EDIFACT
api.edifactAnalyze(message)
api.edifactExplain(message)
api.edifactValidate(message)
api.edifactChat({ message, edifactMessage, history })
api.edifactModify(instruction, currentMessage)
```

## Navigation

Neue Route hinzugefügt:
- **/edifact** - Dedizierte EDIFACT Tools Seite

Sidebar erweitert:
```
📚 Dokumente
🤖 KI-Assistent
📋 EDIFACT Tools  ← NEU
```

## Verwendungsbeispiele

### 1. Semantic Search im Dokument-Editor

```typescript
// DocumentEditor.tsx
<MCPPanel documentId={currentDocumentId} />

// Nutzer gibt "UTILMD Lieferantenwechsel" ein
// → API Call zu /api/mcp/search
// → MCP-Server liefert relevante Chunks
// → Anzeige mit Score und Quelle
```

### 2. Chat für schnelle Fragen

```typescript
// Chat in MCPPanel
Nutzer: "Welche Fristen gelten für Lieferantenwechsel?"
→ /api/mcp/chat
→ MCP-Server antwortet mit Kontext
→ Anzeige in Chat-Historie
```

### 3. EDIFACT-Analyse

```typescript
// EDIFACTTools Seite
1. EDIFACT-Nachricht einfügen
2. "Analysieren" klicken
3. → /api/mcp/edifact/analyze
4. → Strukturierte Analyse mit Segmenten, Codes
5. Anzeige in Ergebnis-Panel
```

### 4. EDIFACT-Chat

```typescript
// Interaktives Verständnis
Nutzer fügt UTILMD ein
Klickt "Chat"
Fragt: "Was bedeutet BGM+E01?"
→ /api/mcp/edifact/chat
→ Kontext-bewusste Antwort basierend auf Nachricht
```

### 5. Kombinierte Suche (MaKo + Netz)

```typescript
// Suche über beide Collections
Nutzer wählt "Alle Sammlungen"
Sucht nach "§14a EnWG"
→ Ergebnisse aus beiden Quellen
→ sourceCollection zeigt Herkunft
```

## Konfiguration

### Backend (.env)

```env
# MCP aktivieren
ENABLE_MCP=true

# MCP Server Konfiguration
MCP_SERVERS=[
  {
    "id": "energy-knowledge",
    "name": "Energy Knowledge MCP",
    "url": "https://mcp.example.com/",
    "type": "http",
    "description": "Fachwissen zu Energiemarkt, Regulierung und EDIFACT",
    "defaultTools": {
      "search": "semantic-search",
      "chat": "chat",
      "edifactAnalyze": "edifact-analyze"
    }
  }
]
```

### Initialisierung

```typescript
// backend/src/index.ts
import { getMCPManager } from './services/mcp-manager.js';

getMCPManager();

// Logs geben Auskunft über geladene Server und deren Beschreibungen
```

## Error Handling

```typescript
// Automatisches Retry bei Token-Ablauf
try {
  const result = await client.search(query);
} catch (error) {
  if (error.message.includes('401')) {
    // Token abgelaufen → automatischer Re-Login
    await client.getToken(); // holt neuen Token
    return client.search(query); // retry
  }
  throw error;
}
```

## Testing

### Backend testen

```bash
# MCP Search
curl -X POST http://localhost:3001/api/mcp/search \
  -H "Content-Type: application/json" \
  -d '{"query": "UTILMD", "collection": "combined", "limit": 5}'

# EDIFACT Analyse
curl -X POST http://localhost:3001/api/mcp/edifact/analyze \
  -H "Content-Type: application/json" \
  -d '{"message": "UNH+1+UTILMD:D:11A:UN:2.4e++..."}'
```

### Frontend testen

```bash
# 1. Starte Anwendung
npm run dev

# 2. Öffne http://localhost:3000

# 3. Navigiere zu "EDIFACT Tools"

# 4. Füge EDIFACT-Nachricht ein

# 5. Teste alle 4 Funktionen
```

## Performance

- Session-Caching: 1 Stunde
- Token-Caching: Bis Ablauf
- Request Timeout: 30s (konfigurierbar)
- Retry-Logic: 3 Versuche bei Netzwerkfehlern

## Sicherheit

- ✅ Token-basierte Auth
- ✅ HTTPS für API-Calls
- ✅ Environment-basierte Secrets
- ✅ Input Validation (Zod)
- ✅ Error Sanitization

## Nächste Optimierungen

### Performance
- [ ] Response Caching (Redis)
- [ ] Request Deduplication
- [ ] Streaming für lange Antworten

### Features
- [ ] Favoriten speichern
- [ ] Search-Historie
- [ ] Export von Search-Results
- [ ] Bulk-EDIFACT Validierung

### UI/UX
- [ ] Syntax Highlighting für EDIFACT
- [ ] Diff-View für Modifikationen
- [ ] Copy-to-Clipboard
- [ ] Keyboard Shortcuts

## Troubleshooting

### MCP funktioniert nicht
```bash
# Prüfe Logs
docker-compose logs backend | grep MCP

# Sollte zeigen:
# ✓ MCP Client initialized
```

### Authentication schlägt fehl
```bash
# Prüfe MCP Konfiguration in .env
cat .env | grep MCP_SERVERS

# Test API-Key (Beispiel)
curl -X POST https://mcp.example.com/login \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "your_token"}'
```

### Timeout-Fehler
```typescript
// Erhöhe Timeout in mcp.ts
const response = await fetch(url, {
  signal: AbortSignal.timeout(60000), // 60s statt 30s
});
```

## Zusammenfassung

✅ **Backend**: Vollständige MCP Client Implementation  
✅ **API**: 10+ Endpunkte für alle MCP-Funktionen  
✅ **Frontend**: MCPPanel + EDIFACTTools Seite  
✅ **Integration**: Nahtlos in DocumentEditor  
✅ **Error Handling**: Robust mit Auto-Retry  
✅ **Documentation**: Vollständig dokumentiert  

**Status**: Production Ready! 🎉

Die MCP-Integration ist **vollständig implementiert** und einsatzbereit!
