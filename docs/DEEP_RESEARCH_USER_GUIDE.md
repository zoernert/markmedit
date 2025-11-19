# Deep Research System - User Guide

## Überblick

Das Deep Research System transformiert MarkMEdit in ein "Living Document" System, das kontinuierlich mit aktuellem Wissen aus verschiedenen Quellen angereichert werden kann.

## Features

### ✨ Transform Tools
- **Was**: Vorhandenen Content transformieren (Summary, Outline, Expand, etc.)
- **Wann nutzen**: Content-Remix ohne neue Recherche
- **Zugriff**: Tab "✨ Transform" im DocumentEditor

### 🔬 Deep Research
- **Was**: Echte Recherche mit Web-Suche + MCP-Expertise
- **Quellen**: 
  - 🌐 Tavily Web-Suche (aktuelle Infos aus dem Internet)
  - ⚡ Willi-Mako (Energiemarkt-Fachwissen GPKE, WiM, EDIFACT)
  - 📊 Powabase (Marktstammdatenregister MaStR)
- **Zugriff**: Tab "🔬 Research" im DocumentEditor

## Workflows

### 1. Standard Deep Research

**Anwendungsfall**: Du brauchst aktuelle Informationen zu einem Thema

**Schritte**:
1. Öffne Dokument im Editor
2. Klicke auf Tab "🔬 Research"
3. Wähle Sub-Tab "Research"
4. Gib Forschungsfrage ein (z.B. "Aktuelle Entwicklungen Batteriespeicher 2025")
5. Wähle Quellen:
   - ☑ Web-Suche (für aktuelle News/Artikel)
   - ☑ Willi-Mako (für Energiemarkt-Regulierung)
   - ☑ Powabase (für MaStR-Daten)
6. Klicke "🔬 Deep Research starten"
7. Warte auf Suggestions-Modal
8. Prüfe Vorschläge → Akzeptiere gewünschte → Klicke "Änderungen anwenden"
9. ✓ Dokument automatisch aktualisiert!

**Beispiel-Queries**:
- "Neue Regelungen für Heimspeicher in Deutschland 2025"
- "Marktkommunikation GPKE Lieferantenwechsel Prozess"
- "Photovoltaik Ausbau Bayern Statistiken"

### 2. Section Enrichment (Inkrementelle Anreicherung)

**Anwendungsfall**: Ein einzelner Absatz soll erweitert/aktualisiert werden

**Schritte**:
1. Markiere Text im Dokument (z.B. einen Absatz)
2. Wechsle zu Tab "🔬 Research"
3. Wähle Sub-Tab "Enrich"
4. Wähle Anreicherungs-Ziel:
   - 📝 Text erweitern (mehr Details hinzufügen)
   - 🔄 Aktualisieren (mit neuesten Infos)
   - ✓ Fakten überprüfen (Verifikation)
   - 📚 Quellen hinzufügen (Referenzen ergänzen)
5. Wähle Recherche-Quellen
6. Klicke "✨ Sektion anreichern"
7. Prüfe fokussierte Vorschläge → Apply

**Best Practice**: Arbeite dich Sektion für Sektion durch dein Dokument → "Living Document"!

### 3. Research Batch (Notizen-basierte Recherche)

**Anwendungsfall**: Du hast mehrere Recherche-Ideen gesammelt und willst sie kombiniert verarbeiten

**Schritte**:

**A) Notizen erstellen:**
1. Wechsle zu Tab "📦 Artifakte"
2. Klicke "➕ Notiz"
3. Erstelle Notizen mit Recherche-Ideen:
   ```
   Titel: "Recherche: Heimspeicher Regulierung"
   Inhalt: "Neue Regelungen für Heimspeicher ab 2025, 
            insbesondere §14a EnWG und Einspeisevergütung"
   ```
4. Erstelle weitere Notizen (2-5 empfohlen)

**B) Batch Research durchführen:**
1. Wechsle zu Tab "🔬 Research"
2. Wähle Sub-Tab "Batch"
3. Wähle Notizen aus (Checkboxen)
4. Optional: Zusätzliche Forschungsfrage eingeben
5. Wähle Recherche-Quellen
6. Klicke "🔬 Research Batch starten"
7. Backend analysiert alle Notizen → Extrahiert Themen → Recherchiert → Generiert Suggestions
8. Prüfe und übernehme Vorschläge

**Vorteil**: Sammle Ideen über Zeit → Führe große Recherche durch → Dokument wird umfassend angereichert

## Quellen-Expertise

### 🌐 Tavily Web-Suche
- **Stärken**: Aktuelle News, Blog-Posts, Pressemitteilungen
- **Nutze für**: Breaking News, neueste Entwicklungen, Marktberichte
- **Beispiel**: "Tesla Powerwall 3 Features 2025"

### ⚡ Willi-Mako (Energiemarkt)
- **Stärken**: GPKE, WiM, GeLi Gas, EDIFACT, Marktkommunikation
- **Nutze für**: Regulierung, Prozesse, BNetzA-Vorgaben
- **Beispiel**: "UTILMD Prüfidentifikatoren Lieferantenwechsel"

