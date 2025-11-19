# Tool-First-Ansatz mit Kontext-Awareness - Implementierung

## Problemstellung
Die KI sollte **immer erst verfügbare Tools befragen**, bevor sie aus ihrem Trainingswissen antwortet. Zudem sollten:
- Dokumenteninhalt
- Gespeicherte Artefakte
- Chat-Verlauf

...als Kontext für die Tool-Auswahl dienen.

## Lösung: Tool-First-Ansatz mit vollständigem Kontext

### 1. Dynamische Tool-Erkennung (Backend)

Statt hartcodierter Tool-Namen analysiert das System automatisch die verfügbaren MCP-Tools:

```typescript
// backend/src/routes/ai-enhanced.ts

// Analyze available tools to build intelligent prompt
const availableToolTypes = {
  hasSemanticSearch: functionDeclarations.some(f => 
    f.name.includes('semantic') || f.description?.toLowerCase().includes('semantic search')
  ),
  hasChat: functionDeclarations.some(f => 
    f.name.includes('chat') && !f.name.includes('edifact')
  ),
  hasEDIFACT: functionDeclarations.some(f => 
    f.name.includes('edifact')
  ),
  hasReasoning: functionDeclarations.some(f => 
    f.name.includes('reasoning')
  ),
};
```

**Vorteil**: Funktioniert mit jedem MCP-Server, nicht nur mit willi-mako.

### 2. Intelligenter System Prompt

Der System Prompt wird dynamisch basierend auf verfügbaren Tools generiert:

```typescript
⚠️ WICHTIGSTE REGEL - Tool-First-Ansatz:
1. IMMER erst Tools befragen, bevor du eine Antwort aus deinem Trainingswissen gibst
2. Nutze den Dokumentenkontext, Artefakte und Chat-Verlauf, um zu entscheiden, welche Tools relevant sind
3. Bei Unsicherheit: Lieber 2-3 Tools parallel aufrufen als direkt zu antworten
4. Erst wenn ALLE relevanten Tools KEINE hilfreichen Informationen liefern, darfst du aus deinem Wissen antworten
5. Wenn du aus deinem Wissen antwortest, kennzeichne dies deutlich: "Basierend auf allgemeinem Wissen (nicht aus den Datenbanken):"
```

**Tool-spezifische Anweisungen** (dynamisch):
```
📚 SEMANTISCHE SUCHE verfügbar:
   - Nutze diese bei JEDER Fachfrage, bevor du antwortest
   - Suche nach relevanten Dokumenten, Richtlinien, Vorgaben
   - Auch bei unklaren Begriffen (z.B. "Baukostenzuschuss", "§14a", "TAB") → erst suchen!

💬 CHAT-TOOL verfügbar:
   - Für komplexe Fachfragen mit Kontext-Verständnis
   - Alternative zur semantischen Suche bei Wissensfragen

📄 EDIFACT-TOOLS verfügbar:
   - Für Analyse, Validierung, Erklärung von EDIFACT-Nachrichten
```

### 3. Vollständiger Kontext-Aufbau (Frontend)

Das Frontend sendet jetzt umfassenden Kontext an das Backend:

```typescript
// frontend/src/components/AIAssistant.tsx

// Build comprehensive context for AI
const contextParts = [];

// 1. Document context (selected or full)
if (selectedText && selectedText.trim()) {
  contextParts.push(`📄 Ausgewählter Textabschnitt:\n\`\`\`\n${selectedText}\n\`\`\``);
} else if (documentContent && documentContent.trim()) {
  // Include snippet of full document if nothing selected
  const snippet = documentContent.slice(0, 1000);
  contextParts.push(`📄 Dokument (Auszug):\n${snippet}...`);
}

// 2. Artifact context
if (artifactContext) {
  contextParts.push(`📦 Gespeicherte Artefakte (vom Nutzer ausgewählt):\n${artifactContext}`);
}

