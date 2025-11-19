/**
 * Memory Monitoring Service
 * 
 * Tracks memory usage, heap statistics, and component-specific memory patterns
 * to identify memory leaks and optimization opportunities.
 */

import { EventEmitter } from 'events';
import * as v8 from 'v8';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Gotify configuration
 */
const GOTIFY_URL = 'https://push.tydids.com';
const GOTIFY_TOKEN = 'Ady-0bCfxnlGwPr';

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  heapLimit: number;
  external: number;
  arrayBuffers: number;
  rss: number;
  percentUsed: number;
}

export interface ComponentMemoryStats {
  component: string;
  operation: string;
  memoryBefore: number;
  memoryAfter: number;
  memoryDelta: number;
  duration: number;
  timestamp: number;
}

export interface GCEvent {
  type: 'scavenge' | 'mark-sweep-compact' | 'incremental-marking' | 'process-weak-callbacks';
  heapBefore: number;
  heapAfter: number;
  freed: number;
  duration: number;
  timestamp: number;
}

export interface CriticalEvent {
  timestamp: number;
  type: 'high_memory' | 'memory_leak' | 'ineffective_gc' | 'heap_dump';
  severity: 'warning' | 'critical';
  heapUsed: number;
  heapPercent: number;
  message: string;
  metadata?: any;
}

class MemoryMonitor extends EventEmitter {
  private intervalId: NodeJS.Timeout | null = null;
  private snapshots: MemorySnapshot[] = [];
  private componentStats: ComponentMemoryStats[] = [];
  private gcEvents: GCEvent[] = [];
  private criticalEvents: CriticalEvent[] = [];
  private maxSnapshots = 1000;
  private maxCriticalEvents = 100;
  private dumpDir: string;
  private logDir: string;
  private heapDumpThreshold = 0.85; // 85% heap usage triggers dump
  private lastDumpTimestamp = 0;
  private dumpCooldown = 300000; // 5 minutes between dumps
  private lastGotifyAlert = 0;
  private gotifyAlertCooldown = 600000; // 10 minutes between Gotify alerts

  constructor() {
    super();
    this.dumpDir = path.join(process.cwd(), 'memory-dumps');
    this.logDir = path.join(process.cwd(), 'memory-logs');
    this.ensureDumpDirectory();
    this.ensureLogDirectory();
  }

