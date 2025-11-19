import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';

let genAI: GoogleGenerativeAI | null = null;

/**
 * Initialize Gemini AI client for embeddings
 */
function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  }
  return genAI;
}

/**
 * Cache for embeddings to reduce API calls
 */
const embeddingCache = new Map<string, number[]>();
const CACHE_MAX_SIZE = 1000;

/**
 * Generate embedding vector for a text using Gemini text-embedding-004
 * @param text Text to embed
 * @param taskType Optional task type for specialized embeddings
 * @param timeout Timeout in milliseconds (default: 30s)
 * @returns 768-dimensional embedding vector
 */
export async function generateEmbedding(
  text: string,
  taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY' = 'RETRIEVAL_DOCUMENT',
  timeout: number = 30000
): Promise<number[]> {
  // Check cache first
  const cacheKey = `${taskType}:${text.substring(0, 200)}`;
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  if (!config.qdrant.enableEmbedding) {
    console.warn('⚠️ Embedding disabled in config, returning zero vector');
    return new Array(768).fill(0);
  }

  try {
    const ai = getGenAI();
    const model = ai.getGenerativeModel({ model: 'text-embedding-004' });

    // Wrap API call with timeout
    const embeddingPromise = model.embedContent(text);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Embedding timeout after ${timeout}ms`)), timeout);
    });

    const result = await Promise.race([embeddingPromise, timeoutPromise]);

    const embedding = result.embedding.values;

    // Cache the result
    if (embeddingCache.size >= CACHE_MAX_SIZE) {
      // Remove oldest entry (first key)
      const firstKey = embeddingCache.keys().next().value;
      if (firstKey) {
        embeddingCache.delete(firstKey);
      }
    }
    embeddingCache.set(cacheKey, embedding);

    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate embeddings for multiple texts in batch
 * @param texts Array of texts to embed
 * @param taskType Task type for embeddings
 * @returns Array of embedding vectors
 */
export async function generateEmbeddingBatch(
  texts: string[],
  taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY' = 'RETRIEVAL_DOCUMENT'
): Promise<number[][]> {
  const BATCH_SIZE = 100; // Gemini API limit
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    
    // Process batch in parallel
    const batchPromises = batch.map(text => generateEmbedding(text, taskType));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Log progress
    console.log(`📊 Embedded ${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length} texts`);
  }

  return results;
}

/**
 * Calculate cosine similarity between two vectors
 * @param a First vector
 * @param b Second vector
 * @returns Similarity score between -1 and 1
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Clear embedding cache
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
  console.log('✓ Embedding cache cleared');
}

/**
 * Get cache statistics
 */
export function getEmbeddingCacheStats() {
  return {
    size: embeddingCache.size,
    maxSize: CACHE_MAX_SIZE,
  };
}