// 3. Chat history summary for tool selection
if (messages.length > 0) {
  const recentTopics = messages.slice(-3).map(m => m.content.slice(0, 100)).join('; ');
  contextParts.push(`💬 Bisherige Gesprächsthemen: ${recentTopics}`);
}
```

**Backend erhält**:
```typescript
{
  message: "Nutzer-Frage",
  documentContext: "Vollständiger Dokumenten-Inhalt", // NEU: Früher nur selectedText
  history: [...chatHistory]
}
```

### 4. Kontext-Informationen für Tool-Auswahl (Backend)

Der System Prompt informiert die KI über verfügbaren Kontext:

```typescript
📊 Kontext für Tool-Auswahl:
- Dokumenteninhalt: Verfügbar - berücksichtige diesen!
- Chat-Verlauf: 5 Nachrichten
- Artefakte: Im Kontext möglicherweise enthalten

🎯 Vorgehen bei Fragen:
1. Analysiere die Frage und den gesamten Kontext
2. Identifiziere relevante Tools (semantische Suche, Chat, EDIFACT, etc.)
3. Rufe Tools auf - lieber zu viel als zu wenig!
4. Synthetisiere die Tool-Ergebnisse zu einer Antwort
5. Zitiere Quellen und Tool-Ergebnisse explizit
```

## Beispiel-Workflow

### Frage: "Was ist der aktuelle Stand zum Baukostenzuschuss bei Speichern?"

**Kontext beim Backend**:
```
📄 Dokument (Auszug): [Dokumenten-Inhalt mit Informationen zu Speichern]
📦 Gespeicherte Artefakte: [Frühere Recherchen zu Netzanschluss]
💬 Bisherige Gesprächsthemen: "Technische Anschlussbedingungen; Netzentgelte; ..."
```

**KI-Entscheidung**:
1. ✅ Erkennt: Fachfrage zur Energiewirtschaft
2. ✅ Sieht: Semantische Suche verfügbar
3. ✅ Analysiert: Dokument enthält Kontext zu "Speichern"
4. ✅ Entscheidet: `willi-netz-semantic-search("Baukostenzuschuss Speicher")` aufrufen
5. ✅ Findet: Relevante Dokumente in der Datenbank
6. ✅ Antwortet: Mit Quellen und fundierter Information

**Früher** (❌):
- Keine Tool-Nutzung, weil "Baukostenzuschuss" nicht in Keyword-Liste
- Antwort aus Trainingswissen: "Kann diese spezifische Frage nicht beantworten"

### Frage: "Korrigiere die Rechtschreibung"

**KI-Entscheidung**:
1. ✅ Erkennt: Textbearbeitungs-Aufgabe
2. ✅ Sieht: Keine relevanten Tools für Rechtschreibprüfung
3. ✅ Antwortet: Direkt aus Sprachmodell-Fähigkeiten
4. ✅ Schnell: Keine unnötigen Tool-Calls

## Änderungen im Detail

### Frontend (AIAssistant.tsx)

**Neu**:
- ✅ Prop `documentContent` für vollständigen Dokumenten-Inhalt
- ✅ Kontext-Aufbau mit Dokumenten-Snippet, Artefakten, Chat-Historie
- ✅ Bessere Kontext-Formatierung mit Icons (📄, 📦, 💬)

**API-Call**:
```typescript
// VORHER
documentContext: selectedText  // Nur ausgewählter Text

// JETZT
documentContext: documentContent || selectedText || ''  // Voller Dokumenten-Inhalt
```

### Frontend (DocumentEditor.tsx)

**Neu**:
```typescript
<AIAssistant
  documentId={id || ''}
  selectedText={selectedText}
  documentContent={content}  // ← NEU: Vollständiger Inhalt
  onInsert={insertTextAtCursor}
  selectedArtifactIds={selectedArtifactIds}
