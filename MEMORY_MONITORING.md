# Memory Monitoring & Optimization Guide

## Übersicht

Das MarkMEdit Backend verfügt über ein umfassendes Memory-Monitoring-System zur Identifikation und Behebung von Memory Leaks.

**Aktueller Status:**
- ✅ Memory-Monitor aktiv seit: 19.11.2025
- 🎯 Ziel: Memory Leak identifizieren und beheben
- 📊 Monitoring-Interval: 30 Sekunden
- 🔴 Critical Threshold: 85% Heap-Auslastung

---

## 1. Architektur

### 1.1 Komponenten

```
┌─────────────────────────────────────────────────────────────┐
│                   Memory Monitor Service                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌───────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   Periodic    │  │  Component   │  │   GC Event      │  │
│  │   Snapshots   │  │   Tracking   │  │   Recording     │  │
│  │   (30s)       │  │              │  │                 │  │
│  └───────┬───────┘  └──────┬───────┘  └────────┬────────┘  │
│          │                 │                    │           │
│          └─────────────────┴────────────────────┘           │
│                            ▼                                 │
│          ┌─────────────────────────────────────┐            │
│          │      Critical Event Detection       │            │
│          │     (>85% Heap, Ineffective GC)     │            │
│          └──────────┬──────────────────────────┘            │
│                     │                                        │
│          ┌──────────┴──────────┬──────────────┬─────────┐   │
│          ▼                     ▼              ▼         ▼   │
│     Heap Dump            Gotify Alert    JSON Log   Console │
│  (memory-dumps/)    (push.tydids.com)  (memory-logs/)      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 Datenfluss

1. **Periodisches Monitoring** (alle 30s):
   ```typescript
   {
     timestamp: 1700483520000,
     heapUsed: 2048 MB,
     heapTotal: 2560 MB,
     heapLimit: 4096 MB,
     percentUsed: 50.0%,
     rss: 2800 MB,
     external: 120 MB
   }
   ```

2. **Komponenten-Tracking** (bei jeder Operation):
   ```typescript
   {
     component: "DocumentIndexer",
     operation: "generateEmbeddings(6 chunks)",
     memoryBefore: 1024 MB,
     memoryAfter: 1089 MB,
     memoryDelta: +65 MB,
     duration: 1250 ms
   }
   ```

3. **Critical Events** (bei Schwellwert-Überschreitung):
   ```typescript
   {
     timestamp: 1700483520000,
     type: "high_memory" | "memory_leak" | "ineffective_gc" | "heap_dump",
     severity: "warning" | "critical",
     heapUsed: 3686 MB,
     heapPercent: 90.0%,
     message: "Heap usage at 90.0% (3686 MB)",
     metadata: { /* zusätzliche Infos */ }
   }
   ```

---

## 2. Monitoring-APIs

### 2.1 Memory Report (Human-Readable)

```bash
curl https://markmedit.corrently.io/api/memory-report
```

**Output:**
```
=== Memory Monitor Report ===

Current State:
  Heap Used: 1024 MB
  Heap Total: 1536 MB
  Heap Limit: 4096 MB
  Utilization: 25.0%
  RSS: 1200 MB
  External: 50 MB

Trend:
  Average Heap: 980 MB
  Recent Growth: +44 MB

Top Memory Consumers:
  1. DocumentIndexer.generateEmbeddings(6 chunks): +65 MB (1250ms)
  2. QDrant.deleteVectors(documents): +12 MB (320ms)
  3. MCPClient.callTool(willi-mako-chat): +8 MB (890ms)

Statistics:
  Snapshots: 120
  Component Stats: 45
  GC Events: 8