  private ensureDumpDirectory(): void {
    if (!fs.existsSync(this.dumpDir)) {
      fs.mkdirSync(this.dumpDir, { recursive: true });
    }
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Start periodic memory monitoring
   */
  start(intervalMs: number = 30000): void {
    if (this.intervalId) {
      console.log('[MemoryMonitor] Already running');
      return;
    }

    console.log(`[MemoryMonitor] Starting monitoring (interval: ${intervalMs}ms)`);
    
    this.intervalId = setInterval(() => {
      const snapshot = this.captureSnapshot();
      this.snapshots.push(snapshot);
      
      // Keep only recent snapshots
      if (this.snapshots.length > this.maxSnapshots) {
        this.snapshots.shift();
      }

      // Log current status
      this.logSnapshot(snapshot);

      // Check for critical heap usage
      if (snapshot.percentUsed >= this.heapDumpThreshold) {
        this.handleCriticalHeapUsage(snapshot);
      }

      // Emit event for external listeners
      this.emit('snapshot', snapshot);
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[MemoryMonitor] Stopped monitoring');
    }
  }

  /**
   * Capture current memory snapshot
   */
  private captureSnapshot(): MemorySnapshot {
    const usage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();

    return {
      timestamp: Date.now(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      heapLimit: heapStats.heap_size_limit,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
      rss: usage.rss,
      percentUsed: (usage.heapUsed / heapStats.heap_size_limit) * 100
    };
  }

  /**
   * Log snapshot in readable format
   */
  private logSnapshot(snapshot: MemorySnapshot): void {
    const heapUsedMB = Math.round(snapshot.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(snapshot.heapTotal / 1024 / 1024);
    const heapLimitMB = Math.round(snapshot.heapLimit / 1024 / 1024);
    const rssMB = Math.round(snapshot.rss / 1024 / 1024);
    const externalMB = Math.round(snapshot.external / 1024 / 1024);
    const percent = snapshot.percentUsed.toFixed(1);

    const level = snapshot.percentUsed >= 85 ? '🔴' :
                  snapshot.percentUsed >= 70 ? '🟡' :
                  '🟢';

    console.log(
      `[MemoryMonitor] ${level} Heap: ${heapUsedMB}/${heapTotalMB} MB ` +
      `(${percent}% of ${heapLimitMB} MB limit) | RSS: ${rssMB} MB | External: ${externalMB} MB`
    );
  }

  /**
   * Handle critical heap usage
   */
  private async handleCriticalHeapUsage(snapshot: MemorySnapshot): Promise<void> {
    const now = Date.now();
    
    // Log critical event
    const event: CriticalEvent = {
      timestamp: now,
      type: 'high_memory',
      severity: snapshot.percentUsed >= 90 ? 'critical' : 'warning',
      heapUsed: snapshot.heapUsed,
      heapPercent: snapshot.percentUsed,
      message: `Heap usage at ${snapshot.percentUsed.toFixed(1)}% (${Math.round(snapshot.heapUsed / 1024 / 1024)} MB)`,
      metadata: {
        heapTotal: snapshot.heapTotal,
        heapLimit: snapshot.heapLimit,
        rss: snapshot.rss,
        external: snapshot.external
      }
    };

    this.logCriticalEvent(event);

    // Send Gotify alert for critical events
    if (snapshot.percentUsed >= 90 && now - this.lastGotifyAlert >= this.gotifyAlertCooldown) {
      await this.sendGotifyAlert(event);
      this.lastGotifyAlert = now;
    }
    
    // Prevent too frequent dumps
    if (now - this.lastDumpTimestamp < this.dumpCooldown) {
      console.log('[MemoryMonitor] ⚠️  Critical heap usage detected, but dump cooldown active');
      return;
    }

    console.log('[MemoryMonitor] 🔴 CRITICAL HEAP USAGE - Triggering heap dump');
    this.lastDumpTimestamp = now;

    try {
      const filename = `heap-${Date.now()}-${Math.round(snapshot.percentUsed)}pct.heapsnapshot`;
      const filepath = path.join(this.dumpDir, filename);
      
      const heapSnapshot = v8.writeHeapSnapshot(filepath);
      console.log(`[MemoryMonitor] ✓ Heap snapshot saved: ${heapSnapshot}`);
      
      // Log heap dump event
      this.logCriticalEvent({
        timestamp: now,
        type: 'heap_dump',
        severity: 'critical',
        heapUsed: snapshot.heapUsed,
        heapPercent: snapshot.percentUsed,
        message: `Heap dump created: ${filename}`,
        metadata: { filepath, filename }
      });
      
      // Also write summary
      this.writeSummary(snapshot);
    } catch (error) {
      console.error('[MemoryMonitor] ✗ Failed to write heap snapshot:', error);
    }
  }

  /**
   * Send Gotify push notification
   */
  private async sendGotifyAlert(event: CriticalEvent): Promise<void> {
    try {
      const priority = event.severity === 'critical' ? 10 : 7;
      const title = event.severity === 'critical' 
        ? '🔴 MarkMEdit: Critical Memory Alert'
        : '🟡 MarkMEdit: Memory Warning';

      const message = `${event.message}\n\nType: ${event.type}\nTime: ${new Date(event.timestamp).toISOString()}`;

      const response = await fetch(`${GOTIFY_URL}/message?token=${GOTIFY_TOKEN}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          message,
          priority,
          extras: {
            'client::display': {
              contentType: 'text/plain'
            }
          }
        })
      });

      if (response.ok) {
        console.log('[MemoryMonitor] ✓ Gotify alert sent');
      } else {
        console.error('[MemoryMonitor] ✗ Gotify alert failed:', response.status, await response.text());
      }
    } catch (error) {
      console.error('[MemoryMonitor] ✗ Failed to send Gotify alert:', error);
    }
  }

  /**
   * Log critical event to structured log file
   */
  private logCriticalEvent(event: CriticalEvent): void {
    try {
      this.criticalEvents.push(event);
      
      // Keep only recent critical events in memory
      if (this.criticalEvents.length > this.maxCriticalEvents) {
        this.criticalEvents.shift();
      }

      // Write to log file
      const logDate = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.logDir, `critical-events-${logDate}.jsonl`);
      
      const logLine = JSON.stringify({
        ...event,
        isoTimestamp: new Date(event.timestamp).toISOString()
      }) + '\n';

      fs.appendFileSync(logFile, logLine);
    } catch (error) {
      console.error('[MemoryMonitor] ✗ Failed to log critical event:', error);
    }
  }

  /**
   * Write memory summary to file
   */
  private writeSummary(snapshot: MemorySnapshot): void {
    const summaryPath = path.join(this.dumpDir, `summary-${Date.now()}.json`);
    const summary = {
      snapshot,
      recentSnapshots: this.snapshots.slice(-10),
      topComponentStats: this.getTopMemoryConsumers(10),
      recentGCEvents: this.gcEvents.slice(-20),
      heapSpaces: v8.getHeapSpaceStatistics()
    };

    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`[MemoryMonitor] ✓ Memory summary saved: ${summaryPath}`);
  }

  /**
   * Track component-specific memory usage
   */
  async trackOperation<T>(
    component: string,
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const memoryBefore = process.memoryUsage().heapUsed;
    const startTime = Date.now();

    try {
      const result = await fn();
      
      const memoryAfter = process.memoryUsage().heapUsed;
      const duration = Date.now() - startTime;
      const memoryDelta = memoryAfter - memoryBefore;

      const stats: ComponentMemoryStats = {
        component,
        operation,
        memoryBefore,
        memoryAfter,
        memoryDelta,
        duration,
        timestamp: startTime
      };

      this.componentStats.push(stats);
      
      // Keep only recent stats
      if (this.componentStats.length > 1000) {
        this.componentStats.shift();
      }

      // Log significant memory increases
      if (memoryDelta > 10 * 1024 * 1024) { // > 10 MB
        const deltaMB = Math.round(memoryDelta / 1024 / 1024);
        console.log(
          `[MemoryMonitor] 📊 ${component}.${operation}: +${deltaMB} MB in ${duration}ms`
        );
      }

      this.emit('operation', stats);
      return result;
    } catch (error) {
      // Still track failed operations
      const memoryAfter = process.memoryUsage().heapUsed;
      const duration = Date.now() - startTime;
      
      this.componentStats.push({
        component,
        operation: `${operation} (failed)`,
        memoryBefore,
        memoryAfter,
        memoryDelta: memoryAfter - memoryBefore,
        duration,
        timestamp: startTime
      });

      throw error;
    }
  }

  /**
   * Record GC event
   */
  recordGCEvent(event: GCEvent): void {
    this.gcEvents.push(event);
    
    // Keep only recent GC events
    if (this.gcEvents.length > 500) {
      this.gcEvents.shift();
    }

    const freedMB = Math.round(event.freed / 1024 / 1024);
    const heapAfterMB = Math.round(event.heapAfter / 1024 / 1024);

    if (event.freed < 1024 * 1024) { // Less than 1 MB freed
      console.log(
        `[MemoryMonitor] ⚠️  GC ${event.type}: Freed only ${freedMB} MB ` +
        `(heap now ${heapAfterMB} MB) - ineffective GC!`
      );

      // Log ineffective GC as critical event
      this.logCriticalEvent({
        timestamp: event.timestamp,
        type: 'ineffective_gc',
        severity: 'warning',
        heapUsed: event.heapAfter,
        heapPercent: (event.heapAfter / v8.getHeapStatistics().heap_size_limit) * 100,
        message: `Ineffective GC: Only ${freedMB} MB freed`,
        metadata: event
      });
    }

    this.emit('gc', event);
  }

  /**
   * Get recent critical events
   */
  getCriticalEvents(limit: number = 20): CriticalEvent[] {
    return this.criticalEvents.slice(-limit);
  }

  /**
   * Get top memory consumers
   */
  getTopMemoryConsumers(limit: number = 10): ComponentMemoryStats[] {
    return [...this.componentStats]
      .sort((a, b) => b.memoryDelta - a.memoryDelta)
      .slice(0, limit);
  }

  /**
   * Get memory statistics
   */
  getStatistics() {
    const recent = this.snapshots.slice(-10);
    const avgHeapUsed = recent.length > 0
      ? recent.reduce((sum, s) => sum + s.heapUsed, 0) / recent.length
      : 0;

    const heapGrowth = recent.length >= 2
      ? recent[recent.length - 1].heapUsed - recent[0].heapUsed
      : 0;

    return {
      current: this.snapshots[this.snapshots.length - 1],
      averageHeapUsed: avgHeapUsed,
      heapGrowth,
      snapshotCount: this.snapshots.length,
      componentStatsCount: this.componentStats.length,
      gcEventCount: this.gcEvents.length,
      topConsumers: this.getTopMemoryConsumers(5)
    };
  }

  /**
   * Get heap space statistics
   */
  getHeapSpaces() {
    return v8.getHeapSpaceStatistics();
  }

  /**
   * Force garbage collection (if --expose-gc flag is set)
   */
  forceGC(): boolean {
    if (global.gc) {
      console.log('[MemoryMonitor] Forcing garbage collection...');
      const before = process.memoryUsage().heapUsed;
      global.gc();
      const after = process.memoryUsage().heapUsed;
      const freed = before - after;
      const freedMB = Math.round(freed / 1024 / 1024);
      console.log(`[MemoryMonitor] GC freed ${freedMB} MB`);
      return true;
    } else {
      console.log('[MemoryMonitor] GC not available (start with --expose-gc)');
      return false;
    }
  }

  /**
   * Get detailed report
   */
  generateReport(): string {
    const stats = this.getStatistics();
    const current = stats.current;
    
    if (!current) {
      return 'No memory snapshots available';
    }

    const lines = [
      '=== Memory Monitor Report ===',
      '',
      'Current State:',
      `  Heap Used: ${Math.round(current.heapUsed / 1024 / 1024)} MB`,
      `  Heap Total: ${Math.round(current.heapTotal / 1024 / 1024)} MB`,
      `  Heap Limit: ${Math.round(current.heapLimit / 1024 / 1024)} MB`,
      `  Utilization: ${current.percentUsed.toFixed(1)}%`,
      `  RSS: ${Math.round(current.rss / 1024 / 1024)} MB`,
      `  External: ${Math.round(current.external / 1024 / 1024)} MB`,
      '',
      'Trend:',
      `  Average Heap: ${Math.round(stats.averageHeapUsed / 1024 / 1024)} MB`,
      `  Recent Growth: ${Math.round(stats.heapGrowth / 1024 / 1024)} MB`,
      '',
      'Top Memory Consumers:',
      ...stats.topConsumers.map((c, i) => 
        `  ${i + 1}. ${c.component}.${c.operation}: +${Math.round(c.memoryDelta / 1024 / 1024)} MB (${c.duration}ms)`
      ),
      '',
      'Statistics:',
      `  Snapshots: ${stats.snapshotCount}`,
      `  Component Stats: ${stats.componentStatsCount}`,
      `  GC Events: ${stats.gcEventCount}`,
      ''
    ];

    return lines.join('\n');
  }
}

// Singleton instance
export const memoryMonitor = new MemoryMonitor();

// Export class for testing
export { MemoryMonitor };
