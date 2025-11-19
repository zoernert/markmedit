# Gemini 3.0 Migration Guide

## Übersicht

MarkMEdit wurde erfolgreich auf **Gemini 3.0 Pro Preview** migriert, Googles neuestes und leistungsfähigstes KI-Modell. Diese Migration bringt erhebliche Verbesserungen in Reasoning-Fähigkeiten, Kontextverständnis und multimodaler Verarbeitung.

## Was ist neu in Gemini 3.0?

### 1. **Fortgeschrittene Reasoning-Fähigkeiten**
Gemini 3.0 nutzt dynamisches Thinking, um komplexe Anfragen durchdacht zu bearbeiten:
- Tieferes logisches Denken für komplexe Dokumentenanalysen
- Verbesserte Problemlösungsfähigkeiten
- Besseres Verständnis von Kontext und Nuancen

### 2. **Thinking Level Control**
Neue Steuerung der Denktiefe über den `thinking_level` Parameter:
- **`low`**: Schnellere Antworten für einfache Aufgaben (minimale Latenz)
- **`high`** (Standard): Maximale Reasoning-Tiefe für komplexe Analysen

### 3. **Optimierte Temperature-Einstellung**
- **Standard: 1.0** - Optimal für Gemini 3's Reasoning-Fähigkeiten
- Niedrigere Werte können zu Looping oder Performance-Problemen führen
- Alle Temperature-Einstellungen wurden auf 1.0 aktualisiert

### 4. **Verbesserte Multimodale Fähigkeiten**
- Besseres Dokumentenverständnis (PDFs, Bilder)
- Präzisere OCR und Text-Extraktion
- Erweiterte Video-Analyse-Fähigkeiten

### 5. **Thought Signatures**
Gemini 3 verwendet verschlüsselte Thought Signatures zur Aufrechterhaltung des Reasoning-Kontexts über API-Aufrufe hinweg (automatisch von den offiziellen SDKs verwaltet).

## Durchgeführte Änderungen

### Konfiguration

#### `backend/src/config/index.ts`
```typescript
gemini: z.object({
  apiKey: z.string().min(1),
  model: z.string().default('gemini-3-pro-preview'),  // ✅ Aktualisiert
  thinkingLevel: z.enum(['low', 'high']).optional(),   // ✅ Neu
}),
```

#### `.env.example`
```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3-pro-preview               # ✅ Aktualisiert
# Optional: Thinking-Level steuern
# GEMINI_THINKING_LEVEL=high                    # ✅ Neu
```

### Code-Anpassungen

#### Model References
Alle Referenzen wurden aktualisiert:
- ✅ `backend/src/config/index.ts` - Standard-Modell
- ✅ `backend/src/routes/ai.ts` - Alle hardcodierten Modellnamen
- ✅ `backend/src/routes/ai-enhanced.ts` - Tool-gestützte AI-Funktionen
- ✅ Alle Service-Dateien nutzen jetzt `config.gemini.model`

#### Temperature Einstellungen
Alle Temperature-Werte wurden auf **1.0** gesetzt (Gemini 3 Empfehlung):
- ✅ `backend/src/routes/ai.ts` - Dokumentenanalyse
- ✅ `backend/src/services/document-summary.ts` - Zusammenfassungen
- ✅ `backend/src/services/document-helpers.ts` - Titel-Generierung
- ✅ `backend/src/services/document-converter.ts` - Präsentations-Konvertierung

### Dokumentation
- ✅ `docs/DEEP_RESEARCH_DEPLOYMENT.md` - Deployment-Konfiguration
- ✅ `docs/RESEARCH_TOOLS.md` - Research Tools Dokumentation

## Konfiguration & Verwendung

### Basis-Konfiguration (empfohlen)

```bash
# .env
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-3-pro-preview
```

Das Modell nutzt standardmäßig `thinking_level: high` für beste Ergebnisse.

### Erweiterte Konfiguration

#### Für schnellere Antworten (einfache Aufgaben)
```bash
GEMINI_MODEL=gemini-3-pro-preview
GEMINI_THINKING_LEVEL=low
```

Geeignet für:
- Einfache Textgenerierung
- Chat-Interaktionen
- Hohe Durchsatzanwendungen

#### Für maximale Reasoning-Tiefe (Standard)
```bash
GEMINI_MODEL=gemini-3-pro-preview
GEMINI_THINKING_LEVEL=high
```

Geeignet für:
- Komplexe Dokumentenanalysen
- Deep Research Workflows
- Wissenschaftliche Zusammenfassungen
- Strukturierte Datenextraktion

## Migration für Entwickler

### Wenn Sie MarkMEdit erweitern

1. **Verwenden Sie immer `config.gemini.model`**:
   ```typescript
   const model = genAI.getGenerativeModel({ 
     model: config.gemini.model  // ✅ Richtig
   });
   ```

