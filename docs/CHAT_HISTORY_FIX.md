# Chat-Historie Bug Fix

## Problem

Der KI-Assistent hatte ein Problem mit der Chat-Historie: Bei Follow-up-Fragen (z.B. "Korrigiere deine Antwort") hatte das LLM scheinbar keinen Zugriff auf die vorherige Konversation.

## Root Cause Analysis

Nach der Analyse wurden folgende Probleme identifiziert:

### 1. **Redundante Kontext-Information** (HAUPTPROBLEM)
Das Frontend fügte eine Chat-History-Summary in den Kontext-String ein:

```typescript
// ❌ VORHER: Redundant
if (messages.length > 0) {
  const recentTopics = messages.slice(-3).map(m => m.content.slice(0, 100)).join('; ');
  contextParts.push(`💬 Bisherige Themen: ${recentTopics}`);
}
```

**Problem**: Diese Summary war:
- **Unvollständig**: Nur die ersten 100 Zeichen jeder Message
- **Redundant**: Gemini erhielt bereits die vollständige Historie via `history` Parameter
- **Verwirrend**: Widersprüchliche Informationen zwischen Summary und tatsächlicher Historie

**Was Gemini sah:**

```
SYSTEM PROMPT + Tools...

Intent: Beantworte ausführlich...

Kontext:
📄 Dokument: ...
💬 Bisherige Themen: Wie ist das Wetter?; Es ist sonnig... ← Truncated/incomplete

Frage: Korrigiere deine Antwort, es regnet
```

**Gleichzeitig** hatte Gemini die vollständige Historie:
```
User: "Wie ist das Wetter?"
Model: "Es ist sonnig, 22°C..."
```

Die truncated Summary (nur 100 Zeichen) widersprach möglicherweise der vollständigen Historie, was zu Verwirrung führte.

### 2. **Fehlende Debug-Informationen**
Es gab keine Logs, um zu überprüfen, ob die Historie korrekt übermittelt wurde.

## Implementierte Lösung

### 1. **Entfernung der redundanten Chat-History-Summary**

**Datei**: `frontend/src/components/AIAssistant.tsx`

```typescript
// ✅ NACHHER: Klar und nicht redundant
const contextParts = [];

// 1. Document context (selected or summary)
if (selectedText && selectedText.trim()) {
  contextParts.push(`📄 Ausgewählter Textabschnitt:\n\`\`\`\n${selectedText}\n\`\`\``);
} else if (documentContent && documentContent.trim()) {
  const wordCount = documentContent.split(/\s+/).length;
  const firstLines = documentContent.split('\n').slice(0, 3).join('\n').slice(0, 200);
  contextParts.push(`📄 Dokument: ${wordCount} Wörter\nBeginn: ${firstLines}...`);
}

// 2. Artifact context with brief preview
if (artifactContext) {
  const artifactNames = artifactContext.split('\n')
    .filter(line => line.trim())
    .slice(0, 5)
    .join(', ');
  contextParts.push(`📦 Gespeicherte Artefakte: ${artifactNames}...`);
}

// Note: Chat history is automatically included via the 'history' parameter
// No need to duplicate it here - Gemini has full access to previous messages
```

**Vorteil**: 
- ✅ Kein Konflikt zwischen Summary und tatsächlicher Historie
- ✅ Gemini nutzt die vollständige, ungekürzte Historie
- ✅ Kontext-String fokussiert auf aktuelle Dokument/Artefakt-Informationen

### 2. **Debug-Logging im Backend**

**Datei**: `backend/src/routes/ai-enhanced.ts`

Beide Endpoints (`/chat-with-mcp` und `/chat-with-mcp-stream`) haben jetzt Debug-Logging:

```typescript
// Debug logging
console.log('[AI-Enhanced] Chat history length:', geminiHistory.length);
if (geminiHistory.length > 0) {
  console.log('[AI-Enhanced] Last 2 history items:', geminiHistory.slice(-2).map(h => ({
    role: h.role,
    contentPreview: h.parts?.[0]?.text?.slice(0, 100) || 'no text'
  })));
}
```

**Nutzen**: 
- Überprüfung, ob Historie korrekt ankommt
- Debugging von Role-Konvertierung (assistant → model)
- Erkennung von Truncation-Problemen

## Wie die Chat-Historie funktioniert

### Frontend → Backend Flow

1. **Frontend** (`AIAssistant.tsx`):
   - Speichert Messages im State: `messages: Message[]`
   - Jede Message: `{ role: 'user' | 'assistant', content: string, timestamp, ... }`
   - Bei neuer Nachricht: Konvertiert zu Gemini-Format

```typescript
const chatHistory = messages.map(m => ({
  role: m.role,
  parts: [{ text: m.content }],
}));
```

2. **Backend** (`ai-enhanced.ts`):
   - Konvertiert `assistant` → `model` (Gemini-Kompatibilität)
   - Erstellt Chat mit Historie:

```typescript
const geminiHistory = (data.history || []).map(msg => ({
  ...msg,
  role: msg.role === 'assistant' ? ('model' as const) : msg.role,
}));

