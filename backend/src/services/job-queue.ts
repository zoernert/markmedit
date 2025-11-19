/**
 * Job Queue Service
 * Simple in-memory job queue for background processing
 * Prevents blocking the main event loop during long-running operations
 */

import { EventEmitter } from 'events';
import { getDatabase } from '../db/index.js';
import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

export type JobType = 'index-document' | 'delete-document-vectors' | 'generate-summary';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface Job<T = any> {
  id: string;
  type: JobType;
  status: JobStatus;
  payload: T;
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  result?: any;
}

export interface IndexDocumentPayload {
  documentId: string;
  title: string;
  content: string;
  version: number;
}

export interface DeleteVectorsPayload {
  documentId: string;
}

/**
 * Job Queue Manager
 * Manages background jobs with priority queue and retry logic
 */
class JobQueueManager extends EventEmitter {
  private queue: Map<string, Job> = new Map();
  private processing = false;
  private maxConcurrent = 1; // Process one job at a time to avoid memory issues
  private activeJobs = 0;
  private persistToDb = true;
  private workerProcesses: Set<any> = new Set(); // Track active worker processes
  private isShuttingDown = false;
  private workerInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    // Delay DB loading until after backend initialization
    // Load jobs in next tick to allow DB initialization
    process.nextTick(() => {
      try {
        this.loadJobsFromDb();
      } catch (error: any) {
        console.error('[JobQueue] Failed to load jobs on startup:', error.message);
        console.log('[JobQueue] Will attempt to initialize DB and retry...');
        // DB will be initialized by backend startup, jobs will be loaded when first accessed
      }
    });
    this.startWorker();
    this.setupGracefulShutdown();
  }

  /**
   * Load pending jobs from database on startup
   */
  private loadJobsFromDb(): void {
    if (!this.persistToDb) return;

    try {
      const db = getDatabase();
      if (!db) {
        throw new Error('Database not initialized');
      }

      this.ensureDbTable(); // Create table if it doesn't exist

      // Load pending/processing jobs
      const jobs = db.prepare(`
        SELECT * FROM background_jobs 
        WHERE status IN ('queued', 'processing')
        ORDER BY priority DESC, created_at ASC
      `).all() as any[];

      for (const row of jobs) {
        const job: Job = {
          id: row.id,
          type: row.type as JobType,
          status: 'queued', // Reset processing jobs to queued
          payload: JSON.parse(row.payload),
          priority: row.priority,
          attempts: row.attempts,
          maxAttempts: row.max_attempts,
          createdAt: row.created_at,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          error: row.error,
          result: row.result ? JSON.parse(row.result) : undefined,
        };

        this.queue.set(job.id, job);
      }

      if (jobs.length > 0) {
        console.log(`[JobQueue] Loaded ${jobs.length} pending jobs from database`);
      }
    } catch (error) {
      console.error('[JobQueue] Failed to load jobs from database:', error);
    }
  }

  /**
   * Ensure database table exists
   */
  private ensureDbTable(): void {
    try {
      const db = getDatabase();
      if (!db) return;
      
      db.exec(`
        CREATE TABLE IF NOT EXISTS background_jobs (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          status TEXT NOT NULL,
          payload TEXT NOT NULL,
          priority INTEGER DEFAULT 0,
          attempts INTEGER DEFAULT 0,
          max_attempts INTEGER DEFAULT 3,
          created_at INTEGER NOT NULL,
          started_at INTEGER,
          completed_at INTEGER,
          error TEXT,
          result TEXT
        )
      `);
    } catch (error) {
      // Silent fail - will retry on next operation
    }
  }

  /**
   * Persist job to database
   */
  private persistJob(job: Job): void {
    if (!this.persistToDb) return;

    try {
      this.ensureDbTable(); // Ensure table exists before insert
      const db = getDatabase();
      if (!db) return;
      
      db.prepare(`
        INSERT OR REPLACE INTO background_jobs (
          id, type, status, payload, priority, attempts, max_attempts,
          created_at, started_at, completed_at, error, result
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        job.id,
        job.type,
        job.status,
        JSON.stringify(job.payload),
        job.priority,
        job.attempts,
        job.maxAttempts,
        job.createdAt,
        job.startedAt || null,
        job.completedAt || null,
        job.error || null,
        job.result ? JSON.stringify(job.result) : null
      );
    } catch (error) {
      console.error('[JobQueue] Failed to persist job:', error);
    }
  }

  /**
   * Add a job to the queue
   */
  addJob<T = any>(
    type: JobType,
    payload: T,
    options: {
      priority?: number;
      maxAttempts?: number;
    } = {}
  ): string {
    const jobId = `${type}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const job: Job<T> = {
      id: jobId,
      type,
      status: 'queued',
      payload,
      priority: options.priority || 0,
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      createdAt: Date.now(),
    };

    this.queue.set(jobId, job);
    this.persistJob(job);

    console.log(`[JobQueue] ➕ Added job ${jobId} (${type}) to queue (priority: ${job.priority})`);

    this.emit('job-added', job);
    this.processNext();

    return jobId;
  }

  /**
   * Get job status
   */
  getJob(jobId: string): Job | undefined {
    return this.queue.get(jobId);
  }

  /**
   * Get all jobs matching criteria
   */
  getJobs(filter?: { status?: JobStatus; type?: JobType }): Job[] {
    const jobs = Array.from(this.queue.values());

    if (!filter) return jobs;

    return jobs.filter(job => {
      if (filter.status && job.status !== filter.status) return false;
      if (filter.type && job.type !== filter.type) return false;
      return true;
    });
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    const job = this.queue.get(jobId);
    if (!job || job.status !== 'queued') {
      return false;
    }

    job.status = 'failed';
    job.error = 'Cancelled by user';
    job.completedAt = Date.now();

    this.persistJob(job);
    this.emit('job-cancelled', job);

    console.log(`[JobQueue] ❌ Cancelled job ${jobId}`);
    return true;
  }

  /**
   * Clear completed/failed jobs older than X milliseconds
   */
  cleanupOldJobs(maxAge: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, job] of this.queue.entries()) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.completedAt &&
        now - job.completedAt > maxAge
      ) {
        this.queue.delete(id);
        cleaned++;
      }
    }

    // Also clean from database
    if (this.persistToDb) {
      try {
        this.ensureDbTable();
        const db = getDatabase();
        if (!db) {
          console.warn('[JobQueue] Database not available for cleanup');
        } else {
          db.prepare(`
            DELETE FROM background_jobs 
            WHERE status IN ('completed', 'failed')
            AND completed_at < ?
          `).run(now - maxAge);
        }
      } catch (error) {
        console.error('[JobQueue] Failed to cleanup database:', error);
      }
    }

    if (cleaned > 0) {
      console.log(`[JobQueue] 🧹 Cleaned up ${cleaned} old jobs`);
    }

    return cleaned;
  }

  /**
   * Start the worker loop
   */
  private startWorker(): void {
    // Process jobs every second
    this.workerInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        this.processNext();
      }
    }, 1000);

    // Cleanup old jobs every hour
    this.cleanupInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        this.cleanupOldJobs();
      }
    }, 60 * 60 * 1000);

    console.log('[JobQueue] ✓ Worker started');
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      
      console.log(`[JobQueue] 🛑 Received ${signal}, initiating graceful shutdown...`);
      this.isShuttingDown = true;

      // Stop accepting new jobs
      if (this.workerInterval) clearInterval(this.workerInterval);
      if (this.cleanupInterval) clearInterval(this.cleanupInterval);

      // Wait for active jobs to complete (max 30s)
      const shutdownTimeout = 30000;
      const startTime = Date.now();
      
      while (this.activeJobs > 0 && Date.now() - startTime < shutdownTimeout) {
        console.log(`[JobQueue] Waiting for ${this.activeJobs} active jobs to complete...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Kill any remaining worker processes
      if (this.workerProcesses.size > 0) {
        console.log(`[JobQueue] Terminating ${this.workerProcesses.size} worker processes...`);
        for (const worker of this.workerProcesses) {
          try {
            worker.kill('SIGTERM');
          } catch (e) {
            // Ignore errors
          }
        }
      }

      // Mark processing jobs as queued for retry on next startup
      for (const job of this.queue.values()) {
        if (job.status === 'processing') {
          job.status = 'queued';
          this.persistJob(job);
          console.log(`[JobQueue] Re-queued job ${job.id} for retry on next startup`);
        }
      }

      console.log('[JobQueue] ✓ Graceful shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Process next job in queue
   */
  private async processNext(): Promise<void> {
    if (this.processing || this.activeJobs >= this.maxConcurrent) {
      return;
    }

    const now = Date.now();

    // Find next job to process (highest priority, oldest first)
    // Skip jobs that are waiting for retry backoff
    const nextJob = Array.from(this.queue.values())
      .filter(job => {
        if (job.status !== 'queued') return false;
        // Check if job is waiting for retry backoff
        const retryAfter = (job as any).retryAfter;
        if (retryAfter && now < retryAfter) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.createdAt - b.createdAt;
      })[0];

    if (!nextJob) return;

    this.processing = true;
    this.activeJobs++;

    try {
      await this.executeJob(nextJob);
    } catch (error) {
      console.error(`[JobQueue] Unexpected error processing job ${nextJob.id}:`, error);
    } finally {
      this.processing = false;
      this.activeJobs--;
      
      // Process next job immediately if queue not empty
      setImmediate(() => this.processNext());
    }
  }

  /**
   * Execute a job
   */
  private async executeJob(job: Job): Promise<void> {
    console.log(`[JobQueue] ▶️ Processing job ${job.id} (${job.type}) - attempt ${job.attempts + 1}/${job.maxAttempts}`);

    job.status = 'processing';
    job.startedAt = Date.now();
    job.attempts++;

    this.persistJob(job);
    this.emit('job-started', job);

    try {
      // Execute job based on type
      const result = await this.runJobHandler(job);

      // Job succeeded
      job.status = 'completed';
      job.completedAt = Date.now();
      job.result = result;

      this.persistJob(job);
      this.emit('job-completed', job);

      console.log(`[JobQueue] ✅ Completed job ${job.id} (${job.type}) in ${job.completedAt - job.startedAt!}ms`);
    } catch (error) {
      // Job failed
      const errorMessage = error instanceof Error ? error.message : String(error);
      job.error = errorMessage;

      if (job.attempts < job.maxAttempts) {
        // Retry with exponential backoff
        job.status = 'queued';
        
        // Calculate backoff delay: 1s, 2s, 4s, 8s, etc (max 30s)
        const backoffMs = Math.min(1000 * Math.pow(2, job.attempts - 1), 30000);
        
        console.log(`[JobQueue] ⚠️ Job ${job.id} failed, will retry in ${backoffMs}ms (${job.attempts}/${job.maxAttempts}): ${errorMessage}`);
        
        // Add a timestamp for when to retry
        (job as any).retryAfter = Date.now() + backoffMs;
      } else {
        // Max attempts reached
        job.status = 'failed';
        job.completedAt = Date.now();
        console.error(`[JobQueue] ❌ Job ${job.id} failed permanently after ${job.maxAttempts} attempts: ${errorMessage}`);
      }

      this.persistJob(job);
      this.emit('job-failed', job);
    }
  }

  /**
   * Run job handler based on type
   */
  private async runJobHandler(job: Job): Promise<any> {
    // Run heavy jobs in a separate worker process to avoid blocking the main event loop.
    const __filename = fileURLToPath(import.meta.url);
    const workerFile = path.join(path.dirname(__filename), 'job-worker.js');

    return await new Promise((resolve, reject) => {
      let settled = false;
      try {
        const child = fork(workerFile, [], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
        
        // Track worker process for graceful shutdown
        this.workerProcesses.add(child);

        // Timeout safety: ensure worker cannot hang forever (30s per job by default, parent-level safety)
        const workerTimeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            this.workerProcesses.delete(child);
            try { child.kill('SIGKILL'); } catch (e) {}
            reject(new Error('Worker timeout exceeded'));
          }
        }, 5 * 60 * 1000); // 5 minutes hard cap; worker should implement per-call timeouts

        child.on('message', (msg: any) => {
          if (settled) return;
          settled = true;
          clearTimeout(workerTimeout);
          this.workerProcesses.delete(child);
          if (msg && msg.success) return resolve(msg.result);
          return reject(new Error(msg?.error || 'Worker reported failure'));
        });

        child.on('exit', (code: number) => {
          if (settled) return;
          settled = true;
          clearTimeout(workerTimeout);
          this.workerProcesses.delete(child);
          if (code === 0) return resolve({ success: true });
          return reject(new Error(`Worker exited with code ${code}`));
        });

        // Send the job payload for processing
        child.send({ id: job.id, type: job.type, payload: job.payload });
      } catch (err) {
        if (!settled) {
          settled = true;
          reject(err);
        }
      }
    });
  }

  // Heavy job handlers are executed in the separate worker process (job-worker.ts)

  /**
   * Get queue statistics
   */
  getStats() {
    const jobs = Array.from(this.queue.values());
    return {
      total: jobs.length,
      queued: jobs.filter(j => j.status === 'queued').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      activeWorkers: this.activeJobs,
      maxConcurrent: this.maxConcurrent,
    };
  }
}

// Singleton instance
export const jobQueue = new JobQueueManager();
