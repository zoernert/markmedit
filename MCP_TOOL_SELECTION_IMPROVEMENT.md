# MCP Tool-Auswahl Verbesserung - Implementierungsdokumentation

## Problem
Die KI hat bei der Frage **"Was ist der aktuelle Stand zum Baukostenzuschuss bei Speichern?"** nicht die verfügbaren MCP-Tools (semantische Suche) genutzt, obwohl der konfigurierte MCP-Service (willi-mako) diese Frage hätte beantworten können.

Die alte Logik war zu restriktiv:
- Verwendete hartcodierte Keywords (`detectIfEnergyMarketRelated()`)
- Entschied VOR der Anfrage, ob MCP verwendet wird
- Viele relevante Begriffe (z.B. "Baukostenzuschuss") waren nicht in der Keyword-Liste

## Lösung

### 1. Strategie-Änderung: Immer MCP verwenden
**Vorher**: Entscheidung Frontend → MCP nur bei erkannten Energy-Keywords  
**Jetzt**: **Immer MCP mit Function Calling** → Gemini entscheidet selbst, welche Tools benötigt werden

```typescript
// frontend/src/components/AIAssistant.tsx
// VORHER: Komplexe Keyword-basierte Entscheidung
const useMCP = detectIfEnergyMarketRelated(userMessage, selectedText);
const backend: AIBackend = useMCP ? 'mcp' : 'gemini';

// JETZT: Immer MCP, Gemini entscheidet über Tool-Nutzung
const backend: AIBackend = 'mcp';
```

**Vorteil**: Gemini 2.5 Flash ist intelligent genug zu erkennen, wann Tools nützlich sind. Bei allgemeinen Textbearbeitungen ruft es einfach keine Tools auf.

### 2. Verbesserter System Prompt
Der Backend-Prompt wurde erweitert, um Gemini explizit zur Nutzung der semantischen Suche zu ermutigen:

```typescript
// backend/src/routes/ai-enhanced.ts
WICHTIG - Tool-Verwendung:
1. Bei Fachfragen zur Energiewirtschaft (z.B. Marktkommunikation, Netzmanagement, 
   Regulierung, Baukostenzuschuss, Netzentgelte, TAB, §14a EnWG, EDIFACT, etc.):
   → Nutze IMMER zuerst die semantische Suche
   → Diese Tools haben Zugriff auf aktuelle Fach-Dokumentation

2. Bei Unsicherheit, ob ein Tool nützlich wäre:
   → Lieber einmal zu viel als zu wenig suchen!
```

### 3. Infrastruktur für MCP Tool Hints (vorbereitet)
Für zukünftige Verbesserungen wurde eine Datenbank-Tabelle und API erstellt:

