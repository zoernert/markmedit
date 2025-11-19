# Deep Research System - Living Documents

## Vision

MarkMEdit wird zu einer Plattform für **Living Documents** - Dokumente, die kontinuierlich mit neuem Wissen angereichert werden können. Anstatt statische Dokumente zu erstellen, ermöglicht das Deep Research System:

- 🔬 **Echte Web-Recherche** mit aktuellen Quellen
- 🧠 **MCP-basierte Wissensabfragen** (Willi-Mako, Powabase, etc.)
- 📝 **Inkrementelle Anreicherung** - Sektion für Sektion
- 🎯 **Research Batches** aus gespeicherten Artefakten/Notizen
- ✅ **Diff/Apply Workflow** für kontrollierte Integration

## Terminologie-Änderung

### Aktuell (irreführend)
- **"Research Tools"** → Transformiert nur vorhandenes Wissen (Zusammenfassung, Outline, etc.)

### Neu (präzise)
- **"Transform Tools"** → Neuanordnung/Umformung vorhandener Inhalte
- **"Deep Research"** → Echte Recherche mit neuen Quellen (Web + MCP)

## Architektur

### 1. Transform Tools (umbenannt von Research)

**Zweck**: Vorhandenen Content transformieren ohne neue Quellen

**Features**:
- Zusammenfassung (Summary)
- Outline/Gliederung
- Vereinfachen/Erweitern
- Stil-Anpassung (akademisch, etc.)
- Podcast-Script-Generierung

**Komponente**: `TransformToolsPanel.tsx` (umbenannt von `ResearchToolsPanel`)

### 2. Deep Research System (NEU)

**Zweck**: Dokumente mit neuem Wissen anreichern

#### 2.1 Web-Recherche Integration

**API-Optionen**:
1. **Tavily** (empfohlen) - Spezialisiert auf AI Research
   - Vor-gefilterte, hochwertige Quellen
   - Optimiert für Fact-Checking
   - Preis: $0.25 per 1000 searches
   
2. **Exa** - Semantische Web-Suche
   - Neural search statt Keywords
   - Gute Integration mit LLMs
   
3. **Google Custom Search** - Fallback
   - Bekannt, zuverlässig
   - 10.000 freie Anfragen/Tag

**Entscheidung**: Tavily als primäre API, Google als Fallback

#### 2.2 MCP-basierte Recherche

**Verfügbare MCP Server**:
- **Willi-Mako**: Energiemarkt-Expertise (GPKE, WiM, EDIFACT, EnWG)
- **Powabase**: Marktstammdatenregister (MaStR) Abfragen

**Integration**:
```typescript
// Flexible MCP-Abfragen über bestehende Infrastruktur
POST /api/mcp/willi-mako/generic-call
POST /api/mcp/powabase/execute-query
```

#### 2.3 Hybrid Search & Synthesis

**Workflow**:
1. **Parallel Execution**: Web-Suche + MCP-Abfragen gleichzeitig
2. **Source Collection**: 
   - Web: Top 5-10 relevante Artikel/Papers
   - MCP: Strukturierte Daten + Fach-Kontext
3. **AI Synthesis**: Gemini analysiert alle Quellen + aktueller Dokumentkontext
4. **Structured Suggestions**: Diff-basierte Vorschläge wie bei Multi-Dokument

## Backend API Endpoints

### 3.1 Deep Research

```typescript
POST /api/ai/deep-research

Request:
{
  documentId: string;
  query: string;  // Optional - wenn nicht angegeben, aus selectedText
  selectedText?: string;  // Kontext für Recherche
  sectionContext?: string;  // Umgebender Text
  searchScope: {
    web: boolean;  // Tavily/Google Search
    mcp: string[];  // ['willi-mako', 'powabase', ...]
  };
  maxSources?: number;  // Default: 10
}

Response:
{
  success: boolean;
  sources: {
    web: Array<{
      title: string;
      url: string;
      snippet: string;
      relevanceScore: number;
    }>;
    mcp: Array<{
      server: string;
      data: any;
      summary: string;
    }>;
  };
  suggestions: Array<{
    section: string;
    action: 'insert_after' | 'replace' | 'new_section';
    content: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
    sources: string[];  // URLs/IDs der verwendeten Quellen
  }>;
  metadata: {
    researchDate: string;
    queriesExecuted: number;
    sourcesAnalyzed: number;
  };
}
```

