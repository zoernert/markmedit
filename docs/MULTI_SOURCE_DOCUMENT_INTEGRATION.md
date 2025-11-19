# Multi-Source Document Integration

## Feature-Überblick

Das erweiterte Multi-Document Feature ermöglicht es, nicht nur externe Dateien hochzuladen, sondern auch **eigene bestehende Dokumente** und **Artefakte (Notizen)** als Kontext für KI-Integrationen zu nutzen.

## Zugriff

**Ort**: KI-Assistent Tab im DocumentEditor  
**Komponente**: DocumentSelector (ersetzt DocumentUpload)

## 3 Modi zur Auswahl

### 📤 Upload
**Was**: Externe Dateien hochladen  
**Unterstützte Formate**: TXT, MD, PDF, DOC, DOCX  
**Max. Größe**: 10MB  
**Anwendung**: Externe Quellen, Literatur, Berichte einbinden

**Workflow**:
1. Tab "📤 Upload" wählen
2. Datei per Drag & Drop oder Click auswählen
3. Datei wird für KI-Chat und Analyse verfügbar

### 📋 Dokumente
**Was**: Andere Dokumente aus deiner MarkMEdit-Sammlung auswählen  
**Anzeige**: Alle Dokumente außer dem aktuellen  
**Anwendung**: Cross-Referenz zwischen eigenen Dokumenten

**Workflow**:
1. Tab "📋 Dokumente" wählen
2. Liste zeigt alle verfügbaren Dokumente mit Preview
3. Gewünschtes Dokument anklicken
4. Dokument wird als Kontext geladen

**Beispiel-Szenarien**:
- Whitepaper A schreibst du → Nutze Infos aus Whitepaper B
- Projektdokumentation → Nutze Erkenntnisse aus Analyse-Dokument
- Blogpost → Referenziere früheren Blogpost

### 📦 Artefakte
**Was**: Notizen und gespeicherte KI-Antworten aus dem aktuellen Dokument  
**Quelle**: Artifacts Panel des aktuellen Dokuments  
**Anwendung**: Eigene Notizen, Research-Ideen, gespeicherte Analysen nutzen

**Workflow**:
1. Tab "📦 Artefakte" wählen
2. Liste zeigt alle Artefakte des Dokuments
3. Gewünschtes Artefakt anklicken
4. Artefakt-Inhalt wird als Kontext geladen

**Beispiel-Szenarien**:
- Notiz mit Recherche-Ergebnissen → Einarbeiten ins Dokument
- Gespeicherte KI-Analyse → Weitere Verfeinerung
- Stichpunkte-Sammlung → Ausarbeiten lassen

## Anwendungsfälle

### 1. Document Merge (Dokumente kombinieren)

**Szenario**: Du hast zwei separate Dokumente zum selben Thema

**Schritte**:
1. Öffne Ziel-Dokument
2. KI-Assistent → Tab "📋 Dokumente"
3. Wähle Quell-Dokument aus
4. Chat: "Identifiziere die Hauptabschnitte aus dem anderen Dokument und erstelle Vorschläge, wie ich sie hier integrieren kann"
5. Oder Quick Action: "🔍 Dokument analysieren"
6. Suggestions prüfen und übernehmen

**Ergebnis**: Beide Dokumente intelligent verschmolzen

### 2. Notizen ausarbeiten

**Szenario**: Du hast Stichpunkte in Artefakten gesammelt

**Schritte**:
1. Erstelle Notizen im Artifacts Panel (➕ Notiz)
2. Sammle Stichpunkte, Links, Ideen
3. KI-Assistent → Tab "📦 Artefakte"
4. Wähle Notiz aus
5. Chat: "Arbeite diese Notiz zu einem vollständigen Abschnitt aus"

**Ergebnis**: Aus Stichpunkten wird ausformulierter Text

### 3. Cross-Dokument Konsistenz

**Szenario**: Mehrere Dokumente zum selben Projekt

**Schritte**:
1. Dokument A öffnen
2. KI-Assistent → "📋 Dokumente" → Dokument B auswählen
3. Chat: "Prüfe ob meine Terminologie konsistent mit dem anderen Dokument ist"
4. Oder: "Welche Informationen aus dem anderen Dokument fehlen hier noch?"

**Ergebnis**: Konsistente Dokumentation

### 4. Research-Notizen integrieren

**Szenario**: Deep Research Batch hat viele Notizen erstellt

**Schritte**:
1. Deep Research Batch durchgeführt → Mehrere Notizen in Artifacts
2. KI-Assistent → "📦 Artefakte" → Notiz auswählen
3. Chat: "Finde die beste Stelle im Dokument für diese Information"
4. Oder: "Erweitere den Abschnitt 'Technologie' mit Infos aus dieser Notiz"

