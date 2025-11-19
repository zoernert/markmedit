import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config/index.js';
import { memoryMonitor } from './memory-monitor.js';

let qdrantClient: QdrantClient | null = null;

/**
 * Initialize QDrant client connection
 */
export function initializeQdrant(): QdrantClient {
  if (qdrantClient) {
    return qdrantClient;
  }

  const qdrantUrl = config.qdrant?.url || 'http://qdrant:6333';
  
  console.log(`🔌 Connecting to QDrant at ${qdrantUrl}...`);
  
  qdrantClient = new QdrantClient({
    url: qdrantUrl,
    apiKey: config.qdrant?.apiKey,
  });

  return qdrantClient;
}

/**
 * Get QDrant client instance
 */
export function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    return initializeQdrant();
  }
  return qdrantClient;
}

/**
 * Check QDrant connection health
 */
export async function checkQdrantHealth(): Promise<boolean> {
  try {
    const client = getQdrantClient();
    const collections = await client.getCollections();
    console.log(`✓ QDrant connected: ${collections.collections.length} collections found`);
    return true;
  } catch (error) {
    console.error('✗ QDrant health check failed:', error);
    return false;
  }
}

/**
 * Collection names
 */
export const COLLECTIONS = {
  DOCUMENTS: 'documents',
  RESEARCH_SOURCES: 'research_sources',
  UPLOADED_FILES: 'uploaded_files',
  SUMMARIES: 'summaries',
} as const;

/**
 * Vector dimensions for Gemini text-embedding-004
 */
export const VECTOR_DIMENSIONS = 768;

/**
 * Create all required collections if they don't exist
 */
export async function initializeCollections(): Promise<void> {
  const client = getQdrantClient();
  
  const collections = [
    {
      name: COLLECTIONS.DOCUMENTS,
      description: 'Document chunks with hierarchical metadata',
    },
    {
      name: COLLECTIONS.RESEARCH_SOURCES,
      description: 'External research sources and web content',
    },
    {
      name: COLLECTIONS.UPLOADED_FILES,
      description: 'Content from uploaded PDFs and DOCX files',
    },
    {
      name: COLLECTIONS.SUMMARIES,
      description: 'Recursive summaries for large documents',
    },
  ];

  for (const collection of collections) {
    try {
      const exists = await collectionExists(collection.name);
      
      if (!exists) {
        console.log(`📦 Creating collection: ${collection.name}`);
        await client.createCollection(collection.name, {
          vectors: {
            size: VECTOR_DIMENSIONS,
            distance: 'Cosine',
          },
          optimizers_config: {
            default_segment_number: 2,
          },
          replication_factor: 1,
        });
        console.log(`✓ Created collection: ${collection.name}`);
      } else {
        console.log(`✓ Collection exists: ${collection.name}`);
      }
    } catch (error) {
      console.error(`✗ Failed to create collection ${collection.name}:`, error);
      throw error;
    }
  }
}

/**
 * Check if a collection exists
 */
async function collectionExists(name: string): Promise<boolean> {
  try {
    const client = getQdrantClient();
    const result = await client.getCollection(name);
    return !!result;
  } catch (error: any) {
    if (error.status === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Delete all points for a specific document (before re-indexing)
 */
export async function deleteDocumentVectors(
  collectionName: string,
  documentId: string
): Promise<void> {
  return memoryMonitor.trackOperation('QDrant', `deleteVectors(${collectionName})`, async () => {
    const client = getQdrantClient();
    
    try {
      await client.delete(collectionName, {
        filter: {
          must: [
            {
              key: 'document_id',
              match: {
                value: documentId,
              },
            },
          ],
        },
      });
      console.log(`✓ Deleted vectors for document ${documentId} from ${collectionName}`);
    } catch (error) {
      console.error(`✗ Failed to delete vectors for document ${documentId}:`, error);
      throw error;
    }
  });
}

/**
 * Metadata structure for document chunks
 */
export interface DocumentChunkMetadata {
  document_id: string;
  version: number;
  title: string;
  chapter?: string;
  section?: string;
  heading_level: number;
  heading_text: string;
  chunk_index: number;
  total_chunks: number;
  content_type: 'text' | 'code' | 'table' | 'list' | 'quote';
  char_count: number;
  created_at: string;
}

/**
 * Metadata structure for research sources
 */
export interface ResearchSourceMetadata {
  document_id: string;
  source_id: string;
  source_type: 'web' | 'api' | 'database';
  url?: string;
  title: string;
  chunk_index: number;
  total_chunks: number;
  relevance: 'background_research' | 'direct_reference' | 'citation';
  created_at: string;
}

/**
 * Metadata structure for uploaded files
 */
export interface UploadedFileMetadata {
  document_id: string;
  file_id: string;
  file_name: string;
  file_type: 'pdf' | 'docx' | 'txt';
  user_id?: string; // Owner of the file
  chunk_index: number;
  total_chunks: number;
  page_number?: number;
  created_at: string;
}

/**
 * Metadata structure for summaries
 */
export interface SummaryMetadata {
  document_id: string;
  summary_level: number; // 0 = original chunks, 1 = mid-level, 2 = high-level
  parent_chunk_ids?: string[];
  chunk_range?: {
    start: number;
    end: number;
  };
  created_at: string;
}
