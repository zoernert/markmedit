# Job Queue System

## Overview

The MarkMEdit job queue system provides **non-blocking background processing** for heavy operations like document indexing. It prevents the main Node.js event loop from blocking during long-running tasks.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Main Backend Process                       │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────┐  │
│  │  HTTP Request  │  │   Job Queue     │  │  SQLite DB   │  │
│  │   (Express)    │→→│   (In-Memory)   │←→│ Persistence  │  │
│  └────────────────┘  └─────────────────┘  └──────────────┘  │
│         ↓                     ↓                               │
│    Immediate             Worker Loop                          │
│    Response              (every 1s)                           │
│    (< 100ms)                  ↓                               │
└───────────────────────────────┼───────────────────────────────┘
                                ↓
                    ┌───────────────────────┐
                    │  Forked Worker Process │
                    │  (job-worker.ts)       │
                    │  ┌──────────────────┐  │
                    │  │ Heavy Operations │  │
                    │  │ - Embeddings     │  │
                    │  │ - Vector Ops     │  │
                    │  │ - Timeouts       │  │
                    │  └──────────────────┘  │
                    └───────────────────────┘
                                ↓
                    ┌───────────────────────┐
                    │  Result via IPC       │
                    │  - Success + Data     │
                    │  - Error + Message    │
                    └───────────────────────┘
```

## Features

### 1. Non-Blocking Execution
- Heavy jobs run in **forked worker processes**
- Main event loop **never blocks**
- Backend remains **100% responsive**

### 2. Multi-Layer Timeouts
- **Layer 1**: Gemini API calls → 30s timeout
- **Layer 2**: Document indexing → 235s timeout (worker)
- **Layer 3**: Worker process → 240s hard timeout
- **Layer 4**: Parent supervision → 5min safety cap

### 3. Exponential Backoff Retry
```
Attempt 1: Immediate
Attempt 2: +1s delay
Attempt 3: +2s delay
Attempt 4: +4s delay
Attempt 5: +8s delay
Attempt N: +min(2^(N-1), 30)s delay (max 30s)
```

### 4. Priority Queue
- Jobs sorted by **priority** (0-10, higher = more important)
- Equal priority → **FIFO** (first in, first out)
- Background jobs can be lower priority

### 5. Persistence
- All jobs stored in **SQLite** (`background_jobs` table)
- Jobs survive **container restarts**
- Processing jobs automatically **re-queued** on startup

### 6. Graceful Shutdown
- Stops accepting new jobs on `SIGTERM`/`SIGINT`
- Waits up to **30s** for active jobs to complete
- Re-queues interrupted jobs for next startup
- Kills remaining workers forcefully after timeout

## Job Types

### `index-document`
**Purpose**: Index document for vector search  
**Timeout**: 4 minutes  
**Payload**:
```typescript
{
  documentId: string;
  title: string;
  content: string;
  version: number;
}
```

### `delete-document-vectors`
**Purpose**: Remove document vectors from QDrant  
**Timeout**: 30 seconds  
**Payload**:
```typescript
{
  documentId: string;
}
```

## Usage

### Adding a Job

```typescript
import { jobQueue } from './services/job-queue.js';

// Queue document indexing
const jobId = jobQueue.addJob('index-document', {
  documentId: doc.id,
  title: doc.title,
  content: doc.content,
  version: doc.version,
}, {
  priority: 5,      // Normal priority (0-10)
  maxAttempts: 3,   // Retry up to 3 times
});

console.log(`Job queued: ${jobId}`);
// API responds immediately - indexing happens in background
```

### Checking Job Status

```typescript
// Get specific job
const job = jobQueue.getJob(jobId);
console.log(job.status); // 'queued' | 'processing' | 'completed' | 'failed'

