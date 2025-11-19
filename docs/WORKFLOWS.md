# Workflow-Beispiele für MarkMEdit

## 1. Whitepaper zu Energiemarkt-Thema erstellen

### Schritt 1: Outline generieren
```
1. Öffne KI-Assistent
2. Eingabe: "Erstelle Whitepaper zu §14a EnWG Umsetzung in Deutschland"
3. System nutzt:
   - mcp-reasoning-generate für Struktur
   - Gemini 2.5 Flash für Formulierung
4. Ergebnis: Detaillierte Gliederung mit Kapiteln
```

### Schritt 2: Dokument anlegen
```
1. "Als Dokument speichern" klicken
2. System erstellt neues Markdown-Dokument
3. Git-Commit: "Create §14a EnWG Whitepaper"
```

### Schritt 3: Kapitel erweitern
```
Für jedes Kapitel:
1. Markiere Überschrift
2. Klicke "Abschnitt erweitern"
3. System:
   - mcp-semantic-search für Kontext
   - Gemini generiert detaillierten Text
   - Fügt Quellenangaben hinzu
4. Manuelles Review & Anpassung
```

### Schritt 4: Export
```
1. Klicke "Export"
2. Wähle Format: PDF, Reveal.js, HTML
3. System generiert professionelles Dokument
4. Download & Teilen
```

## 2. EDIFACT-Nachricht analysieren

### Use Case: UTILMD Lieferantenwechsel
```
1. Öffne neues Dokument
2. Füge EDIFACT-Nachricht ein:
   UNH+1+UTILMD:D:11A:UN:2.4e++...
   
3. KI-Assistent → "EDIFACT analysieren"
4. System nutzt mcp-analyze-edifact
5. Zeigt an:
   - Nachrichtentyp: UTILMD
   - Version: 2.4e
   - Segmente mit Erklärungen
   - Code-Lookups (BDEW-Codes)
   
6. Fragen stellen:
   "Was bedeutet BGM+E01?"
   → mcp-chat-edifact erklärt
   
7. Validierung:
   → mcp-validate-edifact
   → Zeigt Fehler/Warnungen
```

## 3. Wissenssammlung aufbauen

### Thema: "Lieferantenwechselprozess"

```
Struktur:
├── Überblick
│   ├── Gesetzliche Grundlagen (EnWG)
│   ├── GPKE Prozessschritte
│   └── Zeitrahmen & Fristen
├── EDIFACT Formate
│   ├── UTILMD (Stammdaten)
│   ├── MSCONS (Messwerte)
│   └── APERAK (Antworten)
└── Praxisbeispiele
    ├── Standardfall
    ├── Sonderfälle
    └── Fehlerbehebung

Workflow:
1. Erstelle Hauptdokument "Lieferantenwechsel"
2. Für jeden Abschnitt:
   - mcp-search nach relevanten Inhalten
   - Gemini formuliert verständlichen Text
   - Manuelle Ergänzung von Praxiserfahrung
3. Verlinke verwandte Dokumente
4. Git tracked alle Änderungen
```

## 4. Präsentation vorbereiten

### Meeting zu "Smart Meter Gateway"

```
1. Erstelle Dokument "Smart Meter Rollout"
2. Recherche mit MCP-Services:
   - "§14a EnWG smart meter"
   - "Messstellenbetrieb SMGW"
   - "CLS-Geräte Steuerung"
   
3. Struktur:
   ## Einführung
   - Was ist ein SMGW?
   - Gesetzliche Vorgaben
   
   ## Technische Details
   - Architektur
   - Kommunikation
   
   ## §14a EnWG Integration
   - Steuerbare Verbrauchseinrichtungen
   - Netzorientierte Steuerung
   
   ## Praxis
   - Rollout-Status
   - Herausforderungen
   
4. Export als Reveal.js
5. Interaktive Präsentation mit Speaker Notes
```

## 5. Iterative Verbesserung

### Dokument: "GPKE Prozesse"

```
Version 1.0:
- Erste Outline via mcp-reasoning
- Grundlegende Struktur

Feedback einarbeiten:
1. Markiere Absatz
2. "Text verbessern" → Gemini optimiert
3. Spezifische Frage: "Füge Beispiel hinzu"
4. MCP-Service liefert aktuelles Praxisbeispiel

Version 1.1:
- Git zeigt Änderungen
- Team-Review
- Weitere Iterationen

Version 2.0:
- Neue regulatorische Änderungen
- mcp-search findet Updates
- Gemini integriert in bestehendes Dokument
```

## 6. Compliance-Check

### EDIFACT-Nachricht validieren

```
Workflow:
1. Öffne Dokument mit EDIFACT
2. Klicke "Validieren"
3. mcp-validate-edifact prüft:
   ✓ Syntax korrekt
   ⚠ Segment BGM: Empfohlen aber optional
   ✗ Segment NAD: Pflichtfeld fehlt
   
4. Für jeden Fehler:
   - Klicke auf Fehler
   - mcp-chat erklärt
   - Zeigt korrektes Beispiel
   
5. Korrigiere Nachricht
6. Erneute Validierung
7. Export als "validierte Nachricht"
```

## 7. Schulungsmaterial erstellen

### Kurs: "Energiemarkt für Einsteiger"

```
Module:
1. Marktgrundlagen
   - MCP-Service: Marktakteure, Rollen
   - Gemini: Vereinfachte Erklärungen
   
2. Prozesse
   - GPKE visualisiert
   - Interaktive Beispiele
   
3. Formate
   - EDIFACT Einführung
   - Hands-on Beispiele
   
4. Quiz & Übungen
   - Gemini generiert Fragen
   - MCP-Tool validiert Antworten

Export:
- HTML für LMS
- PDF für Handout
- Reveal.js für Live-Training
```

## 8. Multi-Dokument Analyse

### Vergleich: "GPKE vs. GeLi Gas"

```
1. Erstelle Dokument "Prozessvergleich"
2. Zwei Spalten:
   - Links: GPKE (Strom)
   - Rechts: GeLi Gas

3. Für jeden Prozessschritt:
   - mcp-search beide Regelwerke
   - Gemini erstellt Vergleichstabelle
   - Hebt Unterschiede hervor
   
4. Interaktive Features:
   - Toggle zwischen Ansichten
   - Filter nach Thema
   - Export als Matrix
```

## Tipps für effizientes Arbeiten

### Tastenkombinationen planen
```
Ctrl+K: KI-Assistent öffnen
Ctrl+E: Abschnitt erweitern
Ctrl+I: Text verbessern
Ctrl+S: Speichern (Git commit)
Ctrl+Shift+E: Export-Dialog
```

### Templates nutzen
```
- Whitepaper Template
- Meeting Notes Template
- Technical Documentation Template
- EDIFACT Analysis Template
```

### Versionskontrolle
```
- Automatische Commits nach Änderungen
- Aussagekräftige Commit-Messages via AI
- Branch für größere Überarbeitungen
- Tags für veröffentlichte Versionen
```