### 3.2 Research Batch (Artefakt-basiert)

```typescript
POST /api/ai/research-batch

Request:
{
  documentId: string;
  artifactIds: string[];  // Artefakte als Research-Kontext
  researchQuery?: string;  // Optional: Spezifische Fragestellung
  searchScope: {
    web: boolean;
    mcp: string[];
  };
}

Response:
{
  success: boolean;
  artifactsAnalyzed: number;
  extractedTopics: string[];  // AI-extrahierte Themen aus Artefakten
  sources: { ... };  // Wie bei deep-research
  suggestions: [ ... ];  // Wie bei deep-research
}
```

### 3.3 Enrich Section

```typescript
POST /api/ai/enrich-section

Request:
{
  documentId: string;
  selectedText: string;
  beforeContext: string;  // 500 Zeichen vor Selektion
  afterContext: string;   // 500 Zeichen nach Selektion
  enrichmentGoal: 'expand' | 'update' | 'fact-check' | 'add-sources';
  searchScope: { ... };
}

Response:
{
  // Wie deep-research, aber fokussiert auf die Sektion
}
```

## Frontend Komponenten

### 4.1 TransformToolsPanel (umbenannt)

**Datei**: `frontend/src/components/TransformToolsPanel.tsx`

**Änderungen**:
- Umbenennung von `ResearchToolsPanel`
- Header: "Transform Tools" statt "Research Tools"
- Beschreibung: "Content transformieren und neu anordnen"
- Keine funktionalen Änderungen

### 4.2 DeepResearchPanel (NEU)

**Datei**: `frontend/src/components/DeepResearchPanel.tsx`

**Features**:

```tsx
interface DeepResearchPanelProps {
  documentId: string;
  documentContent: string;
  selectedText?: string;
  onSuggestionsGenerated: (suggestions: any) => void;
}

// UI Sections:
1. Research Query
   - Text input für manuelle Query
   - "Selected Text verwenden" Toggle
   - Kontext-Preview (zeigt selectedText)

2. Search Scope Configuration
   - Web-Suche Toggle (Tavily/Google)
   - MCP Server Checkboxes:
     ☐ Willi-Mako (Energiemarkt)
     ☐ Powabase (MaStR)
   - Max Sources Slider (5-20)

3. Quick Actions
   - 🔬 "Deep Research starten"
   - 📚 "Research Batch aus Artefakten" (öffnet Artefakt-Selektor)

4. Research Progress
   - Live-Updates während Recherche:
     - Web-Suche läuft... (5/10 Quellen)
     - MCP-Abfrage Willi-Mako... (3/3 abgeschlossen)
     - AI-Synthese... (Analysiere 15 Quellen)

5. Results
   - Sources Panel (expandable)
     - Web-Quellen mit Links
     - MCP-Daten mit Zusammenfassungen
   - Suggestions werden an Parent übergeben
     - DocumentEditor zeigt in DocumentSuggestions
```

### 4.3 ArtifactsPanel Enhancement

**Datei**: `frontend/src/components/ArtifactsPanel.tsx`

**Neue Features**:

```tsx
// Batch Selection Mode
const [selectionMode, setSelectionMode] = useState(false);
const [selectedArtifactIds, setSelectedArtifactIds] = useState<Set<string>>(new Set());

// UI:
- Checkbox neben jedem Artefakt (wenn selectionMode = true)
- "🔬 Research Batch erstellen" Button (wenn selectedArtifactIds.size > 0)
- Click Handler:
  - Öffnet DeepResearchPanel
  - Übergibt selectedArtifactIds
  - Startet Research Batch API call
```