```

### 2.2 Memory Stats (JSON)

```bash
curl https://markmedit.corrently.io/api/memory-stats | jq
```

**Response:**
```json
{
  "stats": {
    "current": {
      "timestamp": 1700483520000,
      "heapUsed": 1073741824,
      "heapTotal": 1610612736,
      "heapLimit": 4294967296,
      "percentUsed": 25.0,
      "rss": 1258291200,
      "external": 52428800
    },
    "averageHeapUsed": 1027604480,
    "heapGrowth": 46137344,
    "snapshotCount": 120,
    "componentStatsCount": 45,
    "gcEventCount": 8,
    "topConsumers": [
      {
        "component": "DocumentIndexer",
        "operation": "generateEmbeddings(6 chunks)",
        "memoryDelta": 68157440,
        "duration": 1250
      }
    ]
  },
  "heapSpaces": [...]
}
```

### 2.3 Critical Events

```bash
curl https://markmedit.corrently.io/api/memory-events?limit=50 | jq
```

**Response:**
```json
{
  "total": 3,
  "events": [
    {
      "timestamp": 1700483520000,
      "type": "high_memory",
      "severity": "warning",
      "heapUsed": 3221225472,
      "heapPercent": 75.0,
      "message": "Heap usage at 75.0% (3072 MB)",
      "metadata": {
        "heapTotal": 3435973836,
        "heapLimit": 4294967296
      }
    },
    {
      "timestamp": 1700483580000,
      "type": "ineffective_gc",
      "severity": "warning",
      "heapUsed": 3489660928,
      "heapPercent": 81.2,
      "message": "Ineffective GC: Only 0 MB freed",
      "metadata": {
        "type": "scavenge",
        "heapBefore": 3489660928,
        "heapAfter": 3489660928,
        "freed": 0
      }
    },
    {
      "timestamp": 1700483640000,
      "type": "heap_dump",
      "severity": "critical",
      "heapUsed": 3758096384,
      "heapPercent": 87.5,
      "message": "Heap dump created: heap-1700483640000-87pct.heapsnapshot",
      "metadata": {
        "filepath": "/app/memory-dumps/heap-1700483640000-87pct.heapsnapshot",
        "filename": "heap-1700483640000-87pct.heapsnapshot"
      }
    }
  ],
  "lastUpdate": 1700483640000
}
```

---

## 3. Alerting

### 3.1 Gotify Push-Notifications

**Konfiguration:**
- URL: `https://push.tydids.com`
- Token: `Ady-0bCfxnlGwPr`
- Cooldown: 10 Minuten zwischen Alerts

**Alert-Schwellwerte:**
- 🟡 **Warning** (Priority 7): Heap >= 85%
- 🔴 **Critical** (Priority 10): Heap >= 90%

**Beispiel-Nachricht:**
```
🔴 MarkMEdit: Critical Memory Alert

Heap usage at 92.3% (3859 MB)

Type: high_memory
Time: 2025-11-19T14:23:40.000Z
```

### 3.2 Structured Logs

Alle Critical Events werden in JSON-Lines Format geschrieben:

**Pfad:** `./memory-logs/critical-events-YYYY-MM-DD.jsonl`

```jsonl
{"timestamp":1700483520000,"type":"high_memory","severity":"warning","heapUsed":3221225472,"heapPercent":75.0,"message":"Heap usage at 75.0% (3072 MB)","isoTimestamp":"2025-11-19T14:12:00.000Z"}
{"timestamp":1700483580000,"type":"ineffective_gc","severity":"warning","heapUsed":3489660928,"heapPercent":81.2,"message":"Ineffective GC: Only 0 MB freed","isoTimestamp":"2025-11-19T14:13:00.000Z"}
{"timestamp":1700483640000,"type":"heap_dump","severity":"critical","heapUsed":3758096384,"heapPercent":87.5,"message":"Heap dump created","isoTimestamp":"2025-11-19T14:14:00.000Z"}
```

**Log-Rotation:**
- Täglich neue Datei (automatisch)
- Manuelle Bereinigung empfohlen nach Analyse

---

## 4. Heap Dump Analyse

### 4.1 Dumps extrahieren

```bash
# Aus Container kopieren
docker cp markmedit-backend:/app/memory-dumps/ ./memory-dumps/
```

### 4.2 Mit Chrome DevTools analysieren

1. Chrome DevTools öffnen (F12)
2. **Memory** Tab
3. **Load** Button → `.heapsnapshot` Datei auswählen
4. **Analysis:**
   - **Summary View**: Objekt-Typen und deren Größe
   - **Comparison**: Zwei Dumps vergleichen
   - **Containment**: Objekthierarchie erkunden
   - **Statistics**: Heap-Verteilung visualisieren

### 4.3 Häufige Memory Leak Muster

#### Pattern 1: Event Listener Leaks
```
Symptom: Viele EventEmitter/Listener Objekte
Fix: removeListener() aufrufen oder once() verwenden
```

#### Pattern 2: Cache ohne Limit
```
Symptom: Wachsende Arrays/Maps
Fix: LRU-Cache mit maxSize implementieren
Beispiel: this.snapshots.slice(-1000)
```

#### Pattern 3: Unfreigegebene Buffers
```
Symptom: Große ArrayBuffer/Uint8Array
Fix: Buffer explizit null setzen nach Verwendung
Beispiel: embeddings = null
```