**Ergebnis**: Research-Ergebnisse systematisch eingearbeitet

## Quick Actions

**Nur bei Upload-Modus verfügbar**:

### 🔍 Dokument analysieren
- Erstellt automatisch Änderungsvorschläge
- Vergleicht hochgeladene Datei mit aktuellem Dokument
- Generiert Diff-Ansicht mit Accept/Reject

### 💡 Empfehlungen geben
- Füllt Prompt: "Welche Abschnitte sollte ich basierend auf [Datei] überarbeiten?"
- KI gibt strukturierte Verbesserungsvorschläge

## Technische Details

### Datenfluss

**Upload**:
```
File → Blob → API (chatWithDocument) → AI Analysis → Response
```

**Existing Document**:
```
DocumentId → Fetch Content → Create Virtual File → 
Blob → API (chatWithDocument) → AI Analysis → Response
```

**Artifact**:
```
ArtifactId → Fetch Content → Create Virtual File → 
Blob → API (chatWithDocument) → AI Analysis → Response
```

### Virtual Files

Für bestehende Dokumente und Artefakte werden "Virtual Files" erstellt:
```typescript
const blob = new Blob([content], { type: 'text/markdown' });
const file = new File([blob], `${name}.md`, { type: 'text/markdown' });
```

Dies ermöglicht die Nutzung der bestehenden `chatWithDocument` API ohne Backend-Änderungen.

## Best Practices

### 📝 Notizen effektiv nutzen

1. **Strukturierte Notizen**: Erstelle thematisch fokussierte Notizen
2. **Beschreibende Titel**: "Recherche Batteriespeicher Regulierung" statt "Notiz 1"
3. **Inkrementell erweitern**: Eine Notiz auswählen → Einarbeiten → Nächste Notiz

### 🔄 Document Workflow

**Empfohlener Ablauf**:
1. Basis-Dokument erstellen
2. Deep Research → Notizen sammeln
3. Je Notiz: Artefakt auswählen → Einarbeiten lassen
4. Optional: Andere Dokumente für Cross-Referenz nutzen
5. Final: Externe Dateien (Papers, Reports) hochladen und integrieren

### ⚠️ Limitations

- **Nur Markdown-Konversion**: PDF/DOC werden zu Text konvertiert (Formatierung geht verloren)
- **Keine Live-Sync**: Änderungen am Quell-Dokument werden nicht automatisch übernommen
- **Context-Limit**: Sehr große Dokumente (>50.000 Zeichen) könnten gekürzt werden

## Beispiel-Prompts

### Mit Dokumenten
```
"Vergleiche die Struktur dieses Dokuments mit dem anderen und schlage Verbesserungen vor"

"Welche Abschnitte aus dem anderen Dokument würden hier fehlen?"

"Prüfe ob meine Zahlen/Fakten mit dem anderen Dokument übereinstimmen"
```

### Mit Artefakten
```
"Arbeite diese Notiz zu einem vollständigen Kapitel aus"

"Integriere die Stichpunkte aus dieser Notiz in Abschnitt 'Marktübersicht'"

"Erstelle eine Zusammenfassung aller Artefakte zu [Thema]"
```

### Mit Uploads
```
"Welche Erkenntnisse aus diesem Paper sollte ich übernehmen?"

"Vergleiche meine Argumentation mit der in diesem Dokument"

"Erstelle eine Synthese aus meinem Dokument und der hochgeladenen Datei"
```

## Integration mit anderen Features

### + Deep Research
1. Deep Research Batch → Notizen erstellt
2. Artefakte-Modus → Notiz auswählen
3. Einarbeiten

### + Transform Tools
1. Dokument auswählen
2. Transform: "Summary" → Zusammenfassung erstellen
3. In aktuelles Dokument einfügen

### + Collaboration
1. Team-Mitglied erstellt Dokument
2. Du öffnest dein Dokument
3. Wählst Team-Dokument aus
4. Integrierst relevante Abschnitte

## Migration von altem Upload

**Alt** (nur Upload):
- 1 Modus: Datei hochladen
- Nur externe Dateien

**Neu** (DocumentSelector):
- 3 Modi: Upload + Dokumente + Artefakte
- Interne & externe Quellen

**Kompatibilität**: Alte Workflows funktionieren unverändert (Upload-Modus ist Default)

---

**Status**: ✅ Deployed (13. November 2025)  
**Version**: 2.0 (Multi-Source)  
**Komponente**: `DocumentSelector.tsx`