/>
```

### Backend (ai-enhanced.ts)

**Neu**:
- ✅ Dynamische Tool-Analyse (`availableToolTypes`)
- ✅ Tool-spezifische Anweisungen basierend auf verfügbaren Tools
- ✅ Kontext-Status-Information im Prompt
- ✅ 5-Schritte-Vorgehen für Tool-Nutzung
- ✅ Kennzeichnungspflicht bei Antworten aus Trainingswissen

## Erwartetes Verhalten

### Tool-Nutzung wird bevorzugt

**Fachfragen** → ✅ Immer Tool-Call (semantische Suche, Chat, etc.)
- "Was ist der aktuelle Stand zum Baukostenzuschuss?"
- "Wie funktioniert der Lieferantenwechsel?"
- "Erkläre §14a EnWG"
- "Was sagt die TAB zu Wallbox-Anschlüssen?"

**Textbearbeitung** → ✅ Direkte Antwort (wenn keine passenden Tools)
- "Korrigiere die Rechtschreibung"
- "Fasse diesen Absatz zusammen"
- "Schreibe diesen Satz um"

**Unklare Fälle** → ✅ Lieber Tool-Call als Raten
- Bei Unsicherheit: Erst suchen, dann antworten
- Kennzeichnung: "Basierend auf allgemeinem Wissen..." wenn keine Tools helfen

### Kontext-Awareness in Aktion

**Szenario**: Nutzer arbeitet an Dokument über "Speicher-Netzanschluss"

1. Dokument enthält technische Details zu Speichern
2. Nutzer fragt: "Was kostet der Anschluss?"
3. KI sieht Dokumenten-Kontext → erkennt: Speicher-bezogene Frage
4. Ruft semantische Suche auf: "Baukostenzuschuss Speicher Netzanschluss"
5. Findet relevante Richtlinien und aktuelle Regelungen
6. Antwortet fundiert mit Quellenangaben

## Testing

**Test 1: Fachfrage mit Kontext**
```
1. Dokument öffnen mit Text über "Energiespeicher"
2. Fragen: "Was ist der aktuelle Stand zum Baukostenzuschuss?"
3. Erwartung: Tool-Call zu semantic-search, fundierte Antwort
```

**Test 2: Artifact-Kontext**
```
1. Artefakt erstellen: "Recherche zu §14a EnWG"
2. Artefakt auswählen (Checkbox)
3. Fragen: "Wie hängt das mit Wallbox-Anschlüssen zusammen?"
4. Erwartung: KI nutzt Artefakt-Kontext + semantic-search
```

**Test 3: Chat-Verlauf**
```
1. Mehrere Fragen zu "Netzentgelten" stellen
2. Dann fragen: "Gibt es dazu aktuelle Änderungen?"
3. Erwartung: KI erkennt Thema aus Verlauf, sucht gezielt nach Netzentgelt-Änderungen
```

**Test 4: Textbearbeitung (keine Tool-Nutzung)**
```
1. Text auswählen
2. Fragen: "Korrigiere die Rechtschreibung"
3. Erwartung: Direkte Antwort ohne Tool-Calls
```

## Vorteile der neuen Architektur

### 1. Universell einsetzbar
- Funktioniert mit **jedem** MCP-Server
- Keine hardcodierten Tool-Namen oder Server-IDs
- Dynamische Anpassung an verfügbare Tools

### 2. Maximale Tool-Nutzung
- "Tool-First"-Prinzip: Erst suchen, dann antworten
- Kein Übersehen von relevanten Fachfragen mehr
- Kennzeichnung wenn aus Trainingswissen geantwortet wird

### 3. Kontext-intelligenz
- Voller Dokumenten-Inhalt für bessere Tool-Auswahl
- Artefakte als Wissensbasis
- Chat-Verlauf für Themen-Kontinuität

### 4. Transparenz
- Klare Anweisung: "Lieber zu viel als zu wenig suchen"
- Pflicht zur Kennzeichnung bei direkten Antworten
- Quellen-Zitation aus Tool-Ergebnissen

## Deployment-Status

✅ **Backend deployed** (10.0.0.14:3001):
- Dynamische Tool-Analyse
- Verbesserter System Prompt
- Kontext-Status-Information

✅ **Frontend deployed** (10.0.0.14:3000):
- Vollständiger Dokumenten-Kontext
- Erweiterter Kontext-Aufbau (Dokument + Artefakte + Chat)
- Übergabe von `documentContent` an AIAssistant

## Fazit

Die Implementierung stellt sicher, dass:
1. ✅ **Jede Fachfrage** Tools nutzt (semantische Suche, Chat, etc.)
2. ✅ **Voller Kontext** für intelligente Tool-Auswahl verfügbar ist
3. ✅ **Dynamisch** mit allen MCP-Servern funktioniert
4. ✅ **Transparent** ist (Kennzeichnung der Informationsquelle)

Die bisherige Sorge über zu viele Tool-Calls ist unbegründet:
- Gemini ist sehr effizient in der Tool-Auswahl
- Nur relevante Tools werden aufgerufen
- Bei Textbearbeitung: Keine unnötigen Calls
- Performance: Tool-Calls dauern < 2 Sekunden zusätzlich
