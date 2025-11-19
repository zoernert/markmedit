# Research Tools

MarkMEdit integriert leistungsstarke KI-gestützte Research Tools, inspiriert von [Open-Notebook](https://github.com/yourusername/open-notebook), die eine tiefere Analyse und Transformation von Dokumenteninhalten ermöglichen.

**Technologie:** Nutzt den bereits integrierten **Google Gemini 2.0 Flash** LLM für alle Transformationen.

## Überblick

Die Research Tools bieten vier Hauptfunktionen:

1. **Transformationen** - Intelligente Umformung von Inhalten
2. **Podcast-Generierung** - Erstellung von Podcast-Skripten
3. **Zitationsgenerierung** - Extraktion und Formatierung von Referenzen
4. **Forschungsfragen** - Generierung relevanter Fragen

## Konfiguration

### Umgebungsvariablen

Die Research Tools nutzen den bereits konfigurierten Gemini API Key:

```bash
# Gemini (bereits für AI Assistant konfiguriert)
GEMINI_API_KEY=your-api-key-here
GEMINI_MODEL=gemini-3-pro-preview
```

**Keine zusätzliche Konfiguration erforderlich!** Falls Gemini bereits für den AI Assistant läuft, funktionieren die Research Tools sofort.

## Funktionen

### 1. Transformationen

Transformiere Dokumentinhalte in verschiedene Formate:

#### Verfügbare Transformationstypen

| Typ | Beschreibung | Anwendungsfall |
|-----|--------------|----------------|
| `summary` | Zusammenfassung | Schneller Überblick über lange Texte |
| `outline` | Gliederung | Strukturierte Übersicht |
| `questions` | Fragen | Vertiefende Diskussionsfragen |
| `key-points` | Kernpunkte | Wesentliche Aussagen |
| `expand` | Erweitern | Detaillierte Ausarbeitung |
| `simplify` | Vereinfachen | Verständlichere Sprache |
| `academic` | Akademisch | Wissenschaftlicher Stil |
| `podcast-script` | Podcast-Skript | Dialogformat |

#### API-Endpunkt

```typescript
POST /api/research/transform
POST /api/research/documents/:documentId/transform

Body:
{
  "content": "...",           // Nur bei /transform
  "type": "summary",          // Transformationstyp
  "targetAudience": "Studenten" // Optional
}

Response:
{
  "result": "..."
}
```

#### Frontend-Nutzung

```typescript
import { api } from '../lib/api';

// Mit Document ID
const result = await api.transformDocument(
  documentId,
  'summary',
  'Studenten'
);

// Mit direktem Content
const result = await api.transformContent(
  content,
  'academic',
  'Experten'
);
```

### 2. Podcast-Generierung

Erstelle ein konversationsbasiertes Podcast-Skript mit mehreren Moderatoren.

#### Features

- 1-5 Moderatoren konfigurierbar
- Natürlicher Dialogfluss
- Themeneinführung und Zusammenfassung
- Rollenzuweisung (Moderator, Experte, etc.)

#### API-Endpunkt

```typescript
POST /api/research/podcast

Body:
{
  "content": "...",
  "numHosts": 2  // 1-5
}

Response:
{
  "script": "..."
}
```

#### Beispiel-Output

```
MODERATOR 1: Herzlich willkommen zu unserem Podcast über...

MODERATOR 2: Genau, und heute schauen wir uns speziell...

MODERATOR 1: Ein spannender Aspekt ist...
```

### 3. Zitationsgenerierung

Extrahiere relevante Zitate und formatiere sie in verschiedenen akademischen Stilen.

#### Unterstützte Stile

- **APA** (American Psychological Association)
- **MLA** (Modern Language Association)  
- **Chicago** (Chicago Manual of Style)

#### API-Endpunkt

```typescript
POST /api/research/citations

Body:
{
  "content": "...",
  "style": "apa"  // "apa" | "mla" | "chicago"
}

Response:
{
  "citations": [
    {
      "citation": "Müller, H. (2024). Title...",
      "context": "This appears in the context of..."
    }
  ]
}
```

### 4. Forschungsfragen

Generiere relevante Forschungsfragen basierend auf dem Dokumentinhalt.

#### Features

- Kategorisierte Fragen (methodisch, konzeptionell, empirisch, etc.)
- Verschiedene Schwierigkeitsgrade
- Kontextbezogen

#### API-Endpunkt

```typescript
POST /api/research/questions

Body:
{
  "content": "..."
}

Response:
{
  "questions": [
    {
      "question": "Wie könnte man...",
      "category": "methodological"
    }
  ]
}
```

## UI-Integration

### Research Tools Panel

Das Research Tools Panel ist in den Document Editor integriert und bietet eine intuitive Oberfläche für alle Funktionen.

#### Zugriff

1. Öffne ein Dokument im Editor
2. Wähle den Tab "🔬 Research" in der rechten Seitenleiste
3. Wähle die gewünschte Funktion

#### Workflow

1. **Transformation auswählen**
   - Wähle den Transformationstyp
   - Optional: Gib eine Zielgruppe an
   - Klicke "Transformieren"

2. **Ergebnis verwenden**
   - **Kopieren**: Kopiert das Ergebnis in die Zwischenablage
   - **Einfügen**: Fügt das Ergebnis an der Cursor-Position ein

3. **Iterieren**
   - Probiere verschiedene Transformationstypen
   - Passe die Zielgruppe an
   - Kombiniere mehrere Ergebnisse

## Authentifizierung & Berechtigungen

Alle Research Tools Endpoints erfordern:
- ✅ **Authentifizierung** (JWT Token)
- ✅ **Leseberechtigungen** auf das Dokument (bei document-spezifischen Endpoints)

```typescript
// Automatisch durch axios interceptor
headers: {
  'Authorization': 'Bearer <token>'
}
```

## Performance

### Timeouts

- Standard Requests: 30 Sekunden
- AI/Research Requests: 300 Sekunden (5 Minuten)

### Caching

Erwäge Caching für häufig verwendete Transformationen:

```typescript
// Beispiel: React Query mit Cache
const { data } = useQuery({
  queryKey: ['transform', documentId, type],
  queryFn: () => api.transformDocument(documentId, type),
  staleTime: 1000 * 60 * 5, // 5 Minuten
});
```

## Fehlerbehandlung

### Häufige Fehler

| Status | Fehler | Lösung |
|--------|--------|--------|
| 401 | Unauthorized | Token erneuern oder neu einloggen |
| 403 | Forbidden | Dokumentberechtigungen prüfen |
| 400 | Invalid request | Input-Validierung prüfen (Zod-Schema) |
| 500 | AI Provider Error | Logs prüfen, ggf. Provider-Keys validieren |

### Beispiel Error Handling

```typescript
try {
  const result = await api.transformDocument(id, 'summary');
  setResult(result.result);
} catch (error) {
  if (error.response?.status === 401) {
    // Redirect to login
  } else if (error.response?.status === 403) {
    alert('Keine Berechtigung für dieses Dokument');
  } else {
    alert('Fehler bei der Transformation');
  }
}
```

## Best Practices

### 1. Zielgruppen verwenden

Definiere eine klare Zielgruppe für bessere Ergebnisse:

```typescript
// Gut
api.transformDocument(id, 'summary', 'Gymnasialschüler')

// Weniger spezifisch
api.transformDocument(id, 'summary')
```

### 2. Iteratives Vorgehen

Kombiniere verschiedene Transformationen:

```typescript
// 1. Outline generieren
const outline = await api.transformDocument(id, 'outline');

// 2. Jeden Punkt erweitern
const expanded = await api.transformContent(outline, 'expand');

// 3. Akademisch umformulieren
const academic = await api.transformContent(expanded, 'academic');
```

### 3. Podcast-Skripte nachbearbeiten

Nutze Podcast-Skripte als Ausgangspunkt:

```typescript
const script = await api.generatePodcastScript(content, 2);
// Manuell bearbeiten, dann erneut transformieren
const polished = await api.transformContent(script, 'simplify');
```

## Architektur

### Service Layer

```typescript
// backend/src/services/research-tools.ts
class ResearchToolsService {
  private openai?: OpenAI;
  private anthropic?: Anthropic;
  
  async transform(content: string, type: string, audience?: string) {
    // Multi-provider fallback logic
  }
}
```

### Routes Layer

```typescript
// backend/src/routes/research.ts
router.post('/transform', authMiddleware, async (req, res) => {
  // Zod validation
  // Permission check (für document-spezifisch)
  // Service call
});
```

### Frontend API

```typescript
// frontend/src/lib/api.ts
export const api = {
  transformDocument: async (id, type, audience?) => {
    return await aiClient.post('/research/documents/${id}/transform', ...);
  }
};
```

## Roadmap

Geplante Erweiterungen:

- [ ] **Batch-Transformationen** - Mehrere Dokumente gleichzeitig
- [ ] **Custom Prompts** - Eigene Transformationstypen definieren
- [ ] **Export-Integration** - Direkt in DOCX/PDF exportieren
- [ ] **Collaboration** - Team-Annotationen und Kommentare
- [ ] **Version History** - Transformations-Historie speichern
- [ ] **Templates** - Vordefinierte Workflows
- [ ] **API Rate Limiting** - Schutz vor Missbrauch

## Troubleshooting

### "No AI provider configured"

**Problem**: Kein API-Key konfiguriert

**Lösung**:
```bash
# Mindestens einen Provider konfigurieren
export OPENAI_API_KEY=sk-...
# oder
export ANTHROPIC_API_KEY=sk-ant-...
```

### "Request timeout"

**Problem**: AI-Anfrage dauert zu lange

**Lösung**:
- Kürzere Inhalte verwenden
- Timeout erhöhen in `frontend/src/lib/api.ts`
```typescript
timeout: 600000, // 10 Minuten
```

### "Rate limit exceeded"

**Problem**: Zu viele Anfragen an AI-Provider

**Lösung**:
- Warte kurz und versuche es erneut
- Implementiere Client-seitiges Rate Limiting
- Erwäge Caching

## Support

Bei Fragen oder Problemen:
- GitHub Issues: [github.com/yourrepo/markmedit/issues](https://github.com/yourrepo/markmedit/issues)
- Dokumentation: [docs/](../docs/)
- Beispiele: [docs/WORKFLOWS.md](./WORKFLOWS.md)
