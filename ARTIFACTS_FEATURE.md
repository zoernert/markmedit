# Artefakte-Bibliothek Feature

## Überblick
Die Artefakte-Bibliothek ermöglicht es Benutzern, KI-generierte Inhalte als wiederverwendbare Artefakte zu speichern, zu bearbeiten und als Kontext in zukünftigen KI-Konversationen zu verwenden.

## Funktionen

### 1. Artefakte speichern
- **"Als Artefakt speichern" Button** in KI-Assistant-Nachrichten
- Modal zur Eingabe eines aussagekräftigen Titels
- Artefakte werden dokumentbezogen gespeichert

### 2. Artefakte verwalten
- **Artefakte-Tab** im rechten Panel des DocumentEditors
- Liste aller gespeicherten Artefakte mit Titel, Vorschau und Erstellungsdatum
- **Inline-Bearbeitung**: Titel und Inhalt direkt editierbar
- **Kopieren**: Artefakt-Inhalt in die Zwischenablage
- **Löschen**: Mit Bestätigungsdialog

### 3. Artefakte als KI-Kontext verwenden
- **Checkbox-Auswahl** in der Artefakte-Liste
- Ausgewählte Artefakte werden automatisch als Kontext in KI-Anfragen eingebunden
- KI kann auf gespeicherte Informationen zurückgreifen

## Technische Implementierung

### Backend
- **Datenbank**: SQLite-Tabelle `artifacts`
  - `id`: Primärschlüssel
  - `documentId`: Fremdschlüssel zu Dokumenten
  - `title`: Artefakt-Titel
  - `content`: Artefakt-Inhalt
  - `createdAt`, `updatedAt`: Zeitstempel

- **API-Endpoints**:
  - `GET /api/documents/:documentId/artifacts` - Alle Artefakte eines Dokuments
  - `POST /api/documents/:documentId/artifacts` - Neues Artefakt erstellen
  - `PUT /api/documents/:documentId/artifacts/:id` - Artefakt aktualisieren
  - `DELETE /api/documents/:documentId/artifacts/:id` - Artefakt löschen

### Frontend
- **Komponenten**:
  - `ArtifactsPanel.tsx`: Artefakte-Verwaltung mit Liste, Editor, Aktionen
  - `AIAssistant.tsx`: Erweitert um "Als Artefakt speichern" Button und Kontext-Integration
  - `DocumentEditor.tsx`: Tab-System für KI-Assistent und Artefakte

- **State Management**: React Query für Caching und Synchronisation
- **Kontext-Integration**: Ausgewählte Artefakte werden in `fullContext` eingebunden

## Workflow-Beispiel

1. **Erstellen**: Benutzer chattet mit KI → erhält nützliche Antwort → klickt "Als Artefakt speichern" → vergibt Titel
2. **Organisieren**: Artefakt erscheint im Artefakte-Tab → kann dort bearbeitet, kopiert oder gelöscht werden
3. **Wiederverwenden**: Bei neuer KI-Anfrage → Artefakt via Checkbox auswählen → KI verwendet Inhalt als Kontext
4. **Iterieren**: Neue Erkenntnisse aus KI-Chat → als weiteres Artefakt speichern → wachsende Wissensbasis

## UI/UX Details

### Artefakte-Tab
- Toggle zwischen "KI-Assistent" und "Artefakte" im rechten Panel
- Dark-Theme-Design konsistent mit Rest der Anwendung
- Visuelles Feedback für Aktionen (Speichern, Löschen, Auswahl)

### Artefakt-Karte
- Titel (editierbar mit ✏️ Icon)
- Inhalt-Vorschau (3 Zeilen, erweiterbar im Edit-Modus)
- Checkbox für Kontext-Auswahl
- Aktions-Buttons: Bearbeiten, Kopieren, Löschen
- Zeitstempel (Erstellungsdatum)

### Modal "Als Artefakt speichern"
- Titel-Eingabefeld (Fokus automatisch gesetzt)
- Vorschau des Inhalts (erste 200 Zeichen)
- Abbrechen / Speichern Buttons
- Loading-State während des Speicherns

## Integration mit KI-Kontext

### Kontext-Aufbau
```typescript
const fullContext = artifactContext
  ? `${textContext}\n\nGespeicherte Artefakte (als Referenz):\n${artifactContext}`
  : textContext;
```

### Artefakt-Format im Kontext
```
**Artefakt-Titel**:
Artefakt-Inhalt

---

**Weiteres Artefakt**:
Weiterer Inhalt
```

### KI-Awareness
- Artefakte werden als "Gespeicherte Artefakte (als Referenz)" gekennzeichnet
- KI kann explizit auf Artefakte verweisen
- Sowohl für MCP Function Calling als auch Gemini Chat verfügbar

## Best Practices

1. **Aussagekräftige Titel**: Helfen bei der späteren Suche und Auswahl
2. **Modulare Artefakte**: Kleine, fokussierte Artefakte statt große Monolithen
3. **Regelmäßiges Aufräumen**: Veraltete Artefakte löschen
4. **Kontextuelle Auswahl**: Nur relevante Artefakte für spezifische KI-Anfragen auswählen

## Zukünftige Erweiterungen (Optional)

- **Tags/Kategorien**: Artefakte kategorisieren und filtern
- **Suche**: Volltextsuche in Artefakten
- **Export**: Artefakte als Markdown/JSON exportieren
- **Versionierung**: Änderungsverlauf von Artefakten
- **Sharing**: Artefakte zwischen Dokumenten teilen
- **Templates**: Häufig verwendete Artefakte als Vorlagen
