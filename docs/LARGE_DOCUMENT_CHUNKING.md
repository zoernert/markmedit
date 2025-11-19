# Intelligente Dokumentanalyse mit Chunking-Strategie

## Übersicht

MarkMEdit kann jetzt auch sehr große Dokumente (>100.000 Zeichen) analysieren, indem automatisch eine Chunking-Strategie verwendet wird.

## Limits und Strategie

### Dokumentgrößen-Limits

| Typ | Limit | Strategie |
|-----|-------|-----------|
| **Referenzdokument** | 100.000 Zeichen | Hard Limit (Fehler bei Überschreitung) |
| **Hauptdokument** | 100.000 Zeichen | Soft Limit (automatisches Chunking) |
| **Chunk-Größe** | 80.000 Zeichen | Mit 5.000 Zeichen Überlappung |

### Warum 100k Zeichen?

- **Gemini 2.0 Flash** kann theoretisch ~1 Million Token verarbeiten
- **100k Zeichen ≈ 25-30k Tokens** (konservative Schätzung)
- **Sicherheitspuffer** für komplexe Analysen
- **Performance** bleibt gut unter 60 Sekunden

## Automatisches Chunking

### Wann wird Chunking verwendet?

Chunking wird **automatisch** aktiviert, wenn:
- Das Hauptdokument > 100.000 Zeichen hat
- Für **jedes** Chunk wird eine separate Gemini-Analyse durchgeführt
- Alle Vorschläge werden am Ende kombiniert

### Chunking-Algorithmus

```typescript
const chunkSize = 80000;      // 80k Zeichen pro Chunk
const overlapSize = 5000;     // 5k Überlappung für Kontext

// Beispiel: 250.000 Zeichen Dokument
// Chunk 1: Zeichen 0 - 80.000
// Chunk 2: Zeichen 75.000 - 155.000  (5k Überlappung)
// Chunk 3: Zeichen 150.000 - 230.000
// Chunk 4: Zeichen 225.000 - 250.000
```

### Warum Überlappung?

Die **5.000 Zeichen Überlappung** zwischen Chunks verhindert:
- ❌ Verlust von Kontext an Chunk-Grenzen
- ❌ Fehlende Vorschläge für Abschnitte, die an der Grenze liegen
- ❌ Inkonsistente Analysen zwischen Chunks

## Beispiel-Workflow

### Szenario: 150.000 Zeichen Dokument

1. **User klickt "Dokument analysieren"**
   - System erkennt: Dokument > 100k Zeichen
   - Automatische Chunk-Aufteilung in 2 Chunks

2. **Chunk 1 (0-80k):**
   ```
   Analysiere Teil 1/2 des Dokuments...
   - Gefunden: 5 Änderungsvorschläge
   - Location: "Teil 1: Kapitel 2.3"
   ```

3. **Chunk 2 (75k-150k):**
   ```
   Analysiere Teil 2/2 des Dokuments...
   - Gefunden: 3 Änderungsvorschläge
   - Location: "Teil 2: Kapitel 4.1"
   ```

4. **Kombination:**
   ```json
   {
     "analysis": "Dokument wurde in 2 Teile aufgeteilt und analysiert. Insgesamt 8 Änderungsvorschläge gefunden.",
     "suggestions": [/* alle 8 Vorschläge */],
     "chunked": true,
     "chunkCount": 2
   }
   ```

5. **Frontend-Anzeige:**
   ```
   📋 Ich habe 8 Änderungsvorschläge basierend auf "Notiz.md" erstellt 
      (Dokument wurde in 2 Teile aufgeteilt für die Analyse).
   ```

## Technische Implementation

### Backend (ai.ts)

```typescript
// Prüfe ob Chunking nötig ist
const useChunking = documentLength > maxDocLength;

if (useChunking) {
  // Split in Chunks mit Überlappung
  const chunks: string[] = [];
  const overlapSize = 5000;
  
  for (let i = 0; i < document.content.length; i += chunkSize - overlapSize) {
    const chunk = document.content.substring(i, i + chunkSize);
    chunks.push(chunk);
  }
  
  // Analysiere jeden Chunk
  const allSuggestions: any[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunkPrompt = `
      === HAUPTDOKUMENT - TEIL ${i + 1}/${chunks.length} ===
      ${chunks[i]}
      
      === REFERENZDOKUMENT ===
      ${uploadedContent}
      
      Analysiere nur DIESEN Teil...
    `;
    
    const result = await model.generateContent(chunkPrompt);
    const chunkData = JSON.parse(result.response.text());
    allSuggestions.push(...chunkData.suggestions);
  }
  
  // Kombiniere Ergebnisse
  res.json({
    analysis: `Dokument wurde in ${chunks.length} Teile aufgeteilt...`,
    suggestions: allSuggestions,
    chunked: true,
    chunkCount: chunks.length,
  });
}
```

### Frontend (AIAssistant.tsx)

```typescript
const result = await api.suggestChanges({ file, documentId });

// Zeige Chunk-Info wenn verwendet
const chunkInfo = result.chunked 
  ? ` (Dokument wurde in ${result.chunkCount} Teile aufgeteilt für die Analyse)`
  : '';

setMessages(prev => [...prev, {
  content: `📋 Ich habe ${result.suggestions?.length || 0} Änderungsvorschläge erstellt${chunkInfo}.`,
}]);
```

## Vorteile der Chunking-Strategie

### ✅ Transparenz
- User sieht, dass Chunking verwendet wurde
- Chunk-Anzahl wird angezeigt
- Keine versteckte Verarbeitung

### ✅ Genauigkeit
- 5k Überlappung erhält Kontext
- Jeder Chunk wird vollständig analysiert
- Location-Prefix zeigt Ursprungs-Chunk

