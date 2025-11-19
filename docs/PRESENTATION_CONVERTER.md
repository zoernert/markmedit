# Dokument-zu-Präsentation Konvertierung

## Überblick

Diese Funktion ermöglicht es, Markdown-Dokumente intelligent in Reveal.js-Präsentationen umzuwandeln. Die Konvertierung nutzt Gemini 2.5 Flash LLM, um den Inhalt zu analysieren und nach Best Practices für Präsentationen zu strukturieren.

## Features

### 🎨 Intelligente Strukturierung
- **Automatische Gliederung**: LLM erstellt sinnvolle Folienstruktur
- **Best Practices**: Max. 7 Stichpunkte pro Folie
- **Folientypen**:
  - Titelfolie (mit Titel, Untertitel, Autor)
  - Agenda (nummerierte Übersicht)
  - Inhaltsfolien (Stichpunkte mit klarer Botschaft)
  - Bildfolien (mit Vorschlägen für visuelle Elemente)
  - Zitate (Blockquote-Stil)
  - Abschlussfolie (Zusammenfassung + "Vielen Dank!")

### 🎭 Theme-System
Vier professionelle Themes:
- **Modern**: Blau-Töne (Standard)
- **Hell**: Helles, freundliches Design
- **Dunkel**: Elegantes dunkles Design
- **Corporate**: Professionelles Business-Design

### 🔧 Anpassbare Optionen
- **User Prompt**: Spezielle Anweisungen für die KI
  - z.B. "Fokus auf technische Details"
  - z.B. "Executive Summary Stil"
  - z.B. "Für externe Präsentation"
- **Max. Folien pro Abschnitt**: 1-10 (Standard: 4)
- **Visuelle Elemente**: Ein/Aus für Bildvorschläge

### 📦 Integration
- Automatisches Speichern als Artefakt
- Verknüpfung mit Quelldokument
- Anzeige im Artefakte-Panel

## Verwendung

### 1. Konvertierung starten

Im Document Editor:
1. Klicke auf **"📊 Präsentation"** Button in der Toolbar
2. Gib optionale Anweisungen ein (z.B. "Fokus auf Geschäftsnutzen")
3. Wähle ein Theme (Modern, Hell, Dunkel, Corporate)
4. Stelle Max. Folien pro Abschnitt ein (1-10)
5. Aktiviere/Deaktiviere visuelle Elemente
6. Klicke **"Präsentation erstellen"**

### 2. Präsentation ansehen

Nach der Konvertierung:
- Präsentation wird als HTML-Artefakt gespeichert
- Automatischer Viewer öffnet sich
- Navigation mit Pfeiltasten (← →)
- Vollbild mit `F`
- Sprecheransicht mit `S`
- ESC zum Beenden

### 3. Präsentation exportieren

Im Viewer:
- **In neuem Tab öffnen**: Vollbild-Ansicht
- **HTML herunterladen**: Standalone-Datei (funktioniert ohne Internet)

## Technische Details

### Backend

**Service**: `backend/src/services/document-converter.ts`
- `convertToPresentation()`: LLM-basierte Konvertierung
- `generateRevealHTML()`: HTML-Template-Generierung

**API**: `backend/src/routes/converter.ts`
- Endpoint: `POST /api/converter/to-presentation`
- Schema-Validierung mit Zod
- Input:
  ```typescript
  {
    content: string;
    userPrompt?: string;
    maxSlidesPerSection?: number; // 1-10, default 4
    includeImages?: boolean; // default true
    theme?: 'light' | 'dark' | 'corporate' | 'modern'; // default 'modern'
  }
  ```
- Output:
  ```typescript
  {
    presentation: PresentationStructure; // JSON
    html: string; // Reveal.js HTML
  }
  ```

### Frontend

**Komponenten**:
1. `ConvertToPresentationModal.tsx`: Konvertierungs-Dialog
   - User Prompt Eingabe
   - Theme-Auswahl (visuelle Farbpaletten)
   - Slider für Max. Folien
   - Toggle für visuelle Elemente
   - Info-Box mit Best Practices

2. `PresentationViewer.tsx`: Reveal.js Viewer
   - Iframe-basierte Anzeige
   - Download-Funktion
   - Neuer-Tab-Funktion
   - Tastatursteuerung-Hinweise

**API Client**: `frontend/src/lib/api.ts`
- `convertToPresentation()`: REST API Aufruf
- TypeScript Interfaces für Type Safety

### LLM Prompt Engineering

