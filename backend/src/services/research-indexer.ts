/**
 * Research Source Indexer
 * Handles indexing of external research sources into vector store
 */

import { getQdrantClient, COLLECTIONS, type ResearchSourceMetadata } from './qdrant-client.js';
import { generateEmbeddingBatch } from './embedding.js';
import { chunkMarkdown } from './markdown-chunking.js';
import { nanoid } from 'nanoid';

/**
 * Index a research source into QDrant
 * @param documentId Associated document ID
 * @param source Research source data
 */
export async function indexResearchSource(
  documentId: string,
  source: {
    url?: string;
    title: string;
    content: string;
    sourceType: 'web' | 'api' | 'database';
    relevance: 'background_research' | 'direct_reference' | 'citation';
  }
): Promise<{ success: boolean; chunksIndexed: number; sourceId: string }> {
  try {
    const sourceId = nanoid();
    console.log(`📚 Indexing research source: ${source.title}`);

    // Chunk the content
    const chunks = chunkMarkdown(source.content, 1500); // Smaller chunks for research

    if (chunks.length === 0) {
      return { success: true, chunksIndexed: 0, sourceId };
    }

    // Generate embeddings
    const texts = chunks.map(chunk => chunk.content);
    const embeddings = await generateEmbeddingBatch(texts, 'RETRIEVAL_DOCUMENT');

    // Prepare points
    const client = getQdrantClient();
    const points = chunks.map((chunk, index) => {
      const metadata: ResearchSourceMetadata = {
        document_id: documentId,
        source_id: sourceId,
        source_type: source.sourceType,
        url: source.url,
        title: source.title,
        chunk_index: index,
        total_chunks: chunks.length,
        relevance: source.relevance,
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

    // Upsert to QDrant
    await client.upsert(COLLECTIONS.RESEARCH_SOURCES, {
      points,
      wait: true,
    });

    console.log(`✅ Indexed research source: ${chunks.length} chunks`);

    return {
      success: true,
      chunksIndexed: chunks.length,
      sourceId,
    };
  } catch (error) {
    console.error('Error indexing research source:', error);
    throw error;
  }
}

/**
 * Search research sources
 */
export async function searchResearchSources(
  query: string,
  options: {
    documentId?: string;
    sourceType?: 'web' | 'api' | 'database';
    relevance?: 'background_research' | 'direct_reference' | 'citation';
    limit?: number;
  } = {}
): Promise<Array<{
  content: string;
  title: string;
  url?: string;
  score: number;
}>> {
  const { documentId, sourceType, relevance, limit = 5 } = options;

  try {
    const { generateEmbedding } = await import('./embedding.js');
    const queryVector = await generateEmbedding(query, 'RETRIEVAL_QUERY');

    const filter: any = { must: [] };

    if (documentId) {
      filter.must.push({
        key: 'document_id',
        match: { value: documentId },
      });
    }

    if (sourceType) {
      filter.must.push({
        key: 'source_type',
        match: { value: sourceType },
      });
    }

    if (relevance) {
      filter.must.push({
        key: 'relevance',
        match: { value: relevance },
      });
    }

    const client = getQdrantClient();
    const results = await client.search(COLLECTIONS.RESEARCH_SOURCES, {
      vector: queryVector,
      limit,
      filter: filter.must.length > 0 ? filter : undefined,
      score_threshold: 0.6,
      with_payload: true,
    });

    return results.map((r: any) => ({
      content: r.payload.content,
      title: r.payload.title,
      url: r.payload.url,
      score: r.score,
    }));
  } catch (error) {
    console.error('Error searching research sources:', error);
    throw error;
  }
}

/**
 * Delete research source from vector store
 */
export async function deleteResearchSource(sourceId: string): Promise<void> {
  try {
    const client = getQdrantClient();
    await client.delete(COLLECTIONS.RESEARCH_SOURCES, {
      filter: {
        must: [
          {
            key: 'source_id',
            match: { value: sourceId },
          },
        ],
      },
    });
    console.log(`✓ Deleted research source ${sourceId}`);
  } catch (error) {
    console.error('Error deleting research source:', error);
    throw error;
  }
}
