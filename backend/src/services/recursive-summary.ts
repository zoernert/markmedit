/**
 * Recursive Summarization Service
 * Creates multi-level summaries for large documents
 */

import { getQdrantClient, COLLECTIONS, type SummaryMetadata } from './qdrant-client.js';
import { generateEmbeddingBatch } from './embedding.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';
import { nanoid } from 'nanoid';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

/**
 * Generate summary for a batch of text chunks
 */
async function generateSummary(texts: string[], level: number): Promise<string> {
  const model = genAI.getGenerativeModel({ model: config.gemini.model });

  const combinedText = texts.join('\n\n---\n\n');
  
  const prompt = level === 1
    ? `Erstelle eine prägnante Zusammenfassung dieser Textabschnitte. 
       Behalte die wichtigsten Informationen und Kernaussagen bei.
       Maximal 500 Wörter.
       
       ${combinedText}`
    : `Erstelle eine Übersicht über diese Zusammenfassungen.
       Extrahiere die Hauptthemen und Kernpunkte.
       Maximal 300 Wörter.
       
       ${combinedText}`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

/**
 * Create recursive summaries for a document
 * @param documentId Document ID
 * @param chunks Original document chunks
 * @param batchSize Number of chunks to summarize together (default: 8)
 */
export async function createRecursiveSummaries(
  documentId: string,
  chunks: Array<{
    id: string;
    content: string;
  }>,
  batchSize: number = 8
): Promise<{ success: boolean; totalSummaries: number }> {
  try {
    console.log(`📝 Creating recursive summaries for document ${documentId}...`);

    if (chunks.length === 0) {
      return { success: true, totalSummaries: 0 };
    }

    const client = getQdrantClient();
    let currentLevel = 1;
    let currentChunks = chunks;
    let totalSummaries = 0;

    while (currentChunks.length > 1) {
      console.log(`📊 Level ${currentLevel}: Processing ${currentChunks.length} chunks`);

      const summaryChunks: Array<{ id: string; content: string; parentIds: string[] }> = [];

      // Process in batches
      for (let i = 0; i < currentChunks.length; i += batchSize) {
        const batch = currentChunks.slice(i, i + batchSize);
        const texts = batch.map(c => c.content);
        const parentIds = batch.map(c => c.id);

        const summary = await generateSummary(texts, currentLevel);

        summaryChunks.push({
          id: nanoid(),
          content: summary,
          parentIds,
        });

        console.log(`  ✓ Created summary ${summaryChunks.length}/${Math.ceil(currentChunks.length / batchSize)}`);
      }

      // Generate embeddings for summaries
      const summaryTexts = summaryChunks.map(s => s.content);
      const embeddings = await generateEmbeddingBatch(summaryTexts, 'RETRIEVAL_DOCUMENT');

      // Store summaries in QDrant
      const points = summaryChunks.map((chunk, index) => {
        const metadata: SummaryMetadata = {
          document_id: documentId,
          summary_level: currentLevel,
          parent_chunk_ids: chunk.parentIds,
          created_at: new Date().toISOString(),
        };

        return {
          id: chunk.id,
          vector: embeddings[index],
          payload: {
            ...metadata,
            content: chunk.content,
          },
        };
      });

      await client.upsert(COLLECTIONS.SUMMARIES, {
        points,
        wait: true,
      });

      totalSummaries += summaryChunks.length;
      console.log(`✅ Level ${currentLevel}: Created ${summaryChunks.length} summaries`);

      // Move to next level
      currentLevel++;
      currentChunks = summaryChunks;
    }

    console.log(`✅ Recursive summarization complete: ${totalSummaries} summaries across ${currentLevel - 1} levels`);

    return {
      success: true,
      totalSummaries,
    };
  } catch (error) {
    console.error('Error creating recursive summaries:', error);
    throw error;
  }
}

/**
 * Get document overview using top-level summary
 */
export async function getDocumentOverview(documentId: string): Promise<{
  overview: string;
  levels: number;
} | null> {
  try {
    const client = getQdrantClient();

    // Find highest level summary
    const results = await client.scroll(COLLECTIONS.SUMMARIES, {
      filter: {
        must: [
          {
            key: 'document_id',
            match: { value: documentId },
          },
        ],
      },
      limit: 100,
      with_payload: true,
    });

    if (results.points.length === 0) {
      return null;
    }

    // Find max level
    let maxLevel = 0;
    let topLevelSummary = '';

    for (const point of results.points) {
      const level = (point.payload as any).summary_level || 0;
      if (level > maxLevel) {
        maxLevel = level;
        topLevelSummary = (point.payload as any).content || '';
      }
    }

    return {
      overview: topLevelSummary,
      levels: maxLevel,
    };
  } catch (error) {
    console.error('Error getting document overview:', error);
    return null;
  }
}

/**
 * Search summaries for high-level understanding
 */
export async function searchSummaries(
  query: string,
  documentId: string,
  level?: number
): Promise<Array<{
  content: string;
  level: number;
  score: number;
}>> {
  try {
    const { generateEmbedding } = await import('./embedding.js');
    const queryVector = await generateEmbedding(query, 'RETRIEVAL_QUERY');

    const filter: any = {
      must: [
        {
          key: 'document_id',
          match: { value: documentId },
        },
      ],
    };

    if (level !== undefined) {
      filter.must.push({
        key: 'summary_level',
        match: { value: level },
      });
    }

    const client = getQdrantClient();
    const results = await client.search(COLLECTIONS.SUMMARIES, {
      vector: queryVector,
      limit: 5,
      filter,
      score_threshold: 0.6,
      with_payload: true,
    });

    return results.map((r: any) => ({
      content: r.payload.content,
      level: r.payload.summary_level,
      score: r.score,
    }));
  } catch (error) {
    console.error('Error searching summaries:', error);
    throw error;
  }
}
