/**
 * Vector Context Builder
 * Builds enhanced context for AI using vector search
 */

import { searchDocumentChunks, searchUserContext } from './document-indexer.js';
import { config } from '../config/index.js';

export interface VectorContext {
  chunks: Array<{
    content: string;
    heading: string;
    chapter?: string;
    section?: string;
    relevance: number;
    source?: 'current_doc' | 'user_doc' | 'upload';
  }>;
  summary: string;
  totalChunks: number;
}

/**
 * Build enhanced multi-source context for AI queries
 * Includes current document, user's other documents, and uploads
 * @param userId User ID
 * @param query User's question or prompt
 * @param currentDocumentId Optional current document ID
 * @param maxChunks Maximum number of chunks to include
 */
export async function buildEnhancedVectorContext(
  userId: string,
  query: string,
  currentDocumentId?: string,
  maxChunks: number = 10
): Promise<VectorContext | null> {
  if (!config.features.enableVectorStore) {
    return null;
  }

  try {
    const results = await searchUserContext(query, userId, currentDocumentId, {
      includeDocuments: true,
      includeUploads: true,
      limit: maxChunks,
      scoreThreshold: 0.6,
    });

    if (results.length === 0) {
      return null;
    }

    const chunks = results.map(r => ({
      content: r.content,
      heading: r.metadata.heading_text || r.metadata.filename || 'Unbekannt',
      chapter: r.metadata.chapter,
      section: r.metadata.section,
      relevance: r.score,
      source: r.source,
    }));

    // Build summary with source attribution
    const sources = {
      current_doc: chunks.filter(c => c.source === 'current_doc').length,
      user_doc: chunks.filter(c => c.source === 'user_doc').length,
      upload: chunks.filter(c => c.source === 'upload').length,
    };

    const sourceParts = [];
    if (sources.current_doc > 0) sourceParts.push(`${sources.current_doc} aus aktuellem Dokument`);
    if (sources.user_doc > 0) sourceParts.push(`${sources.user_doc} aus anderen Dokumenten`);
    if (sources.upload > 0) sourceParts.push(`${sources.upload} aus Uploads`);

    const summary = `Relevante Abschnitte gefunden: ${sourceParts.join(', ')}`;

    return {
      chunks,
      summary,
      totalChunks: results.length,
    };
  } catch (error) {
    console.error('Error building enhanced vector context:', error);
    return null;
  }
}

/**
 * Build context from document vectors for AI queries
 * @param documentId Document ID to search in
 * @param query User's question or prompt
 * @param maxChunks Maximum number of chunks to include
 */
export async function buildVectorContext(
  documentId: string,
  query: string,
  maxChunks: number = 5
): Promise<VectorContext | null> {
  if (!config.features.enableVectorStore) {
    return null;
  }

  try {
    const results = await searchDocumentChunks(query, {
      documentId,
      limit: maxChunks,
      scoreThreshold: 0.6,
    });

    if (results.length === 0) {
      return null;
    }

    const chunks = results.map(r => ({
      content: r.content,
      heading: r.metadata.heading_text,
      chapter: r.metadata.chapter,
      section: r.metadata.section,
      relevance: r.score,
    }));

    // Build summary
    const locations = chunks
      .map(c => {
        const parts = [];
        if (c.chapter) parts.push(`Kapitel "${c.chapter}"`);
        if (c.section) parts.push(`Abschnitt "${c.section}"`);
        parts.push(`"${c.heading}"`);
        return parts.join(' > ');
      })
      .filter((v, i, a) => a.indexOf(v) === i) // Unique
      .slice(0, 3);

    const summary = `Relevante Abschnitte gefunden: ${locations.join(', ')}`;

    return {
      chunks,
      summary,
      totalChunks: results.length,
    };
  } catch (error) {
    console.error('Error building vector context:', error);
    return null;
  }
}

/**
 * Format vector context for AI prompt with source attribution
 */
export function formatEnhancedVectorContextForPrompt(context: VectorContext): string {
  const sections = context.chunks.map((chunk, index) => {
    const location = [];
    if (chunk.chapter) location.push(`Kapitel: ${chunk.chapter}`);
    if (chunk.section) location.push(`Abschnitt: ${chunk.section}`);
    location.push(`Heading: ${chunk.heading}`);
    
    const sourceLabel = chunk.source === 'current_doc' ? 'Aktuelles Dokument' :
                        chunk.source === 'user_doc' ? 'Anderes Dokument' :
                        chunk.source === 'upload' ? 'Hochgeladene Datei' : 'Quelle';
    
    return `
### ${sourceLabel} - Abschnitt ${index + 1} (Relevanz: ${(chunk.relevance * 100).toFixed(0)}%)
**Position:** ${location.join(' > ')}

${chunk.content}
`;
  }).join('\n---\n');

  return `
## Relevanter Kontext aus Ihrer Wissensdatenbank

${context.summary}

${sections}

---
*Hinweis: Die obigen Abschnitte wurden basierend auf Ihrer Anfrage aus Ihren Dokumenten und Uploads ausgewählt.*
`;
}

/**
 * Format vector context for AI prompt
 */
export function formatVectorContextForPrompt(context: VectorContext): string {
  const sections = context.chunks.map((chunk, index) => {
    const location = [];
    if (chunk.chapter) location.push(`Kapitel: ${chunk.chapter}`);
    if (chunk.section) location.push(`Abschnitt: ${chunk.section}`);
    location.push(`Heading: ${chunk.heading}`);
    
    return `
### Relevanter Abschnitt ${index + 1} (Relevanz: ${(chunk.relevance * 100).toFixed(0)}%)
**Position:** ${location.join(' > ')}

${chunk.content}
`;
  }).join('\n---\n');

  return `
## Relevanter Dokument-Kontext

${context.summary}

${sections}

**Hinweis:** Nutze diese Abschnitte als Kontext für deine Antwort. Beziehe dich auf spezifische Kapitel und Abschnitte, wenn relevant.
`;
}

/**
 * Build context for content generation (to avoid duplicates)
 */
export async function buildDuplicateCheckContext(
  documentId: string,
  proposedContent: string
): Promise<{
  hasSimilar: boolean;
  warnings: string[];
} | null> {
  if (!config.features.enableVectorStore) {
    return null;
  }

  try {
    const results = await searchDocumentChunks(proposedContent, {
      documentId,
      limit: 3,
      scoreThreshold: 0.85, // High threshold for duplicates
    });

    if (results.length === 0) {
      return {
        hasSimilar: false,
        warnings: [],
      };
    }

    const warnings = results.map(r => 
      `Ähnlicher Content gefunden in "${r.metadata.heading_text}" ` +
      `(${(r.score * 100).toFixed(0)}% Ähnlichkeit)`
    );

    return {
      hasSimilar: true,
      warnings,
    };
  } catch (error) {
    console.error('Error checking duplicates:', error);
    return null;
  }
}