### 4.4 DocumentEditor Integration

**Datei**: `frontend/src/pages/DocumentEditor.tsx`

**Neue Features**:

```tsx
// Context Menu für Selection
const handleContextMenu = (e: MouseEvent) => {
  if (selectedText) {
    showMenu([
      { label: '🔬 Deep Research zu diesem Thema', action: handleDeepResearch },
      { label: '✨ Mit AI erweitern', action: handleEnrichSection },
      { label: '✓ Fakten überprüfen', action: handleFactCheck },
      // ... existing actions
    ]);
  }
};

// Deep Research Handler
const handleDeepResearch = async () => {
  // Trigger DeepResearchPanel mit selectedText
  // Zeigt Suggestions in DocumentSuggestions
  // Apply-Workflow wie bei Multi-Dokument
};
```

## Living Document Workflow

### Beispiel: Whitepaper iterativ überarbeiten

**Szenario**: Technisches Whitepaper über Energiespeicher-Integration

**Workflow**:

1. **Sektion 1: Einleitung**
   - User markiert Absatz über aktuelle Speichertechnologien
   - Rechtsklick → "🔬 Deep Research zu diesem Thema"
   - Web-Suche: Neueste Entwicklungen 2025
   - MCP (Powabase): Aktuelle MaStR-Zahlen zu Speichern
   - AI generiert Vorschläge zur Aktualisierung
   - User reviewt, akzeptiert relevante → Apply
   - **Sektion 1 aktualisiert ✓**

2. **Sektion 2: Technische Details**
   - User hat 3 Artefakte mit Notizen zu Batterietechnologien
   - Wechselt zu Artifacts Panel
   - Selektiert 3 Notizen → "🔬 Research Batch erstellen"
   - AI extrahiert Themen aus Notizen
   - Web-Suche + MCP zu extrahierten Themen
   - Generiert umfassende Vorschläge
   - User reviewt → Apply
   - **Sektion 2 angereichert ✓**

3. **Sektion 3: Regulatorische Anforderungen**
   - User markiert Paragraph über EnWG §14a
   - "Deep Research" mit MCP (Willi-Mako)
   - Aktuelle BNetzA-Regelungen abrufen
   - Vorschläge mit Quellenangaben
   - User reviewt → Apply
   - **Sektion 3 rechtlich aktualisiert ✓**

4. **Versionierung**
   - Jedes Apply → Git Commit
   - Commit Message: "Deep Research: [Thema] - [X] Quellen integriert"
   - Version History zeigt Research-Evolution
   - Kann zu jeder Version zurückkehren

**Ergebnis**: 
- Whitepaper basiert auf aktuellsten Quellen
- Kontinuierlich aktualisierbar
- Transparente Quellenangaben
- Nachvollziehbare Evolution

## Implementation Plan

### Phase 1: Umbenennung & Refactoring (2-3h)
- [ ] Backend: `research.ts` → Kommentare/Docs aktualisieren
- [ ] Frontend: `ResearchToolsPanel.tsx` → `TransformToolsPanel.tsx`
- [ ] Frontend: Alle Imports aktualisieren
- [ ] Frontend: UI-Texte anpassen ("Transform" statt "Research")
- [ ] Deployment & Testing

### Phase 2: Deep Research Backend (6-8h)
- [ ] Tavily API Integration
  - NPM Package: `@tavily/core`
  - Environment: `TAVILY_API_KEY`
  - Service: `backend/src/services/tavily.ts`
- [ ] Deep Research Endpoint
  - Route: `backend/src/routes/ai.ts` (zu bestehendem hinzufügen)
  - Logic: `POST /ai/deep-research`
  - Web + MCP parallel execution
  - Gemini Synthesis
- [ ] Research Batch Endpoint
  - Logic: `POST /ai/research-batch`
  - Artefakte laden
  - Topic Extraction mit Gemini
  - Deep Research basierend auf Topics
