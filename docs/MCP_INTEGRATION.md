# MCP Integration Guide für MarkMEdit

Dieses Dokument beschreibt die Integration generischer MCP-Server in MarkMEdit.

## Übersicht

Ein spezialisierter MCP-Server kann umfassendes Wissen über den deutschen Energiemarkt bereitstellen:
- Marktkommunikationsprozesse (GPKE, WiM, GeLi Gas)
- EDIFACT/edi@energy Formate
- Regulatorische Vorgaben (EnWG, StromNZV, EEG)
- Netzthemen: Netzmanagement, BNetzA, §14a EnWG

## Konfiguration

Die angeschlossenen MCP-Server werden über die Umgebungsvariable `MCP_SERVERS` als JSON-Liste konfiguriert. Beispiel:

```env
MCP_SERVERS=[
  {
    "id": "energy-knowledge",
    "name": "Energy Knowledge MCP",
    "url": "https://mcp.example.com/",
    "type": "http",
    "description": "Fachwissen zu Energiemarkt, Regulierung und EDIFACT",
    "capabilities": ["search", "chat", "edifact"],
    "defaultTools": {
      "chat": "chat",
      "search": "semantic-search",
      "edifactAnalyze": "edifact-analyze"
    }
  }
]
```

Falls ein Server Authentifizierung benötigt (z. B. API-Token), sollten die entsprechenden Secrets separat als Umgebungsvariablen hinterlegt und beim Start in die Konfiguration eingebettet werden.

## Verwendung in MarkMEdit

```typescript
import { getMCPManager } from '../services/mcp-manager.js';

const manager = getMCPManager();
const server = manager.findBestServer('EDIFACT Validierung') ?? manager.getAllServers()[0];

if (!server) {
  throw new Error('Kein MCP-Server konfiguriert.');
}

// 1. Liste verfügbarer Tools abrufen
const tools = await server.listTools();

// 2. Semantische Suche (Standard-Tool "search")
const results = await server.callDefaultTool('search', {
  query: 'UTILMD Lieferantenwechsel Fristen',
  limit: 10,
});

// 3. Chat (Standard-Tool "chat")
const answer = await server.callDefaultTool('chat', {
  message: 'Welche Fristen gelten für Lieferantenwechsel?',
  history: [
    { role: 'user', content: 'Kurze Übersicht bitte.' },
  ],
});

// 4. EDIFACT Analyse (Tool hängt von Server-Konfiguration ab)
const analysis = await server.callDefaultTool('edifactAnalyze', {
  message: 'UNH+1+UTILMD:D:11A:UN:2.4e++...'
});
```

## Integration in UI-Komponenten

### KI-Assistent Panel
```typescript
// src/components/MCPAssistant.tsx
function MCPAssistant({ documentId }) {
  const [sessionId, setSessionId] = useState<string>();
  
  useEffect(() => {
    // Session erstellen beim Mount
    mcpCreateSession().then(s => setSessionId(s.sessionId));
  }, []);
  
  const handleSearch = async (query: string) => {
    const results = await api.mcpSearch({ query, sessionId });
    // Zeige Ergebnisse an
  };
  
  return (
    <div>
      <input onChange={e => handleSearch(e.target.value)} />
      {/* Ergebnisse */}
    </div>
  );
}
```

### Dokument-Kontext
```typescript
// Beim Bearbeiten eines Dokuments zum Thema "Energiemarkt"
const enrichDocument = async (documentId: string) => {
  const doc = await api.getDocument(documentId);
  
  // Suche relevante MCP-Inhalte
  const context = await api.mcpSearch({
    query: doc.title + ' ' + doc.content.substring(0, 500),
  });
  
  // Analysiere mit MCP-Tool
  const analysis = await api.mcpReasoning({
    query: doc.title,
    context: context.results.map(r => r.text).join('\n'),
  });
  
  return analysis;
};
```

## Best Practices

### 1. Session Management
- Erstelle Session pro Benutzer/Dokument-Kontext
- Verwende `sessionId` konsistent
- Lösche Sessions nach Inaktivität

### 2. Caching
- Cache Suchergebnisse für wiederholte Queries
- Nutze React Query für automatisches Caching

### 3. Error Handling
```typescript
try {
  const result = await api.mcpSearch({ query });
} catch (error) {
  if (error.response?.status === 401) {
    // Token abgelaufen - neu authentifizieren
    await refreshMCPToken();
  }
}
```

### 4. Incremental Loading
```typescript
// Lade Ergebnisse schrittweise
const searchWithPagination = async (query: string, page = 1) => {
  return api.mcpSearch({
    query,
    options: {
      limit: 10,
      offset: (page - 1) * 10,
    },
  });
};
```

## Workflow-Beispiele

### Whitepaper erstellen
```
1. Nutzer gibt Thema ein: "§14a EnWG Umsetzung"
2. System ruft das konfigurierte MCP-Reasoning-Tool auf
3. Erstellt strukturierte Outline
4. Nutzer ergänzt einzelne Abschnitte manuell
5. System nutzt MCP-Chat für Detailfragen
6. Export als PDF mit Quellenangaben
```

### EDIFACT-Analyse
```
1. Nutzer fügt EDIFACT-Nachricht ein
2. System analysiert mit dem MCP-Tool für EDIFACT-Analyse
3. Zeigt Segmente, Codes, Bedeutungen an
4. Nutzer kann Fragen stellen via MCP-Chat-Tool für EDIFACT
5. Validierung zeigt Fehler/Warnungen
```

## Nächste Schritte

1. Implementiere MCP HTTP Client in `backend/src/services/mcp.ts`
2. Erstelle React Components für MCP-Features
3. Integriere in DocumentEditor und AIAssistant
4. Teste End-to-End Workflows

## Resources

- Beispiel OpenAPI-Schema: `mcp://your-server/openapi`
- MCP SDK: https://github.com/modelcontextprotocol/sdk
- Anbieter-Dokumentation deines MCP-Servers