#### Pattern 4: Closure Leaks
```
Symptom: Retained Context in Closures
Fix: Referenzen in Closures minimieren
```

---

## 5. Optimierungsworkflow

### 5.1 Datensammlung (Phase 1 - Aktuell)

**Zeitraum:** 30-40 Minuten bis zum Crash

**Befehle:**
```bash
# Continuous Monitoring
ssh root@10.0.0.14 "docker logs -f markmedit-backend | grep MemoryMonitor"

# Periodic Stats
watch -n 300 'curl -s https://markmedit.corrently.io/api/memory-report'

# Critical Events checken
curl -s https://markmedit.corrently.io/api/memory-events | jq '.events[-5:]'
```

**Zu beobachten:**
- [ ] Welche Komponente verursacht größte Memory-Deltas?
- [ ] Steigt Heap kontinuierlich oder sprunghaft?
- [ ] Wann treten ineffective GCs auf?
- [ ] Welche Operation läuft unmittelbar vor Crash?

### 5.2 Analyse (Phase 2)

**Nach Crash/Heap Dump:**

1. **Logs auswerten:**
   ```bash
   # Top Memory Consumers
   cat memory-logs/critical-events-*.jsonl | \
     jq -r 'select(.type=="high_memory") | .message' | \
     sort | uniq -c | sort -rn
   
   # Zeitlicher Verlauf
   cat memory-logs/critical-events-*.jsonl | \
     jq -r '[.isoTimestamp, .heapPercent] | @tsv' > heap-timeline.tsv
   ```

2. **Heap Dump analysieren:**
   - Größte Objekt-Typen identifizieren
   - Retained Size vs. Shallow Size vergleichen
   - GC Roots untersuchen

3. **Component Stats aggregieren:**
   ```bash
   curl -s https://markmedit.corrently.io/api/memory-stats | \
     jq '.stats.topConsumers[] | [.component, .operation, .memoryDelta / 1024 / 1024] | @tsv'
   ```

### 5.3 Hypothesenbildung (Phase 3)

**Verdächtige Komponenten (nach bisheriger Beobachtung):**

1. **DocumentIndexer** (Höchste Priorität)
   - `generateEmbeddings()`: Große Vektoren im Speicher
   - `chunkMarkdown()`: String-Konkatenation
   - QDrant `upsert()`: Buffers nicht freigegeben?

2. **QDrant Client**
   - Connection Pool Leak?
   - Response Buffers nicht freigegeben?

3. **MCP Clients**
   - Long-lived WebSocket Connections
   - Accumulated Messages?

4. **AI Services (Gemini)**
   - Response Streaming nicht geschlossen?
   - Context-Akkumulation?

### 5.4 Fixes implementieren (Phase 4)

**Beispiel: DocumentIndexer optimieren**

```typescript
// Vorher (Memory Leak):
async function indexDocument(content: string) {
  const chunks = chunkMarkdown(content);
  const embeddings = await generateEmbeddings(chunks); // Bleibt im RAM
  await qdrant.upsert(embeddings);
  // embeddings bleiben referenced!
}

// Nachher (Optimiert):
async function indexDocument(content: string) {
  const chunks = chunkMarkdown(content);
  
  // Batch-weise verarbeiten
  for (let i = 0; i < chunks.length; i += 10) {
    const batch = chunks.slice(i, i + 10);
    const embeddings = await generateEmbeddings(batch);
    await qdrant.upsert(embeddings);
    
    // Explizit freigeben
    embeddings.length = 0;
  }
  
  // Chunks auch freigeben
  chunks.length = 0;
  
  // Optional: Force GC wenn verfügbar
  if (global.gc) global.gc();
}
```

### 5.5 Validierung (Phase 5)

**Nach Fix:**
```bash
# Monitoring für 2 Stunden
# Erwartung: Heap-Wachstum stoppt oder verlangsamt

# Vorher/Nachher Vergleich
curl -s https://markmedit.corrently.io/api/memory-stats | \
  jq '.stats | {heapUsed, heapGrowth, topConsumers}'
```

---

## 6. Bekannte Probleme & Status

### 6.1 Aktueller Befund (19.11.2025)

**Problem:**
- Backend crasht nach ~30-40 Minuten mit Heap Exhaustion
- Heap-Limit: 4096 MB
- Crash bei: ~4040-4044 MB (98-99%)
- GC-Verhalten: "Ineffective mark-compacts"

