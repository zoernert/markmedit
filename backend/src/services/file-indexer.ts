/**
 * File Upload Indexer
 * Handles indexing of uploaded PDF and DOCX files
 */

import { getQdrantClient, COLLECTIONS, type UploadedFileMetadata } from './qdrant-client.js';
import { generateEmbeddingBatch } from './embedding.js';
import { chunkMarkdown } from './markdown-chunking.js';
import { nanoid } from 'nanoid';

/**
 * Extract text from PDF buffer (simplified - would use pdf-parse in production)
 * For now, returns empty string - implementation pending
 */
async function extractTextFromPDF(_buffer: Buffer): Promise<string> {
  // TODO: Implement PDF text extraction using pdf-parse or similar
  console.warn('⚠️ PDF text extraction not yet implemented');
  return '';
}

/**
 * Extract text from DOCX buffer (using existing docx library)
 */
async function extractTextFromDOCX(_buffer: Buffer): Promise<string> {
  try {
    // For now, return empty - full implementation would parse DOCX XML
    console.warn('⚠️ DOCX text extraction not yet implemented');
    return '';
  } catch (error) {
    console.error('Error extracting text from DOCX:', error);
    return '';
  }
}

/**
 * Extract text from file buffer based on file type
 */
async function extractTextFromFile(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  const extension = fileName.toLowerCase().split('.').pop();

  switch (extension) {
    case 'pdf':
      return await extractTextFromPDF(buffer);
    case 'docx':
      return await extractTextFromDOCX(buffer);
    case 'txt':
    case 'md':
    case 'markdown':
      return buffer.toString('utf-8');
    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
}

/**
 * Index an uploaded file into QDrant
 * @param documentId Associated document ID
 * @param file File buffer and metadata
 * @param userId Optional user ID for filtering
 */
export async function indexUploadedFile(
  documentId: string,
  file: {
    buffer: Buffer;
    fileName: string;
    fileType: 'pdf' | 'docx' | 'txt';
  },
  userId?: string
): Promise<{ success: boolean; chunksIndexed: number; fileId: string }> {
  try {
    const fileId = nanoid();
    console.log(`📄 Indexing uploaded file: ${file.fileName} ${userId ? `for user ${userId}` : ''}`);

    // Extract text from file
    const text = await extractTextFromFile(file.buffer, file.fileName);

    if (!text || text.trim().length === 0) {
      console.warn(`⚠️ No text extracted from ${file.fileName}`);
      return { success: true, chunksIndexed: 0, fileId };
    }

    // Chunk the content
    const chunks = chunkMarkdown(text, 1500);

    if (chunks.length === 0) {
      return { success: true, chunksIndexed: 0, fileId };
    }

    // Generate embeddings
    const texts = chunks.map(chunk => chunk.content);
    const embeddings = await generateEmbeddingBatch(texts, 'RETRIEVAL_DOCUMENT');

    // Prepare points
    const client = getQdrantClient();
    const points = chunks.map((chunk, index) => {
      const metadata: UploadedFileMetadata = {
        document_id: documentId,
        file_id: fileId,
        file_name: file.fileName,
        file_type: file.fileType,
        user_id: userId, // Include user_id for filtering
        chunk_index: index,
        total_chunks: chunks.length,
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
    await client.upsert(COLLECTIONS.UPLOADED_FILES, {
      points,
      wait: true,
    });

    console.log(`✅ Indexed uploaded file: ${chunks.length} chunks`);

    return {
      success: true,
      chunksIndexed: chunks.length,
      fileId,
    };
  } catch (error) {
    console.error('Error indexing uploaded file:', error);
    throw error;
  }
}

/**
 * Search uploaded files
 */
export async function searchUploadedFiles(
  query: string,
  options: {
    documentId?: string;
    fileName?: string;
    limit?: number;
  } = {}
): Promise<Array<{
  content: string;
  fileName: string;
  fileType: string;
  score: number;
}>> {
  const { documentId, fileName, limit = 5 } = options;

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

    if (fileName) {
      filter.must.push({
        key: 'file_name',
        match: { value: fileName },
      });
    }

    const client = getQdrantClient();
    const results = await client.search(COLLECTIONS.UPLOADED_FILES, {
      vector: queryVector,
      limit,
      filter: filter.must.length > 0 ? filter : undefined,
      score_threshold: 0.6,
      with_payload: true,
    });

    return results.map((r: any) => ({
      content: r.payload.content,
      fileName: r.payload.file_name,
      fileType: r.payload.file_type,
      score: r.score,
    }));
  } catch (error) {
    console.error('Error searching uploaded files:', error);
    throw error;
  }
}

/**
 * Delete uploaded file from vector store
 */
export async function deleteUploadedFile(fileId: string): Promise<void> {
  try {
    const client = getQdrantClient();
    await client.delete(COLLECTIONS.UPLOADED_FILES, {
      filter: {
        must: [
          {
            key: 'file_id',
            match: { value: fileId },
          },
        ],
      },
    });
    console.log(`✓ Deleted uploaded file ${fileId}`);
  } catch (error) {
    console.error('Error deleting uploaded file:', error);
    throw error;
  }
}