### 📊 Powabase (MaStR)
- **Stärken**: Marktstammdatenregister-Abfragen, Anlagenstatistiken
- **Nutze für**: PV-Ausbau, Windkraft, Biomasse, regionale Analysen
- **Beispiel**: "Photovoltaik Anlagen Bayern 2024"

## Best Practices

### 🎯 Effektive Queries

**Gut**:
- "Aktuelle Regelungen Heimspeicher Deutschland 2025"
- "GPKE Lieferantenwechsel Abläufe Fristen"
- "Photovoltaik Ausbau Nordrhein-Westfalen Statistik"

**Weniger gut**:
- "Batterien" (zu unspezifisch)
- "Was ist der Stand?" (kein Kontext)

### 🔄 Living Document Workflow

1. **Initiales Dokument**: Erstelle Grundstruktur
2. **Deep Research**: Fülle mit initialer Recherche
3. **Notizen sammeln**: Erstelle Notizen für später
4. **Inkrementell erweitern**: Enriche Sektionen gezielt
5. **Batch Update**: Alle 1-2 Monate Research Batch mit neuen Quellen
6. **Continuous Improvement**: Dokument bleibt aktuell!

### 💡 Quellen-Kombination

**Energiemarkt-Themen**:
- ☑ Web (aktuelle Entwicklungen)
- ☑ Willi-Mako (Regulierung)
- ☑ Powabase (Statistiken)

**Technologie-Themen**:
- ☑ Web (Produkt-Updates, Specs)
- ☐ Willi-Mako (nur wenn Regulierung relevant)
- ☐ Powabase (nur wenn MaStR-Daten relevant)

**Regulierungs-Themen**:
- ☐ Web (ggf. Presseberichte)
- ☑ Willi-Mako (BNetzA, EnWG, etc.)
- ☐ Powabase (nur für Statistiken)

## Technische Details

### Suggestions-Format

Jeder Vorschlag enthält:
- **type**: `section`, `paragraph`, `addition`, `update`
- **content**: Neuer/geänderter Text (Markdown)
- **position**: Wo einfügen (z.B. `"after ## Einleitung"`)
- **reasoning**: Warum dieser Vorschlag
- **sources**: Welche Quellen genutzt (URLs, MCP-Server)

### Diff/Apply Workflow

1. Backend generiert Suggestions (strukturiert)
2. Frontend zeigt Modal mit Diff-Ansicht
3. User akzeptiert/lehnt ab
4. Frontend sendet akzeptierte Suggestions an `/ai/integrate-suggestions`
5. Backend integriert intelligent ins Dokument
6. Frontend updated Content + invalidiert Cache

## Troubleshooting

### Keine Web-Quellen gefunden
→ Prüfe TAVILY_API_KEY in Backend .env

### MCP-Server nicht erreichbar
→ Backend Logs prüfen: `docker logs markmedit-backend`

### Suggestions zu generisch
→ Spezifischere Query formulieren
→ Mehr Kontext im Dokument vorhanden haben

### Research dauert zu lange
→ Reduziere Max Sources (5 statt 10)
→ Wähle gezielt Quellen (nicht alle)

## Roadmap

**Geplante Features**:
- [ ] Research History (vergangene Researches pro Dokument)
- [ ] Source Citation Tracking (welche Quelle → welcher Absatz)
- [ ] Smart Suggestion Ranking (ML-basiert)
- [ ] Collaborative Research (Team-Features)
- [ ] Scheduled Batch Research (automatisch alle 7 Tage)
- [ ] Research Templates (vordefinierte Workflows)

## Beispiel-Workflow komplett

**Szenario**: Whitepaper "Energiespeicher in Deutschland 2025" erstellen

**Schritt 1 - Struktur**:
```markdown
# Energiespeicher in Deutschland 2025

## Einleitung
Energiespeicher spielen eine zentrale Rolle...

## Technologien
- Batteriespeicher
- Pumpspeicher
- Power-to-X

## Marktübersicht
...

## Regulierung
...

## Ausblick
...
```

**Schritt 2 - Deep Research "Batteriespeicher"**:
- Query: "Aktuelle Entwicklungen Batteriespeicher Deutschland 2025"
- Quellen: Web ☑, Willi-Mako ☑, Powabase ☑
- Suggestions akzeptieren → Sektion "Technologien" gefüllt

**Schritt 3 - Notizen für später**:
```
Notiz 1: "Regulierung Heimspeicher §14a EnWG"
Notiz 2: "Förderung KfW Batteriespeicher"
Notiz 3: "Netzanschlusspflichten TAB"
```

**Schritt 4 - Section Enrichment "Marktübersicht"**:
- Markiere aktuellen Text
- Ziel: "Text erweitern"
- Quellen: Web ☑, Powabase ☑
- Apply → Mehr Details + Statistiken

**Schritt 5 - Research Batch (Regulierung)**:
- Wähle alle 3 Notizen
- Batch Research → Sektion "Regulierung" komplett befüllt

**Schritt 6 - Finale Enrichments**:
- Jede Sektion einzeln mit "fact-check" verifizieren
- "Quellen hinzufügen" für wissenschaftliche Referenzen

**Ergebnis**: Umfassendes, gut recherchiertes Whitepaper mit aktuellen Quellen!

---

**Version**: 1.0 (November 2025)
**Status**: Deployed & Operational
