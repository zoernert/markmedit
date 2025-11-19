# Mittelweg: Ausgewogene Kontext-Optimierung

## Motivation

Nach der initialen Optimierung (sehr kompakt) wurde ein **Mittelweg** gewählt:
- **Ausreichend Kontext** für gute AI-Antworten
- **Nicht überladen** für Performance und Kosten
- **Klare Instruktionen** für Tool-First-Ansatz

## Änderungen im Detail

### 1. Backend System Prompt (ai-enhanced.ts)

**Vorher (ultra-kompakt)**:
```typescript
Intelligenter Assistent für deutsche Energiewirtschaft mit Zugriff auf Wissensdatenbanken.

🔧 Tools: 📚 Semantische Suche | 💬 Chat-Tool | ...

⚠️ REGEL - Tool-First:
1. IMMER erst Tools nutzen, dann antworten
...
```
→ **~400 Zeichen**

**Nachher (ausgewogen)**:
```typescript
Du bist ein intelligenter Assistent für die deutsche Energiewirtschaft 
mit Zugriff auf spezialisierte Wissensdatenbanken.

🔧 Verfügbare Tool-Kategorien:

📚 SEMANTISCHE SUCHE verfügbar:
   - Nutze diese bei JEDER Fachfrage zu Energiewirtschaft, bevor du antwortest
   - Suche nach relevanten Dokumenten, Richtlinien, Regelwerken
   - Auch bei Begriffen wie "Baukostenzuschuss", "§14a", "TAB", "Netzentgelte" → erst suchen!

💬 CHAT-TOOL verfügbar:
   - Für komplexe Fachfragen mit Kontext-Verständnis
   - Nutze dies als Alternative oder Ergänzung zur semantischen Suche

⚠️ WICHTIGSTE REGEL - Tool-First-Ansatz:
1. IMMER erst Tools befragen, bevor du eine Antwort aus deinem Trainingswissen gibst
2. Nutze Dokumentenkontext und Chat-Verlauf, um zu entscheiden, welche Tools relevant sind
3. Bei Unsicherheit: Lieber 2-3 Tools aufrufen als direkt zu antworten
4. Erst wenn ALLE relevanten Tools KEINE hilfreichen Informationen liefern, darfst du aus deinem Wissen antworten
5. Wenn du aus deinem Wissen antwortest, kennzeichne dies: "Basierend auf allgemeinem Wissen (nicht aus Datenbanken):"

🎯 Vorgehen bei Fragen:
1. Analysiere die Frage und den Kontext
2. Identifiziere relevante Tools
3. Rufe Tools auf - lieber zu viel als zu wenig!
4. Synthetisiere die Tool-Ergebnisse zu einer Antwort
5. Zitiere Quellen und Tool-Ergebnisse explizit

Antworte IMMER auf Deutsch. Sei präzise und transparent über deine Informationsquellen.
```
→ **~1.000 Zeichen** (150% mehr als ultra-kompakt, aber 33% weniger als Original)

**Vorteile**:
- ✅ Klare Beispiele ("Baukostenzuschuss", "§14a") → AI erkennt Fachbegriffe besser
- ✅ Ausführlichere Tool-Beschreibungen → AI weiß, wann welches Tool zu nutzen ist
- ✅ 5-Schritte-Anleitung → strukturiertes Vorgehen
- ✅ Explizite Kennzeichnung bei Trainingswissen → Transparenz

### 2. Frontend Kontext-Building (AIAssistant.tsx)

**Vorher (ultra-kompakt)**:
```typescript
// 1. Document context
const wordCount = documentContent.split(/\s+/).length;
contextParts.push(`📄 Dokument-Info: ${wordCount} Wörter, vollständiger Inhalt verfügbar`);

// 2. Artifacts
const artifactPreview = artifactContext.slice(0, 300);
contextParts.push(`📦 Artefakte: ${artifactPreview}...`);

// 3. Chat history
const recentTopics = messages.slice(-2).map(m => m.content.slice(0, 80)).join('; ');
contextParts.push(`💬 Themen: ${recentTopics}`);
```