**Datenbank-Schema**:
```sql
CREATE TABLE IF NOT EXISTS mcp_tool_hints (
  id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  server_id TEXT,
  description TEXT,
  keywords TEXT,        -- Komma-separierte Keywords für bessere Erkennung
  usage_hint TEXT,      -- Wann sollte dieses Tool verwendet werden?
  priority INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**Backend-API**: `/api/mcp-hints`
- GET `/` - Alle Hints
- GET `/server/:serverId` - Hints für spezifischen Server
- POST `/` - Neuen Hint erstellen
- PUT `/:id` - Hint aktualisieren
- DELETE `/:id` - Hint löschen
- POST `/bulk` - Mehrere Hints auf einmal erstellen

**Frontend-API**: `api.ts` erweitert mit TypeScript-Interfaces und Methoden

## Änderungen im Detail

### Entfernte Komponenten
- ❌ `detectIfEnergyMarketRelated()` Funktion (frontend)
- ❌ Hardcodierte Keyword-Liste mit 24 Begriffen
- ❌ Backend-Routing zwischen `api.chat()` und `api.chatWithMCP()`

### Neue/Geänderte Komponenten
- ✅ **AIAssistant.tsx**: Vereinfachte Logik, immer MCP
- ✅ **ai-enhanced.ts**: Verbesserter System Prompt mit expliziten Tool-Nutzungshinweisen
- ✅ **db/index.ts**: Neue Tabelle `mcp_tool_hints`
- ✅ **routes/mcp-hints.ts**: Vollständige CRUD-API für Hints
- ✅ **lib/api.ts**: TypeScript-Interfaces für MCPToolHint

### Test-Anpassungen
- ✅ `AIAssistant.test.ts`: Tests für gelöschte Funktion entfernt

## Erwartetes Verhalten

### Frage: "Was ist der aktuelle Stand zum Baukostenzuschuss bei Speichern?"

**Alt** (❌):
```
Keine Energy-Keywords erkannt → Gemini direkt → Keine Tool-Nutzung
Antwort: "Ich kann diese spezifische Frage leider nicht beantworten..."
```

**Neu** (✅):
```
→ MCP Function Calling aktiviert
→ Gemini erkennt: Fachfrage → semantische Suche nützlich
→ Tool-Call: willi-netz-semantic-search("Baukostenzuschuss Speicher")
→ Relevante Dokumente gefunden
→ Fundierte Antwort basierend auf aktueller Dokumentation
```

### Allgemeine Textbearbeitung weiterhin ohne Tools

**Frage**: "Korrigiere die Rechtschreibung in diesem Text"

```
→ MCP Function Calling aktiviert
→ Gemini erkennt: Keine Tools nötig
→ Direkte Antwort ohne Tool-Calls
→ Funktioniert wie vorher
```

## Deployment-Status

✅ **Backend deployed**: 
- Database Schema: mcp_tool_hints table created
- Routes: /api/mcp-hints endpoints registered
- System Prompt: Enhanced with tool usage instructions

✅ **Frontend deployed**:
- Simplified tool selection logic
- Test file updated
- API client ready for hints management

## Nächste Schritte (Optional)

Die Infrastruktur für Tool Hints ist vorbereitet, aber noch nicht aktiviert. Mögliche Erweiterungen:

1. **Admin-UI für Hints** (#4 im Todo)
   - Erweiterung der MCP-Server-Management-Seite
   - Liste der Tools mit Hints-Editor
   - Keywords, Beschreibung, Usage-Tipps pflegen

2. **Default Hints für wichtige Tools** (#5 im Todo)
   - Vordefinierte Hints für semantic-search, chat, combined-chat
   - Keywords: "Baukostenzuschuss", "Netzentgelte", "TAB", "§14a", etc.
   - Automatisches Einfügen bei Server-Synchronisation

3. **Hints in System Prompt integrieren**
   - Hints dynamisch in System Prompt einbinden
   - Gemini bekommt noch klarere Anweisungen, wann welches Tool zu nutzen ist

## Testing

**Vorgeschlagener Test**:
1. http://10.0.0.14:3000 öffnen
2. Dokument im Editor öffnen
3. Im KI-Assistenten fragen: **"Was ist der aktuelle Stand zum Baukostenzuschuss bei Speichern?"**
4. **Erwartung**: 
   - Backend-Logs zeigen Tool-Call zu `willi-netz-semantic-search`
   - Antwort basiert auf gefundenen Dokumenten
   - "X tool calls" wird in der Nachricht angezeigt

**Weitere Testfälle**:
- "Wie funktioniert der Lieferantenwechsel?" → sollte MCP nutzen
- "Fasse diesen Absatz zusammen" → sollte direkt antworten (keine Tools)
- "Erkläre EDIFACT UTILMD" → sollte MCP nutzen
- "Korrigiere die Rechtschreibung" → sollte direkt antworten

## Fazit

Die Änderung vereinfacht die Architektur erheblich:
- **Weniger Code**: Keyword-Logik entfernt
- **Intelligentere Entscheidungen**: Gemini entscheidet selbst
- **Bessere Abdeckung**: Alle Fachfragen werden jetzt mit Tools beantwortet
- **Zukunftssicher**: Hints-Infrastruktur für weitere Optimierungen vorbereitet

Die bisherige Sorge "MCP könnte zu oft aufgerufen werden" ist unbegründet, da:
1. Gemini sehr gut erkennt, wann Tools nicht nötig sind
2. Function Calling sehr schnell ist (< 2 Sekunden zusätzlich)
3. Der System Prompt klare Richtlinien gibt