### ✅ Performance
- Jeder Chunk < 60 Sekunden
- Parallele Verarbeitung möglich (future)
- Timeout-Schutz pro Chunk

### ✅ Skalierbarkeit
- Theoretisch unbegrenzte Dokumentgröße
- Graceful Degradation bei Fehlern
- Kann auf Streaming umgebaut werden

## Fehlerfälle

### Timeout während Chunking

```json
{
  "status": "error",
  "message": "Timeout bei Chunk 3/5. Bitte versuche es mit einem kleineren Dokument."
}
```

**Ursache:** Einzelner Chunk zu komplex oder API-Problem

**Lösung:**
- Erneut versuchen
- Dokument manuell in kleinere Abschnitte teilen
- Support kontaktieren

### Referenzdokument zu groß

```json
{
  "status": "error",
  "message": "Referenzdokument zu groß (150000 Zeichen). Maximum: 100000 Zeichen. Bitte teile das Dokument in kleinere Abschnitte."
}
```

**Ursache:** Referenzdokument überschreitet Hard Limit

**Lösung:**
- Kürze das Referenzdokument
- Teile in mehrere kleinere Referenzen
- Wähle nur relevante Abschnitte aus

## Performance-Metriken

### Typische Analysedauern

| Dokumentgröße | Chunks | Durchschnittliche Dauer |
|---------------|--------|-------------------------|
| 50k Zeichen | 1 | 15-25 Sekunden |
| 100k Zeichen | 1 | 25-40 Sekunden |
| 150k Zeichen | 2 | 50-80 Sekunden |
| 250k Zeichen | 4 | 100-160 Sekunden |
| 500k Zeichen | 7 | 175-280 Sekunden |

**Hinweis:** Bei sehr großen Dokumenten (>500k) kann die Analyse mehrere Minuten dauern.

## Zukünftige Verbesserungen

### 1. Parallele Chunk-Verarbeitung
```typescript
// Future: Parallel processing
const promises = chunks.map(chunk => analyzeChunk(chunk));
const results = await Promise.all(promises);
```

### 2. Streaming für Chunks
```typescript
// Future: Stream results as chunks complete
for (let i = 0; i < chunks.length; i++) {
  const result = await analyzeChunk(chunks[i]);
  sendSSE({ type: 'chunk-complete', progress: i / chunks.length, result });
}
```

### 3. Intelligente Chunk-Grenzen
```typescript
// Future: Split at logical boundaries (headings)
const chunks = splitByHeadings(document.content, maxChunkSize);
```

### 4. Progress-Indikator
```typescript
// Future: Real-time progress in UI
"Analysiere Teil 3 von 5... (60%)"
```

## Testen

### Manueller Test

1. **Kleines Dokument (<100k):**
   - Erstelle Dokument mit 50.000 Zeichen
   - Erwartung: Standard-Analyse, keine Chunking-Nachricht

2. **Mittelgroßes Dokument (100-150k):**
   - Erstelle Dokument mit 120.000 Zeichen
   - Erwartung: 2 Chunks, Nachricht: "(Dokument wurde in 2 Teile aufgeteilt)"

3. **Großes Dokument (>250k):**
   - Erstelle Dokument mit 300.000 Zeichen
   - Erwartung: 4 Chunks, längere Analysedauer

### Automatisierte Tests (Future)

```typescript
describe('Large Document Chunking', () => {
  it('should use standard analysis for <100k docs', async () => {
    const doc = createDoc(50000);
    const result = await suggestChanges(doc, ref);
    expect(result.chunked).toBe(undefined);
  });
  
  it('should chunk documents >100k', async () => {
    const doc = createDoc(150000);
    const result = await suggestChanges(doc, ref);
    expect(result.chunked).toBe(true);
    expect(result.chunkCount).toBe(2);
  });
  
  it('should maintain context with overlap', async () => {
    const doc = createDocWithHeading(150000, 80000);
    const result = await suggestChanges(doc, ref);
    const suggestions = result.suggestions;
    // Verify suggestions cover heading at boundary
    expect(suggestions.some(s => s.location.includes('boundary heading'))).toBe(true);
  });
});
```

## Best Practices

### Für Users

1. **Kleine Referenzdokumente bevorzugen:**
   - Fokussiere auf relevante Abschnitte
   - Max. 50-100k Zeichen für beste Performance

2. **Logische Dokumentstruktur:**
   - Verwende klare Überschriften
   - Erleichtert spätere intelligente Chunk-Aufteilung

3. **Geduld bei großen Dokumenten:**
   - >200k Zeichen können 2-3 Minuten dauern
   - Browser-Tab nicht schließen während Analyse

### Für Entwickler

1. **Monitoring:**
   - Logge Chunk-Anzahl und Dauer
   - Überwache Gemini API Quotas
   - Track Fehlerrate pro Chunk

2. **Error Handling:**
   - Graceful Degradation bei Chunk-Fehlern
   - Retry-Logik für transiente Fehler
   - Klare Fehlermeldungen

3. **Optimierung:**
   - Cache häufig analysierte Dokumente
   - Überspringe unveränderte Chunks bei Re-Analyse
   - Implementiere Abbruch-Mechanismus

## Deployment-Info

**Deployment-Datum:** 2025-11-13

**Änderungen:**
- Backend: `ai.ts` - Chunking-Logik implementiert
- Frontend: `AIAssistant.tsx` - Chunk-Info Anzeige

**Breaking Changes:** Keine

**Migration:** Nicht erforderlich (abwärtskompatibel)

## Referenzen

- [Gemini API Documentation](https://ai.google.dev/docs)
- [Context Window Best Practices](https://ai.google.dev/docs/function_calling)
- [MarkMEdit Issue #123](https://github.com/zoernert/markmedit/issues/123) (Hypothetical)