**Nachher (ausgewogen)**:
```typescript
// 1. Document context with meaningful preview
const wordCount = documentContent.split(/\s+/).length;
const firstLines = documentContent.split('\n').slice(0, 3).join('\n').slice(0, 200);
contextParts.push(`📄 Dokument: ${wordCount} Wörter\nBeginn: ${firstLines}...`);

// 2. Artifacts with names
const artifactNames = artifactContext.split('\n')
  .filter(line => line.trim())
  .slice(0, 5)
  .join(', ');
contextParts.push(`📦 Artefakte: ${artifactNames}...`);

// 3. Chat history with more context
const recentTopics = messages.slice(-3).map(m => m.content.slice(0, 100)).join('; ');
contextParts.push(`💬 Bisherige Themen: ${recentTopics}`);
```

**Vorteile**:
- ✅ **Dokumenten-Beginn** (erste 3 Zeilen, 200 Zeichen) → AI sieht Dokumentenstruktur/Thema
- ✅ **Artefakt-Namen** statt nur Vorschau → AI weiß, welche Artefakte verfügbar sind
- ✅ **3 Chat-Nachrichten à 100 Zeichen** (statt 2 à 80) → besserer Kontext-Verlauf

## Vergleich: Prompt-Größen

### Beispiel: Kleines Dokument (5.000 Wörter)

| Komponente | Ultra-Kompakt | Ausgewogen | Unterschied |
|------------|---------------|------------|-------------|
| **Backend System Prompt** | 400 Zeichen | 1.000 Zeichen | +150% |
| **Frontend Kontext** | ~250 Zeichen | ~500 Zeichen | +100% |
| **Dokumenten-Context** | "5000 Wörter" | "5000 Wörter + Erste 3 Zeilen" | +200 Zeichen |
| **Chat-Historie** | 160 Zeichen | 300 Zeichen | +87% |
| **Artefakte** | 300 Zeichen | ~150 Zeichen | -50% (effizienter) |
| **GESAMT Message** | ~1.110 Zeichen | ~1.950 Zeichen | +76% |