2. **Temperature auf 1.0 lassen**:
   ```typescript
   generationConfig: {
     temperature: 1.0,  // ✅ Gemini 3 optimiert
   }
   ```

3. **Keine niedrigen Temperature-Werte verwenden**:
   ```typescript
   // ❌ Vermeiden - kann zu Problemen führen
   temperature: 0.1,
   temperature: 0.3,
   
   // ✅ Verwenden Sie stattdessen thinking_level
   GEMINI_THINKING_LEVEL=high
   ```

## Vorteile für MarkMEdit

### 1. Verbesserte Dokumentenanalyse
- Präzisere Identifikation relevanter Abschnitte
- Besseres Verständnis von Dokumentenstruktur
- Genauere Zusammenfassungen

### 2. Bessere Research-Workflows
- Intelligentere Tool-Auswahl im MCP-System
- Effektivere Multi-Source-Integration
- Tiefere Analyse von Forschungsergebnissen

### 3. Optimierte Präsentations-Generierung
- Strukturiertere Slide-Layouts
- Bessere Inhaltszusammenfassung
- Intelligentere Visualisierungs-Vorschläge

### 4. Erweiterte AI-Features
- Verbesserte Kontext-Enrichment-Vorschläge
- Präzisere Änderungsvorschläge
- Bessere semantische Suche

## Bekannte Unterschiede & Anpassungen

### Verbositäts-Änderung
Gemini 3 ist standardmäßig **weniger verbose** als Gemini 2.x:
- Fokussiert auf direkte, präzise Antworten
- Weniger "plaudernd" im Ton
- Falls ausführlichere Antworten gewünscht sind, im Prompt explizit anfordern

### Token-Verbrauch
- **PDFs**: Möglicherweise höherer Token-Verbrauch durch verbesserte OCR
- **Videos**: Tendenziell niedrigerer Token-Verbrauch
- **Text**: Ähnlich wie Gemini 2.x

### Context Window
- **Input**: 1 Million Tokens
- **Output**: Bis zu 64k Tokens
- Context Caching wird unterstützt (Min. 2048 Tokens)

## Preise

Gemini 3.0 Pro Preview Pricing:
- **Standard** (<200k Tokens): $2 / 1M Input, $12 / 1M Output
- **Extended** (>200k Tokens): $4 / 1M Input, $18 / 1M Output

*Hinweis: Keine kostenlose Tier-Verfügbarkeit für API-Nutzung (Google AI Studio weiterhin kostenlos für Tests).*

## Troubleshooting

### Problem: Langsame erste Antwort
**Ursache**: `thinking_level: high` benötigt mehr Zeit für initiales Reasoning.
**Lösung**: Für einfache Aufgaben `GEMINI_THINKING_LEVEL=low` setzen.

### Problem: Unerwartete Schleifen
**Ursache**: Temperature < 1.0 kann zu Looping führen.
**Lösung**: Sicherstellen, dass Temperature auf 1.0 steht (bereits in dieser Migration korrigiert).

### Problem: "400 Bad Request" mit Function Calling
**Ursache**: Fehlende Thought Signatures bei Multi-Step-Funktionsaufrufen.
**Lösung**: Die offiziellen Google AI SDK verwalten dies automatisch. Bei manueller Implementierung Dokumentation prüfen.

## Weiterführende Ressourcen

- [Offizielle Gemini 3 Developer Guide](https://ai.google.dev/gemini-api/docs/gemini-3)
- [Thinking Levels Cookbook](https://colab.research.google.com/github/google-gemini/cookbook/blob/main/quickstarts/Get_started_thinking_REST.ipynb#gemini3)
- [Gemini 3 Quickstart](https://colab.research.google.com/github/google-gemini/cookbook/blob/main/quickstarts/Get_started.ipynb)

## Rollback (falls erforderlich)

Falls Sie zu Gemini 2.x zurückkehren möchten:

```bash
# .env
GEMINI_MODEL=gemini-2.0-flash-exp
# GEMINI_THINKING_LEVEL nicht gesetzt (wird ignoriert)
```

**Hinweis**: Temperature-Werte bei 1.0 zu belassen ist auch für Gemini 2.x sicher und funktioniert gut.

## Zusammenfassung

✅ **Migration abgeschlossen**: MarkMEdit nutzt jetzt Gemini 3.0 Pro Preview  
✅ **Alle Komponenten aktualisiert**: Konfiguration, Code, Dokumentation  
✅ **Optimiert für Gemini 3**: Temperature 1.0, optionales Thinking Level  
✅ **Rückwärtskompatibel**: Umgebungsvariable erlaubt weiterhin Modellwechsel  
✅ **Produktionsbereit**: Alle Tests bestanden, volle Funktionalität erhalten  

---

**Stand**: November 2025  
**Version**: 1.0  
**Kontakt**: Bei Fragen oder Problemen bitte GitHub Issues erstellen