**System Prompt** (document-converter.ts):
```
Du bist ein Experte für die Erstellung von Präsentationen.
Erstelle eine strukturierte Präsentation aus folgendem Inhalt...

WICHTIGE REGELN:
1. Erste Folie: IMMER "title" mit title, subtitle, author
2. Zweite Folie: IMMER "agenda" mit Übersicht
3. Max. 7 Stichpunkte pro Folie
4. Eine klare Botschaft pro Folie
5. Nutze verschiedene Layouts (default, two-column, image-right)
6. Schlage visuelle Elemente vor (imagePrompt)
7. Füge Sprechernotizen hinzu (notes)
8. Letzte Folie: "conclusion" mit Zusammenfassung
9. Verwende professionelle Sprache
```

**JSON Structure**:
```typescript
{
  title: string;
  subtitle?: string;
  author?: string;
  slides: [
    {
      type: 'title' | 'agenda' | 'content' | 'image' | 'quote' | 'conclusion';
      title: string;
      subtitle?: string;
      content?: string[]; // max 7 items
      imagePrompt?: string; // z.B. "Icon: Zahnrad für Prozess"
      notes?: string; // Sprechernotizen
      layout?: 'default' | 'two-column' | 'image-right' | 'full-image';
    }
  ];
  theme: 'light' | 'dark' | 'corporate' | 'modern';
}
```

### Reveal.js Integration

**Version**: 5.0.4 (CDN)
**Features**:
- Slide transitions
- Progress bar
- Slide numbers
- Keyboard navigation
- Fullscreen mode (F)
- Speaker notes (S)
- Overview mode (ESC)

**Theme Colors** (CSS Custom Properties):
```css
--theme-bg: /* Hintergrund */
--theme-text: /* Text */
--theme-accent: /* Akzent */
```

## Beispiel

### Input (Markdown)
```markdown
# Projektübersicht

## Einführung
Unser neues System revolutioniert...

## Features
- Feature 1: Beschreibung
- Feature 2: Beschreibung

## Roadmap
Q1: Phase 1
Q2: Phase 2
```

### Output (Präsentation)
1. **Titelfolie**: "Projektübersicht"
2. **Agenda**: 
   - 01. Einführung
   - 02. Features
   - 03. Roadmap
3. **Inhaltsfolie "Einführung"**: Kernbotschaften
4. **Inhaltsfolie "Features"**: Max 7 Features mit Icons
5. **Inhaltsfolie "Roadmap"**: Timeline
6. **Abschluss**: Zusammenfassung + "Vielen Dank!"

## Best Practices

### Für beste Ergebnisse:
1. **Strukturiertes Markdown**: Nutze Überschriften (H1, H2, H3)
2. **Klare Abschnitte**: Logische Gliederung
3. **Bullet Points**: Bereits vorhandene Stichpunkte werden übernommen
4. **User Prompt**: Gib Kontext (Zielgruppe, Fokus, Ton)

### User Prompt Beispiele:
- "Erstelle eine executive summary für C-Level"
- "Fokus auf technische Details für Entwickler"
- "Präsentation für externe Stakeholder, professionell"
- "Workshop-Stil mit interaktiven Elementen"
- "Kompakte Version, max 10 Folien"

## Troubleshooting

### Konvertierung schlägt fehl
- **Problem**: 500 Fehler
- **Lösung**: Überprüfe GEMINI_API_KEY in .env
- **Lösung**: Reduziere Dokumentgröße (LLM hat 8k Token Output-Limit)

### Zu viele Folien
- **Problem**: Präsentation zu lang
- **Lösung**: Reduziere "Max. Folien pro Abschnitt" (1-3)
- **Lösung**: User Prompt: "Erstelle eine kompakte Version"

### Keine visuellen Elemente
- **Problem**: Keine Bildvorschläge
- **Lösung**: Aktiviere "Visuelle Elemente vorschlagen" Toggle
- **Lösung**: User Prompt: "Schlage Icons und Diagramme vor"

### Präsentation wird nicht angezeigt
- **Problem**: Leerer Viewer
- **Lösung**: Überprüfe Browser Console auf Fehler
- **Lösung**: Stelle sicher, dass Reveal.js CDN erreichbar ist
- **Lösung**: Lade Seite neu

## Zukünftige Erweiterungen

### Geplant:
- [ ] PDF Export (via Puppeteer)
- [ ] PowerPoint Export (via pptxgenjs)
- [ ] Custom Theme Editor
- [ ] Bild-Upload für imagePrompt
- [ ] Animation-Effekte konfigurierbar
- [ ] Collaborative Editing
- [ ] Template Library
- [ ] Präsentations-Vorlagen (Pitch Deck, Workshop, etc.)

## Abhängigkeiten

**Backend**:
- `@google/generative-ai`: ^0.21.0
- `zod`: ^3.24.1

**Frontend**:
- React
- TypeScript
- Tailwind CSS

**Runtime**:
- Reveal.js 5.0.4 (CDN)
- Keine zusätzlichen npm packages erforderlich

## Lizenz

Teil von MarkMEdit - siehe Haupt-Lizenz
