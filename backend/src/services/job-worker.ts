/**
 * Job Worker
 * This script is intended to be forked by the job-queue manager to
 * run heavy/long-running jobs in a separate process so the main
 * event-loop is never blocked.
 * 
 * Features:
 * - Timeout enforcement per job (default: 4 minutes)
 * - Graceful error handling with detailed error messages
 * - Clean IPC communication with parent process
 */

const JOB_TIMEOUT_MS = 4 * 60 * 1000; // 4 minutes per job (worker-level timeout)

process.on('uncaughtException', (err) => {
  console.error('[JobWorker] Uncaught exception:', err);
  if (process.send) process.send({ success: false, error: String(err) });
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('[JobWorker] Unhandled rejection:', err);
  if (process.send) process.send({ success: false, error: String(err) });
  process.exit(1);
});

/**
 * Wrap async operation with timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

process.on('message', async (job: any) => {
  let jobTimeout: NodeJS.Timeout | null = null;
  
  try {
    console.log(`[JobWorker] Received job ${job?.id} (${job?.type})`);

    // Set a hard timeout for the entire job
    jobTimeout = setTimeout(() => {
      console.error(`[JobWorker] Job ${job?.id} exceeded timeout (${JOB_TIMEOUT_MS}ms)`);
      if (process.send) {
        process.send({ 
          success: false, 
          error: `Job timeout exceeded (${JOB_TIMEOUT_MS}ms)` 
        });
      }
      process.exit(1);
    }, JOB_TIMEOUT_MS);

    let result: any;

    switch (job.type) {
      case 'index-document': {
        // Dynamic import to avoid circular dependencies
        const { indexDocument } = await import('./document-indexer.js');
        const payload = job.payload;
        
        console.log(`[JobWorker] Starting document indexing for ${payload.documentId}...`);
        
        // Index document with timeout (embedding calls have 30s timeout internally)
        result = await withTimeout(
          indexDocument(payload.documentId, payload.title, payload.content, payload.version),
          JOB_TIMEOUT_MS - 5000, // Leave 5s buffer for cleanup
          'Document indexing'
        );
        
        console.log(`[JobWorker] Document indexing completed successfully`);
        break;
      }

      case 'delete-document-vectors': {
        const { deleteDocumentVectors, COLLECTIONS } = await import('./qdrant-client.js');
        const payload = job.payload;
        
        console.log(`[JobWorker] Deleting vectors for ${payload.documentId}...`);
        
        // Delete vectors with timeout
        await withTimeout(
          deleteDocumentVectors(COLLECTIONS.DOCUMENTS, payload.documentId),
          30000, // 30 seconds for delete operation
          'Vector deletion'
        );
        
        result = { success: true };
        console.log(`[JobWorker] Vector deletion completed successfully`);
        break;
      }

      default:
        throw new Error(`Unknown job type in worker: ${job.type}`);
    }

    // Clear timeout on success
    if (jobTimeout) clearTimeout(jobTimeout);

    // Send success result to parent
    if (process.send) {
      process.send({ success: true, result });
    }

    // Allow parent to receive message and exit gracefully
    setTimeout(() => process.exit(0), 100);
  } catch (err: any) {
    // Clear timeout on error
    if (jobTimeout) clearTimeout(jobTimeout);
    
    const errorMessage = err?.message || String(err);
    console.error(`[JobWorker] Error processing job ${job?.id}:`, errorMessage);
    
    // Send error to parent
    if (process.send) {
      process.send({ success: false, error: errorMessage });
    }
    
    process.exit(1);
  }
});
