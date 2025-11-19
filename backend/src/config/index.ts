import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const serverEnvPath = path.resolve(process.cwd(), '.env.server');
if (fs.existsSync(serverEnvPath)) {
  // Merge server-specific environment variables when the file is present.
  dotenv.config({ path: serverEnvPath, override: false });
}

export interface MCPServerConfig {
  id: string;
  name: string;
  url: string;
  type: 'http';
  description: string;
  capabilities?: string[];
  enabled?: boolean;
  isDefault?: boolean;
  defaultTools?: {
    chat?: string;
    search?: string;
    reasoning?: string;
    edifactAnalyze?: string;
    edifactExplain?: string;
    edifactValidate?: string;
    edifactChat?: string;
    edifactModify?: string;
  };
}

const defaultToolsSchema = z.object({
  chat: z.string().optional(),
  search: z.string().optional(),
  reasoning: z.string().optional(),
  edifactAnalyze: z.string().optional(),
  edifactExplain: z.string().optional(),
  edifactValidate: z.string().optional(),
  edifactChat: z.string().optional(),
  edifactModify: z.string().optional(),
}).partial();

const mcpServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  type: z.literal('http'),
  description: z.string(),
  capabilities: z.array(z.string()).optional(),
  enabled: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false),
  defaultTools: defaultToolsSchema.optional(),
});

const configSchema = z.object({
  port: z.coerce.number().default(3001),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  corsOrigin: z.string().default('http://localhost:3000'),
  
  gemini: z.object({
    apiKey: z.string().min(1),
    model: z.string().default('gemini-3-pro-preview'),
    thinkingLevel: z.enum(['low', 'high']).optional(),
  }),
  
  mcpServers: z.array(mcpServerSchema).default([]),
  
  database: z.object({
    type: z.enum(['sqlite', 'postgres']).default('sqlite'),
    path: z.string().default('./data/markmedit.db'),
    url: z.string().optional(),
  }),
  
  git: z.object({
    repoPath: z.string().default('./data/documents'),
    autoCommit: z.coerce.boolean().default(true),
    authorName: z.string().default('MarkMEdit'),
    authorEmail: z.string().default('markmedit@localhost'),
  }),
  
  session: z.object({
    secret: z.string().min(16),
    jwtSecret: z.string().min(16),
  }),
  
  export: z.object({
    pandocPath: z.string().default('/usr/bin/pandoc'),
    revealJsVersion: z.string().default('4.5.0'),
  }),
  
  features: z.object({
    enableMCP: z.coerce.boolean().default(true),
    enableAI: z.coerce.boolean().default(true),
    enableExport: z.coerce.boolean().default(true),
    enableGitHistory: z.coerce.boolean().default(true),
    enableVectorStore: z.coerce.boolean().default(true),
  }),
  
  qdrant: z.object({
    url: z.string().default('http://qdrant:6333'),
    apiKey: z.string().optional(),
    enableEmbedding: z.coerce.boolean().default(true),
  }),
});

export const config = configSchema.parse({
  port: process.env.PORT,
  nodeEnv: process.env.NODE_ENV,
  corsOrigin: process.env.CORS_ORIGIN,
  
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL,
    thinkingLevel: process.env.GEMINI_THINKING_LEVEL as 'low' | 'high' | undefined,
  },
  
  openai: process.env.OPENAI_API_KEY ? {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL,
    maxTokens: process.env.OPENAI_MAX_TOKENS,
  } : undefined,
  
  anthropic: process.env.ANTHROPIC_API_KEY ? {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL,
    maxTokens: process.env.ANTHROPIC_MAX_TOKENS,
  } : undefined,
  
  mcpServers: process.env.MCP_SERVERS 
    ? JSON.parse(process.env.MCP_SERVERS)
    : [],
  
  database: {
    type: process.env.DATABASE_TYPE,
    path: process.env.DATABASE_PATH,
    url: process.env.DATABASE_URL,
  },
  
  git: {
    repoPath: process.env.GIT_REPO_PATH,
    autoCommit: process.env.GIT_AUTO_COMMIT,
    authorName: process.env.GIT_AUTHOR_NAME,
    authorEmail: process.env.GIT_AUTHOR_EMAIL,
  },
  
  session: {
    secret: process.env.SESSION_SECRET || 'change-this-secret-key',
    jwtSecret: process.env.JWT_SECRET || 'change-this-jwt-secret',
  },
  
  export: {
    pandocPath: process.env.PANDOC_PATH,
    revealJsVersion: process.env.REVEAL_JS_VERSION,
  },
  
  features: {
    enableMCP: process.env.ENABLE_MCP,
    enableAI: process.env.ENABLE_AI,
    enableExport: process.env.ENABLE_EXPORT,
    enableGitHistory: process.env.ENABLE_GIT_HISTORY,
    enableVectorStore: process.env.ENABLE_VECTOR_STORE,
  },
  
  qdrant: {
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
    enableEmbedding: process.env.QDRANT_ENABLE_EMBEDDING,
  },
});

export type Config = z.infer<typeof configSchema>;