**Token-Estimate**:
- Ultra-Kompakt: ~280 Tokens
- Ausgewogen: ~490 Tokens
- **Unterschied: +210 Tokens** (immer noch **weit unter** Gemini's 1M Limit!)

### Beispiel: Großes Dokument (50.000 Zeichen, wie "Großspeicher Strategie")

| Komponente | Ultra-Kompakt | Ausgewogen | Unterschied |
|------------|---------------|------------|-------------|
| **Backend System Prompt** | 400 Zeichen | 1.000 Zeichen | +150% |
| **Frontend Kontext** | ~250 Zeichen | ~500 Zeichen | +100% |
| **Dokumenten-Context** | "50000 Wörter" | "50000 Wörter + Erste 200 Zeichen" | +200 Zeichen |
| **Chat-Historie** | 160 Zeichen | 300 Zeichen | +87% |
| **Artefakte** | 300 Zeichen | ~150 Zeichen | -50% |
| **GESAMT Message** | ~1.110 Zeichen | ~2.150 Zeichen | +94% |
| **+ documentContext (Backend)** | 50.000 Zeichen | 50.000 Zeichen | 0% |
| **TOTAL** | ~51.110 Zeichen | ~52.150 Zeichen | +2% |

**Token-Estimate**:
- Ultra-Kompakt: ~12.780 Tokens
- Ausgewogen: ~13.040 Tokens
- **Unterschied: +260 Tokens (+2%)**

**Wichtig**: Bei großen Dokumenten macht der **Message-Overhead kaum einen Unterschied** (nur 2%), weil das Dokument selbst dominiert!

## Kostenvergleich (Gemini 2.5 Flash)

**Pricing** (Stand Nov 2025):
- Input: $0.075 per 1M Tokens
- Output: $0.30 per 1M Tokens

**Beispiel-Anfrage** (großes Dokument, 3 Tool-Calls):

| Version | Input Tokens | Output Tokens | Kosten |
|---------|--------------|---------------|--------|
| **Ultra-Kompakt** | 12.780 + 3×5.000 = 27.780 | 500 | $0.0023 |
| **Ausgewogen** | 13.040 + 3×5.000 = 28.040 | 500 | $0.0023 |
| **Unterschied** | +260 Tokens | 0 | **+$0.00002** |

→ **Vernachlässigbar**: 0,002 Cent mehr pro Anfrage!

## Performance-Vergleich

**Verarbeitungszeit** (geschätzt, basierend auf Gemini-Benchmarks):

| Prompt-Größe | Ultra-Kompakt | Ausgewogen | Unterschied |
|--------------|---------------|------------|-------------|
| **Initial Processing** | 2,5 Sekunden | 2,7 Sekunden | +0,2s (+8%) |
| **Tool-Calls (3x)** | 30 Sekunden | 30 Sekunden | 0s |
| **Response Generation** | 2 Sekunden | 2 Sekunden | 0s |
| **GESAMT** | ~34,5 Sekunden | ~34,7 Sekunden | **+0,2s (+0,6%)** |

→ **Vernachlässigbar**: 200ms länger bei 34+ Sekunden Gesamtzeit!

## Vorteile des Mittelwegs

### 1. Bessere AI-Antworten
- ✅ **Kontext-Awareness**: AI sieht Dokumenten-Beginn → versteht Thema besser
- ✅ **Klare Beispiele**: "Baukostenzuschuss", "§14a" → AI erkennt Fachbegriffe
- ✅ **Längere Chat-Historie**: 3 statt 2 Nachrichten → besserer Gesprächsfluss
- ✅ **Ausführlichere Tool-Beschreibungen**: AI weiß genau, wann welches Tool zu nutzen ist

### 2. Immer noch effizient
- ✅ **Minimaler Overhead**: Nur +260 Tokens bei großen Dokumenten (+2%)
- ✅ **Kosten**: +0,002 Cent pro Anfrage (vernachlässigbar)
- ✅ **Performance**: +200ms bei 35s Gesamtzeit (+0,6%)
- ✅ **Weit unter Limits**: 13k Tokens vs. 1M Limit (nur 1,3% Auslastung!)

### 3. Bessere Wartbarkeit
- ✅ **Lesbar**: System-Prompt ist gut strukturiert und verständlich
- ✅ **Erweiterbar**: Neue Tools können einfach mit Beschreibungen hinzugefügt werden
- ✅ **Debugbar**: Kontext-Informationen helfen beim Nachvollziehen von AI-Entscheidungen

## Fazit

Der **Mittelweg** bietet das **Beste aus beiden Welten**:

| Aspekt | Ultra-Kompakt | Mittelweg | Original (vor Optimierung) |
|--------|---------------|-----------|----------------------------|
| **Kontext-Qualität** | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Performance** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Kosten** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Wartbarkeit** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Tool-Auswahl** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **GESAMT** | **14/25** | **23/25** | **18/25** |

**Empfehlung**: ✅ **Mittelweg nutzen** - beste Balance zwischen Qualität und Effizienz!

## Nächste Schritte (optional)

1. **A/B-Testing**: Vergleiche Antwortqualität Ultra-Kompakt vs. Mittelweg in Produktion
2. **Monitoring**: Tracke Token-Verbrauch und Antwortzeiten über 1 Woche
3. **Fine-Tuning**: Passe Kontext-Limits basierend auf echten Nutzungsdaten an
4. **Dynamische Anpassung**: Reduziere Kontext automatisch, wenn Dokument >100k Zeichen

## Deployment-Status

✅ **Deployed**: 11. November 2025, 12:48 Uhr
- Backend: v0.1.0 (routes/ai-enhanced.js aktualisiert)
- Frontend: v0.1.0 (AIAssistant.tsx aktualisiert)
- Server: 10.0.0.14:3000/3001
- Status: Produktiv
