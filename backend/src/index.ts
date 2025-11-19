import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'express-async-errors';
import { config } from './config/index.js';
import { initializeDatabase } from './db/index.js';
import { initializeGit } from './services/git.js';
import { getMCPManager } from './services/mcp-manager.js';
import { syncMcpServersFromConfig } from './services/mcp-registry.js';
import { errorHandler } from './middleware/errorHandler.js';
import { documentRoutes } from './routes/documents.js';
import { aiRoutes } from './routes/ai.js';
import { aiEnhancedRoutes } from './routes/ai-enhanced.js';
import { mcpRoutes } from './routes/mcp.js';
import { mcpGenericRoutes } from './routes/mcp-generic.js';
import { mcpServerRoutes } from './routes/mcp-servers.js';
import { exportRoutes } from './routes/export.js';
import { artifactsRoutes } from './routes/artifacts.js';
import mcpHintsRoutes from './routes/mcp-hints.js';
import { converterRoutes } from './routes/converter.js';
import authRoutes from './routes/auth.js';
import permissionsRoutes from './routes/permissions.js';
import { collaborationRoutes } from './routes/collaboration.js';
import { researchRoutes } from './routes/research.js';
import { imageRoutes } from './routes/images.js';
import { publicRoutes } from './routes/public.js';
import { shareRoutes } from './routes/share.js';
import { initializeCollaborationServer } from './services/collaboration.js';
import { memoryMonitor } from './services/memory-monitor.js';
import { jobQueue } from './services/job-queue.js';

async function main() {
  const app = express();

  // Start memory monitoring
  memoryMonitor.start(30000); // Check every 30 seconds
  console.log('✓ Memory monitoring started');

  // Initialize job queue (loads from database and starts worker)
  console.log(`✓ Job Queue initialized (${jobQueue.getStats().total} jobs loaded)`);

  // Middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // For inline scripts
          "https://cdn.jsdelivr.net", // For Mermaid CDN
        ],
        scriptSrcElem: [
          "'self'",
          "'unsafe-inline'", // For inline script tags
          "https://cdn.jsdelivr.net", // For Mermaid CDN
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
      },
    },
  }));
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Memory stats endpoint (for monitoring)
  app.get('/api/memory-stats', (_req, res) => {
    const stats = memoryMonitor.getStatistics();
    const heapSpaces = memoryMonitor.getHeapSpaces();
    res.json({ stats, heapSpaces });
  });

  // Memory report endpoint
  app.get('/api/memory-report', (_req, res) => {
    const report = memoryMonitor.generateReport();
    res.type('text/plain').send(report);
  });

  // Critical events endpoint
  app.get('/api/memory-events', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const events = memoryMonitor.getCriticalEvents(limit);
    res.json({ 
      total: events.length, 
      events,
      lastUpdate: events.length > 0 ? events[events.length - 1].timestamp : null
    });
  });

  // Routes
  app.use('/share', shareRoutes); // Public sharing (no /api prefix, no auth required)
  app.use('/api/share', shareRoutes); // Share management (enable/disable/status)
  app.use('/api/public', publicRoutes); // Public document access (no auth required)
  app.use('/api/auth', authRoutes); // Authentication routes
  app.use('/api/permissions', permissionsRoutes); // Permission management routes
  app.use('/api/collaboration', collaborationRoutes); // Collaboration stats routes
  app.use('/api/research', researchRoutes); // Research tools routes
  app.use('/api/images', imageRoutes); // Image upload/management routes
  app.use('/api/documents', documentRoutes);
  app.use('/api/documents/:documentId/artifacts', artifactsRoutes);
  app.use('/api/artifacts', artifactsRoutes); // Global artifacts library endpoint
  
  // AI route with extended timeout for document analysis
  app.use('/api/ai', (req, res, next) => {
    req.setTimeout(3 * 60 * 1000); // 3 minutes for document analysis
    res.setTimeout(3 * 60 * 1000);
    next();
  }, aiRoutes);
  
  // AI-Enhanced route with extended timeout for complex multi-tool queries
  app.use('/api/ai-enhanced', (req, res, next) => {
    req.setTimeout(5 * 60 * 1000); // 5 minutes for complex MCP tool chains
    res.setTimeout(5 * 60 * 1000);
    next();
  }, aiEnhancedRoutes);
  
  app.use('/api/mcp', mcpRoutes); // Legacy brand-specific routes (kept for backward compatibility)
  app.use('/api/mcp-generic', mcpGenericRoutes); // New generic MCP routes
  app.use('/api/mcp-servers', mcpServerRoutes); // Management endpoints for MCP servers
  app.use('/api/mcp-hints', mcpHintsRoutes); // MCP tool hints management
  app.use('/api/converter', converterRoutes); // Document conversion (presentations, etc.)
  app.use('/api/export', exportRoutes);

  // Error handling
  app.use(errorHandler);

  // Initialize services
  await initializeDatabase();
  await syncMcpServersFromConfig(config.mcpServers);
  await initializeGit();
  
  // Initialize QDrant Vector Store
  if (config.features.enableVectorStore) {
    try {
      const { initializeQdrant, initializeCollections, checkQdrantHealth } = await import('./services/qdrant-client.js');
      initializeQdrant();
      const isHealthy = await checkQdrantHealth();
      if (isHealthy) {
        await initializeCollections();
        console.log('✓ Vector Store (QDrant) initialized');
      } else {
        console.warn('⚠️ Vector Store connection failed - continuing without vector features');
      }
    } catch (error) {
      console.warn('⚠️ Vector Store initialization failed:', error);
      console.warn('   Continuing without vector features...');
    }
  }
  
  // Initialize MCP Manager (replaces initializeMCP)
  if (config.features.enableMCP) {
    getMCPManager(); // This initializes and logs available servers
  }

  // Start server
  const httpServer = app.listen(config.port, () => {
    console.log(`✓ MarkMEdit Backend running on port ${config.port}`);
    console.log(`✓ Environment: ${config.nodeEnv}`);
    console.log(`✓ Database: ${config.database.type}`);
    console.log(`✓ Git repository: ${config.git.repoPath}`);
    console.log(`✓ AI enabled: ${config.features.enableAI}`);
    console.log(`✓ MCP enabled: ${config.features.enableMCP}`);
    console.log(`✓ Vector Store enabled: ${config.features.enableVectorStore}`);
  });

  // Initialize WebSocket server for real-time collaboration
  initializeCollaborationServer(httpServer);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