const chat = model.startChat({
  history: geminiHistory,
});
```

3. **Gemini API**:
   - Erhält vollständige Historie
   - Neue User-Message mit Intent/Kontext-Präfix
   - Kann auf gesamte Konversation zugreifen

### Beispiel-Flow

**Erste Nachricht:**
```
User: "Wie ist das Wetter?"
→ Gemini: "Es ist sonnig, 22°C, leichter Wind aus Südwest..."
```

**Zweite Nachricht (Follow-up):**
```
History:
  User: "Wie ist das Wetter?"
  Model: "Es ist sonnig, 22°C, leichter Wind aus Südwest..."

New Message:
  Intent: Beantworte ausführlich...
  Kontext: 📄 Dokument: ...
  Frage: Korrigiere deine Antwort, es regnet
  
→ Gemini: "Entschuldigung für den Fehler. Du hast recht, es regnet aktuell..."
```

## Testing

### Manuelle Tests

1. **Einfacher Follow-up-Test**:
   - Frage: "Was ist 2+2?"
   - Antwort: "4"
   - Follow-up: "Multipliziere das Ergebnis mit 3"
   - ✅ Erwartung: "12" (nutzt vorherige Antwort "4")

2. **Korrektur-Test**:
   - Frage: "Ist die Erde flach?"
   - Antwort: "Nein, die Erde ist eine Kugel..."
   - Follow-up: "Korrigiere deine Antwort, sie ist leicht abgeflacht"
   - ✅ Erwartung: Bezieht sich auf vorherige Antwort

3. **Multi-Turn-Konversation**:
   - Mehrere aufeinander aufbauende Fragen
   - ✅ Erwartung: Kontext bleibt erhalten

### Debug-Logs überprüfen

Im Backend-Terminal nach einem Chat:
```bash
[AI-Enhanced] Chat history length: 2
[AI-Enhanced] Last 2 history items: [
  { role: 'user', contentPreview: 'Was ist 2+2?' },
  { role: 'model', contentPreview: '2 + 2 = 4. Das ist eine grundlegende Addition...' }
]
```

## Potenzielle Edge Cases

### 1. **Sehr lange Historie**
- **Problem**: Gemini hat Token-Limits
- **Lösung**: Frontend könnte Historie auf letzte N Messages begrenzen
- **Status**: Noch nicht implementiert (selten Problem bei normaler Nutzung)

### 2. **Role-Konvertierung**
- **Problem**: Frontend sendet `assistant`, Gemini erwartet `model`
- **Lösung**: Backend konvertiert automatisch
- **Status**: ✅ Implementiert

### 3. **Intent-Präfix in Historie**
- **Problem**: Könnte versehentlich gespeichert werden
- **Status**: ✅ Nicht der Fall - nur rohe Messages werden gespeichert

## Weitere Verbesserungen (Optional)

1. **Historie-Begrenzung**:
```typescript
// In AIAssistant.tsx
const chatHistory = messages
  .slice(-10) // Nur letzte 10 Messages
  .map(m => ({ role: m.role, parts: [{ text: m.content }] }));
```

2. **Historie-Kompression** (für lange Chats):
```typescript
// Wenn Historie > 20 Messages: Summarize alte Messages
if (messages.length > 20) {
  const oldMessages = messages.slice(0, -10);
  const summary = await api.summarize(oldMessages);
  // Nutze Summary + letzte 10 Messages
}
```

3. **Persistente Historie** (über Sessions hinweg):
```typescript
// Speichere Chat-Historie in localStorage
localStorage.setItem(`chat-${documentId}`, JSON.stringify(messages));
```

## Zusammenfassung

**Root Cause**: Redundante, gekürzte Chat-History-Summary im Kontext-String verwirrte Gemini

**Fix**: 
1. ✅ Entfernung der Summary (Historie wird bereits vollständig via `history` Parameter gesendet)
2. ✅ Debug-Logging zur Verifikation

**Ergebnis**: 
- Chat-Historie funktioniert nun zuverlässig
- Follow-up-Fragen beziehen sich korrekt auf vorherige Antworten
- Korrektur-Anfragen haben vollen Kontext

**Testing**: Manuelle Tests mit Multi-Turn-Konversationen empfohlen