// Get queue statistics
const stats = jobQueue.getStats();
console.log(stats);
// {
//   total: 5,
//   queued: 2,
//   processing: 1,
//   completed: 2,
//   failed: 0,
//   activeWorkers: 1,
//   maxConcurrent: 1
// }
```

### Cancelling a Job

```typescript
const cancelled = jobQueue.cancelJob(jobId);
if (cancelled) {
  console.log('Job cancelled successfully');
} else {
  console.log('Job cannot be cancelled (not queued or already processing)');
}
```

## API Endpoints

### `GET /api/documents/jobs`
Get queue statistics and recent jobs

**Response**:
```json
{
  "stats": {
    "total": 5,
    "queued": 2,
    "processing": 1,
    "completed": 2,
    "failed": 0,
    "activeWorkers": 1,
    "maxConcurrent": 1
  },
  "recentJobs": [
    {
      "id": "index-document-1763556226561-5b6oh",
      "type": "index-document",
      "status": "completed",
      "priority": 5,
      "attempts": 1,
      "createdAt": 1763556226561,
      "completedAt": 1763556230123
    }
  ]
}
```

### `GET /api/documents/jobs/:jobId`
Get specific job details

**Response**:
```json
{
  "job": {
    "id": "index-document-1763556226561-5b6oh",
    "type": "index-document",
    "status": "completed",
    "payload": {
      "documentId": "63d61a92-5948-4a33-86ce-9a9d4da37c57",
      "title": "My Document",
      "content": "...",
      "version": 35
    },
    "priority": 5,
    "attempts": 1,
    "maxAttempts": 3,
    "createdAt": 1763556226561,
    "startedAt": 1763556226570,
    "completedAt": 1763556230123,
    "result": {
      "success": true,
      "chunksIndexed": 7,
      "vectorsUploaded": 7
    }
  }
}
```

### `DELETE /api/documents/jobs/:jobId`
Cancel a queued job

**Response**:
```json
{
  "success": true
}
```

## Events

The job queue emits events for monitoring:

```typescript
jobQueue.on('job-added', (job) => {
  console.log(`Job added: ${job.id}`);
});

jobQueue.on('job-started', (job) => {
  console.log(`Job started: ${job.id}`);
});

jobQueue.on('job-completed', (job) => {
  console.log(`Job completed: ${job.id} in ${job.completedAt - job.startedAt}ms`);
});

jobQueue.on('job-failed', (job) => {
  console.error(`Job failed: ${job.id} - ${job.error}`);
});

jobQueue.on('job-cancelled', (job) => {
  console.log(`Job cancelled: ${job.id}`);
});
```

## Database Schema

```sql
CREATE TABLE background_jobs (
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
);
```

## Monitoring

### Logs

```bash
# Job queue activity
docker logs markmedit-backend | grep JobQueue

# Worker process activity
docker logs markmedit-backend | grep JobWorker

# Example output:
# [JobQueue] ➕ Added job index-document-1763556226561-5b6oh (priority: 5)
# [JobQueue] ▶️ Processing job index-document-1763556226561-5b6oh - attempt 1/3
# [JobWorker] Received job index-document-1763556226561-5b6oh (index-document)
# [JobWorker] Starting document indexing for 63d61a92-5948-4a33-86ce-9a9d4da37c57...
# [JobWorker] Document indexing completed successfully
# [JobQueue] ✅ Completed job index-document-1763556226561-5b6oh in 3553ms
```

### Health Checks

The job queue automatically:
- Cleans up old jobs (>24h) every hour
- Re-queues stuck jobs on restart
- Kills hung workers after timeout
- Persists all state to database

## Configuration

```typescript
// In job-queue.ts
private maxConcurrent = 1; // Process 1 job at a time (sequential)
private persistToDb = true; // Enable SQLite persistence

// In job-worker.ts
const JOB_TIMEOUT_MS = 4 * 60 * 1000; // 4 minutes per job

// Graceful shutdown timeout
const shutdownTimeout = 30000; // 30 seconds
```

## Best Practices

1. **Always use the queue for heavy operations**
   - Document indexing
   - Large file processing
   - External API calls with potential delays

2. **Set appropriate priorities**
   - User-initiated: 8-10 (high)
   - Background indexing: 5 (normal)
   - Cleanup tasks: 1-3 (low)

3. **Configure retry attempts based on operation**
   - Idempotent operations: 3-5 retries
   - Non-idempotent: 1 retry
   - Critical operations: Higher retries

4. **Monitor job failures**
   - Check logs regularly
   - Set up alerts for high failure rates
   - Investigate timeout causes

5. **Test graceful shutdown**
   ```bash
   # Test SIGTERM handling
   docker stop markmedit-backend
   
   # Check logs for graceful shutdown
   docker logs markmedit-backend --tail 50
   ```

## Troubleshooting

### Jobs not processing
```bash
# Check if worker is running
docker logs markmedit-backend | grep "Worker started"

# Check queue status
curl https://markmedit.corrently.io/api/documents/jobs
```

### Jobs timing out
```bash
# Check worker logs
docker logs markmedit-backend | grep "timeout"

# Possible causes:
# - Slow Gemini API responses
# - QDrant connection issues
# - Large document content
```

### Jobs stuck in processing
```bash
# Check if worker process crashed
docker logs markmedit-backend | grep "Worker exited"

# Manually re-queue stuck jobs
docker restart markmedit-backend
# Jobs will automatically be reset to 'queued' on startup
```

## Future Enhancements

- [ ] WebSocket notifications for job completion
- [ ] Frontend UI for job monitoring
- [ ] Job scheduling (cron-like)
- [ ] Increase maxConcurrent with memory monitoring
- [ ] Job priorities based on user roles
- [ ] Detailed performance metrics