- [ ] Enrich Section Endpoint
  - Logic: `POST /ai/enrich-section`
  - Kontext-aware Research
  - Fokussierte Vorschläge

### Phase 3: Frontend Deep Research (8-10h)
- [ ] DeepResearchPanel Komponente
  - Query Input + Scope Config
  - Progress Indicators
  - Sources Display
- [ ] ArtifactsPanel Enhancement
  - Selection Mode
  - Research Batch Button
- [ ] DocumentEditor Integration
  - Context Menu für Selection
  - Deep Research Trigger
  - Suggestions Display (reuse DocumentSuggestions)
- [ ] API Client Methods
  - `api.deepResearch()`
  - `api.researchBatch()`
  - `api.enrichSection()`

### Phase 4: Integration & Testing (4-6h)
- [ ] End-to-End Workflow Tests
  - Web-Recherche zu Tech-Thema
  - MCP-Abfrage Willi-Mako
  - Research Batch mit 3 Artefakten
  - Inkrementelle Anreicherung über mehrere Sektionen
- [ ] Git Integration
  - Apply → Commit mit Sources Metadata
- [ ] Dokumentation
  - User Guide: Living Documents Workflow
  - API Docs: Deep Research Endpoints
  - Video: Whitepaper-Beispiel

### Phase 5: Optimierungen (optional, 4-6h)
- [ ] Source Caching (Redis)
  - Vermeidet doppelte Recherchen
- [ ] Smart Suggestion Ranking
  - ML-basierte Relevanz-Scores
- [ ] Research History
  - Zeigt vergangene Recherchen pro Dokument
- [ ] Collaborative Research
  - Mehrere User können Recherche-Vorschläge machen

## Environment Variables

```env
# Deep Research
TAVILY_API_KEY=tvly-xxx  # Tavily API Key
GOOGLE_SEARCH_API_KEY=xxx  # Fallback
GOOGLE_SEARCH_ENGINE_ID=xxx

# Feature Flags
ENABLE_DEEP_RESEARCH=true
ENABLE_WEB_SEARCH=true
MAX_RESEARCH_SOURCES=20
```

## Dependencies

### Backend
```json
{
  "@tavily/core": "^1.0.0",  // Tavily API Client
  "cheerio": "^1.0.0",  // HTML parsing (fallback scraping)
  "node-fetch": "^3.3.0"  // HTTP requests
}
```

### Frontend
```json
{
  // Keine zusätzlichen Dependencies nötig
}
```

## Kosten-Schätzung

### Tavily API
- **Free Tier**: 1000 searches/month
- **Pro**: $20/month für 10.000 searches
- **Für MarkMEdit**: Start mit Free Tier, Monitor Usage

### Google Custom Search (Fallback)
- **Free**: 100 queries/day (3000/month)
- **Paid**: $5 per 1000 queries (über 10k)

### Gesamt-Schätzung
- **Development Phase**: Free Tier ausreichend
- **Production (100 Users)**: ~$50-100/month (abhängig von Usage)

## Success Metrics

1. **Usage**:
   - Deep Research Calls pro Tag
   - Average Sources pro Research
   - Web vs MCP Search Ratio

2. **Quality**:
   - Suggestion Accept Rate
   - Sources Integration Rate
   - User Satisfaction (Feedback)

3. **Performance**:
   - Average Research Time (Ziel: <30s)
   - Source Quality Score
   - False Positive Rate

## Zusammenfassung

Das Deep Research System transformiert MarkMEdit von einem Markdown-Editor zu einer **Living Document Platform**:

✅ **Echte Recherche** mit Web + MCP statt nur Transformation
✅ **Inkrementelle Anreicherung** Sektion für Sektion
✅ **Research Batches** aus gespeicherten Notizen
✅ **Diff/Apply Workflow** für kontrollierte Integration
✅ **Git-basierte Versionierung** mit Source Metadata

**Next Steps**: Phase 1 (Umbenennung) starten → Phase 2 (Backend) → Phase 3 (Frontend)