**Symptome:**
- Kleine Dokumente (10 KB) triggern Crash
- Gradueller Memory-Anstieg, nicht Spike-basiert
- Container zeigt "Up" aber Prozess tot (Zombie)

**Verdacht:**
Memory Leak in Document Indexing Pipeline (QDrant/Embeddings)

**Neu identifiziert (19.11.2025 11:00):**
- **Blockierender Index-Prozess**: Backend hängt während Dokument-Indexierung
- **Symptom**: Alle API-Requests timeout (inkl. `/api/auth/me`, `/health`)
- **Root Cause**: Synchroner/blockierender Call in Indexing-Pipeline
- **Betroffene Operation**: Nach "Deleted vectors" Log, vor Embedding-Generation
- **Workaround**: Container-Restart erforderlich
- **Fix-Priorität**: CRITICAL - blockiert gesamtes Backend

### 6.2 Monitoring-Strategie

**Erfolgskriterien:**
- ✅ Memory-Monitor läuft und loggt
- ⏳ Component-spezifische Deltas werden gemessen
- ⏳ Critical Events werden getrackt
- ⏳ Heap Dumps bei 85% erstellt
- ⏳ Gotify Alerts funktionieren

**Nächste Schritte:**
1. [ ] 30-40 Min Monitoring bis zum nächsten Crash
2. [ ] Heap Dump analysieren
3. [ ] Top Memory Consumer identifizieren
4. [ ] Gezielte Fixes implementieren
5. [ ] 2h Stabilitätstest nach Fix

---

## 7. Maintenance

### 7.1 Log Cleanup

```bash
# Alte Heap Dumps löschen (älter als 7 Tage)
find ./memory-dumps -name "*.heapsnapshot" -mtime +7 -delete

# Alte Event Logs archivieren
tar -czf memory-logs-backup-$(date +%Y%m%d).tar.gz memory-logs/*.jsonl
find memory-logs -name "*.jsonl" -mtime +7 -delete
```

### 7.2 Monitoring deaktivieren

```typescript
// In backend/src/index.ts
// Zeile kommentieren:
// memoryMonitor.start(30000);
```

### 7.3 Alert-Schwellwerte anpassen

```typescript
// In backend/src/services/memory-monitor.ts
private heapDumpThreshold = 0.85; // 85% -> z.B. 0.90 für 90%
private gotifyAlertCooldown = 600000; // 10 Min -> z.B. 1800000 für 30 Min
```

---

## 8. Checkliste für Memory-Optimierung

### 8.1 Vor der Optimierung

- [ ] Memory-Monitoring läuft produktiv
- [ ] Mindestens 1 vollständiger Crash-Zyklus beobachtet
- [ ] Heap Dump erstellt und heruntergeladen
- [ ] Critical Event Logs gesammelt
- [ ] Top Memory Consumers identifiziert

### 8.2 Optimierungs-Kandidaten

**DocumentIndexer:**
- [ ] Embedding-Generierung: Batch-weise verarbeiten
- [ ] Chunking: Strings nicht konkatenieren
- [ ] QDrant Upload: Buffers nach Upload freigeben

**QDrant Client:**
- [ ] Connection Pooling überprüfen
- [ ] Response Buffers explizit leeren
- [ ] Timeout für Connections setzen

**MCP Clients:**
- [ ] WebSocket Message Queue limitieren
- [ ] Alte Messages expiren lassen
- [ ] Connection Lifecycle prüfen

**AI Services:**
- [ ] Streaming-Responses vollständig konsumieren
- [ ] Context-Historie begrenzen
- [ ] Alte Conversations löschen

### 8.3 Nach der Optimierung

- [ ] 2h Stabilitätstest ohne Crash
- [ ] Heap-Wachstum signifikant reduziert
- [ ] Keine ineffective GCs mehr
- [ ] Component Memory Deltas im akzeptablen Bereich
- [ ] Dokumentation aktualisiert

---

## 9. Kontakt & Support

**Bei kritischen Memory Issues:**
1. Gotify Alert wird automatisch gesendet
2. Logs unter `/app/memory-logs/` prüfen
3. Heap Dumps unter `/app/memory-dumps/` extrahieren

**Für weitere Analyse:**
- API-Endpoints nutzen (siehe Kapitel 2)
- Chrome DevTools für Heap-Analyse
- Diese Dokumentation als Leitfaden

**Letzte Aktualisierung:** 19.11.2025, 15:30 Uhr
**Monitoring Status:** ✅ Aktiv
**Nächster Review:** Nach erstem kritischen Event oder in 7 Tagen
