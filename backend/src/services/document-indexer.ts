/**
 * Document Indexer Service
 * Handles async indexing of documents into QDrant vector store
 */

import { getQdrantClient, COLLECTIONS, deleteDocumentVectors, type DocumentChunkMetadata } from './qdrant-client.js';
import { generateEmbeddingBatch } from './embedding.js';
import { chunkMarkdown, getMarkdownStats } from './markdown-chunking.js';
import { nanoid } from 'nanoid';
import { memoryMonitor } from './memory-monitor.js';

/**
 * Index a document into QDrant
 * @param documentId Document ID
 * @param title Document title
 * @param content Markdown content
 * @param version Document version
 */
export async function indexDocument(
  documentId: string,
  title: string,
  content: string,
  version: number
): Promise<{ success: boolean; chunksIndexed: number; error?: string }> {
  return memoryMonitor.trackOperation('DocumentIndexer', 'indexDocument', async () => {
    try {
      console.log(`📚 Starting indexing for document ${documentId} (version ${version})...`);

      // Step 1: Delete old vectors for this document
      await memoryMonitor.trackOperation('DocumentIndexer', 'deleteVectors', async () => {
        await deleteDocumentVectors(COLLECTIONS.DOCUMENTS, documentId);
      });

      // Step 2: Get stats for logging
      const stats = getMarkdownStats(content);
      console.log(`📊 Document stats:`, stats);

      // Step 3: Chunk the markdown
      const chunks = chunkMarkdown(content, 2000);
      console.log(`✂️ Created ${chunks.length} chunks`);

      if (chunks.length === 0) {
        console.log(`⚠️ No chunks created for document ${documentId}`);
        return { success: true, chunksIndexed: 0 };
      }

      // Step 4: Generate embeddings for all chunks
      const texts = chunks.map(chunk => chunk.content);
      const embeddings = await memoryMonitor.trackOperation(
        'DocumentIndexer', 
        `generateEmbeddings(${chunks.length} chunks)`, 
        async () => generateEmbeddingBatch(texts, 'RETRIEVAL_DOCUMENT')
      );

      // Step 5: Prepare points for QDrant
      const points = chunks.map((chunk, index) => {
        const metadata: DocumentChunkMetadata = {
          document_id: documentId,
          version,
          title,
          chapter: chunk.metadata.chapter,
          section: chunk.metadata.section,
          heading_level: chunk.metadata.heading_level,
          heading_text: chunk.metadata.heading_text,
          chunk_index: index,
          total_chunks: chunks.length,
          content_type: chunk.metadata.content_type,
          char_count: chunk.metadata.char_count,
          created_at: new Date().toISOString(),
        };

        return {
          id: nanoid(),
          vector: embeddings[index],
          payload: {
            ...metadata,
            content: chunk.content,
          },
        };
      });

      // Step 6: Upsert points to QDrant
      await memoryMonitor.trackOperation('DocumentIndexer', 'qdrantUpsert', async () => {
        const client = getQdrantClient();
        await client.upsert(COLLECTIONS.DOCUMENTS, {
          points,
          wait: true,
        });
      });

      console.log(`✅ Successfully indexed ${chunks.length} chunks for document ${documentId}`);

      return {
        success: true,
        chunksIndexed: chunks.length,
      };
    } catch (error) {
      console.error(`❌ Error indexing document ${documentId}:`, error);
      return {
        success: false,
        chunksIndexed: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
}

/**
 * Multi-source search across user's knowledge base with priority weighting
 * @param query Search query
 * @param userId User ID to filter by
 * @param currentDocumentId Current document ID (gets highest priority)
 * @param options Search options
 */
export async function searchUserContext(
  query: string,
  userId: string,
  currentDocumentId?: string,
  options: {
    includeDocuments?: boolean;
    includeUploads?: boolean;
    limit?: number;
    scoreThreshold?: number;
  } = {}
): Promise<Array<{
  content: string;
  score: number;
  weightedScore: number;
  source: 'current_doc' | 'user_doc' | 'upload';
  metadata: any;
}>> {
  const {
    includeDocuments = true,
    includeUploads = true,
    limit = 15,
    scoreThreshold = 0.6,
  } = options;

  try {
    const client = getQdrantClient();
    const { generateEmbedding } = await import('./embedding.js');
    
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query, 'RETRIEVAL_QUERY');

    const allResults: Array<{
      content: string;
      score: number;
      weightedScore: number;
      source: 'current_doc' | 'user_doc' | 'upload';
      metadata: any;
    }> = [];

    // First, get user's document IDs from database
    const { getDatabase } = await import('../db/index.js');
    const db = getDatabase();
    const userDocs = db.prepare('SELECT id FROM documents WHERE owner_id = ?').all(userId) as { id: string }[];
    const userDocIds = userDocs.map(d => d.id);

    // Search 1: Current document (priority 1.0)
    if (currentDocumentId && userDocIds.includes(currentDocumentId) && includeDocuments) {
      const currentDocResults = await client.search(COLLECTIONS.DOCUMENTS, {
        vector: queryEmbedding,
        filter: {
          must: [
            { key: 'document_id', match: { value: currentDocumentId } }
          ]
        },
        limit: Math.ceil(limit * 0.6), // 60% of results from current doc
        score_threshold: scoreThreshold,
      });

      allResults.push(...currentDocResults.map(result => ({
        content: (result.payload as any).content,
        score: result.score,
        weightedScore: result.score * 1.0, // Full weight
        source: 'current_doc' as const,
        metadata: result.payload,
      })));
    }

    // Search 2: Other user documents (priority 0.5)
    if (includeDocuments && userDocIds.length > 0) {
      const otherDocIds = currentDocumentId 
        ? userDocIds.filter(id => id !== currentDocumentId)
        : userDocIds;

      if (otherDocIds.length > 0) {
        const otherDocsResults = await client.search(COLLECTIONS.DOCUMENTS, {
          vector: queryEmbedding,
          filter: {
            should: otherDocIds.map(docId => ({
              key: 'document_id',
              match: { value: docId }
            }))
          },
          limit: Math.ceil(limit * 0.3), // 30% from other docs
          score_threshold: scoreThreshold * 0.8, // Lower threshold
        });

        allResults.push(...otherDocsResults.map(result => ({
          content: (result.payload as any).content,
          score: result.score,
          weightedScore: result.score * 0.5, // Reduced weight
          source: 'user_doc' as const,
          metadata: result.payload,
        })));
      }
    }

    // Search 3: Uploaded files (priority 0.4)
    if (includeUploads) {
      try {
        const uploadResults = await client.search(COLLECTIONS.UPLOADED_FILES, {
          vector: queryEmbedding,
          filter: {
            must: [
              { key: 'user_id', match: { value: userId } }
            ]
          },
          limit: Math.ceil(limit * 0.2), // 20% from uploads
          score_threshold: scoreThreshold * 0.7,
        });

        allResults.push(...uploadResults.map(result => ({
          content: (result.payload as any).content,
          score: result.score,
          weightedScore: result.score * 0.4, // Lower weight
          source: 'upload' as const,
          metadata: result.payload,
        })));
      } catch (error) {
        // Collection might not have user_id indexed yet, skip silently
        console.log('⚠️ Could not search uploaded files (may need reindexing)');
      }
    }

    // Sort by weighted score and limit
    allResults.sort((a, b) => b.weightedScore - a.weightedScore);
    const topResults = allResults.slice(0, limit);

    console.log(`🔍 Multi-source search results: ${topResults.length} chunks`);
    console.log(`  - Current doc: ${topResults.filter(r => r.source === 'current_doc').length}`);
    console.log(`  - Other docs: ${topResults.filter(r => r.source === 'user_doc').length}`);
    console.log(`  - Uploads: ${topResults.filter(r => r.source === 'upload').length}`);

    return topResults;
  } catch (error) {
    console.error('❌ Error in multi-source search:', error);
    return [];
  }
}

/**
 * Search for relevant chunks in a document
 * @param documentId Optional document ID to filter by
 * @param query Search query
 * @param limit Maximum number of results
 * @param filter Additional filters
 */
export async function searchDocumentChunks(
  query: string,
  options: {
    documentId?: string;
    limit?: number;
    scoreThreshold?: number;
    chapter?: string;
    section?: string;
    contentType?: 'text' | 'code' | 'table' | 'list' | 'quote';
  } = {}
): Promise<Array<{
  id: string;
  score: number;
  content: string;
  metadata: DocumentChunkMetadata;
}>> {
  const {
    documentId,
    limit = 10,
    scoreThreshold = 0.7,
    chapter,
    section,
    contentType,
  } = options;

  try {
    // Generate query embedding
    const { generateEmbedding } = await import('./embedding.js');
    const queryVector = await generateEmbedding(query, 'RETRIEVAL_QUERY');

    // Build filter
    const filter: any = {
      must: [],
    };

    if (documentId) {
      filter.must.push({
        key: 'document_id',
        match: { value: documentId },
      });
    }

    if (chapter) {
      filter.must.push({
        key: 'chapter',
        match: { value: chapter },
      });
    }

    if (section) {
      filter.must.push({
        key: 'section',
        match: { value: section },
      });
    }

    if (contentType) {
      filter.must.push({
        key: 'content_type',
        match: { value: contentType },
      });
    }

    // Search in QDrant
    const client = getQdrantClient();
    const searchResults = await client.search(COLLECTIONS.DOCUMENTS, {
      vector: queryVector,
      limit,
      filter: filter.must.length > 0 ? filter : undefined,
      score_threshold: scoreThreshold,
      with_payload: true,
    });

    // Format results
    return searchResults.map(result => ({
      id: result.id as string,
      score: result.score,
      content: result.payload?.content as string,
      metadata: {
        document_id: result.payload?.document_id as string,
        version: result.payload?.version as number,
        title: result.payload?.title as string,
        chapter: result.payload?.chapter as string | undefined,
        section: result.payload?.section as string | undefined,
        heading_level: result.payload?.heading_level as number,
        heading_text: result.payload?.heading_text as string,
        chunk_index: result.payload?.chunk_index as number,
        total_chunks: result.payload?.total_chunks as number,
        content_type: result.payload?.content_type as 'text' | 'code' | 'table' | 'list' | 'quote',
        char_count: result.payload?.char_count as number,
        created_at: result.payload?.created_at as string,
      },
    }));
  } catch (error) {
    console.error('Error searching document chunks:', error);
    throw error;
  }
}

/**
 * Check for duplicate content in document
 * @param documentId Document ID
 * @param content Content to check
 * @param threshold Similarity threshold (default: 0.85)
 */
export async function checkDuplicateContent(
  documentId: string,
  content: string,
  threshold: number = 0.85
): Promise<{
  isDuplicate: boolean;
  similar: Array<{
    content: string;
    heading: string;
    similarity: number;
  }>;
}> {
  try {
    const results = await searchDocumentChunks(content, {
      documentId,
      limit: 5,
      scoreThreshold: threshold,
    });

    return {
      isDuplicate: results.length > 0,
      similar: results.map(r => ({
        content: r.content,
        heading: r.metadata.heading_text,
        similarity: r.score,
      })),
    };
  } catch (error) {
    console.error('Error checking duplicate content:', error);
    return { isDuplicate: false, similar: [] };
  }
}

/**
 * Get document structure overview from vectors
 * @param documentId Document ID
 */
export async function getDocumentStructure(documentId: string): Promise<{
  chapters: Array<{
    name: string;
    sections: Array<{
      name: string;
      chunkCount: number;
    }>;
  }>;
  totalChunks: number;
}> {
  try {
    const client = getQdrantClient();
    
    // Get all points for this document
    const results = await client.scroll(COLLECTIONS.DOCUMENTS, {
      filter: {
        must: [
          {
            key: 'document_id',
            match: { value: documentId },
          },
        ],
      },
      limit: 1000,
      with_payload: true,
    });

    const chunks = results.points;
    const structure: { [chapter: string]: { [section: string]: number } } = {};

    chunks.forEach((point: any) => {
      const chapter = point.payload?.chapter || 'No Chapter';
      const section = point.payload?.section || 'No Section';

      if (!structure[chapter]) {
        structure[chapter] = {};
      }
      if (!structure[chapter][section]) {
        structure[chapter][section] = 0;
      }
      structure[chapter][section]++;
    });

    const chapters = Object.entries(structure).map(([chapterName, sections]) => ({
      name: chapterName,
      sections: Object.entries(sections).map(([sectionName, count]) => ({
        name: sectionName,
        chunkCount: count,
      })),
    }));

    return {
      chapters,
      totalChunks: chunks.length,
    };
  } catch (error) {
    console.error('Error getting document structure:', error);
    throw error;
  }
}
