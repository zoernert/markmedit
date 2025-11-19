import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

interface DocumentSummary {
  summary: string;
  mainTopics: string[];
  sections: SectionInfo[];
  totalChars: number;
  summaryGeneratedAt: number;
}

interface SectionInfo {
  title: string;
  startOffset: number;
  endOffset: number;
  characterCount: number;
  topics: string[];
}

/**
 * Generate a comprehensive summary of a large document
 * This summary can be used to quickly understand the document structure
 * and identify relevant sections without loading the entire content
 */
export async function generateDocumentSummary(
  content: string,
  title: string,
  language: string = 'de'
): Promise<DocumentSummary> {
  const model = genAI.getGenerativeModel({
    model: config.gemini.model,
    generationConfig: {
      temperature: 1.0, // Gemini 3 default - optimized for reasoning
      maxOutputTokens: 4096,
    },
  });

  const languageMap: Record<string, string> = {
    de: 'Deutsch',
    en: 'English',
    fr: 'Français',
    es: 'Español',
  };
  const languageName = languageMap[language] || 'Deutsch';

  const prompt = `Du bist ein Experte für Dokumentenanalyse und -strukturierung.

Analysiere das folgende Dokument und erstelle eine strukturierte Zusammenfassung:

=== DOKUMENT ===
Titel: ${title}
Länge: ${content.length} Zeichen

${content}

---

AUFGABE:
Erstelle eine umfassende strukturierte Analyse des Dokuments auf ${languageName}.

Gib deine Antwort als JSON zurück:

{
  "summary": "Kurze Zusammenfassung des gesamten Dokuments (3-5 Sätze auf ${languageName})",
  "mainTopics": ["Thema 1", "Thema 2", ...],
  "sections": [
    {
      "title": "Abschnittstitel",
      "startOffset": 0,
      "endOffset": 1000,
      "topics": ["Unterthema 1", "Unterthema 2"]
    }
  ]
}

WICHTIG:
- Antworte NUR mit validem JSON, keine zusätzlichen Erklärungen
- Identifiziere alle Hauptabschnitte des Dokuments
- startOffset und endOffset sind ungefähre Zeichenpositionen im Original
- topics beschreibt die Themen in diesem Abschnitt
- Alles auf ${languageName}`;

  try {
    const result = await model.generateContent(prompt);
    let responseText = result.response.text().trim();

    // Clean up JSON response
    responseText = responseText
      .replace(/^```json\n?/i, '')
      .replace(/^```\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();

    const parsed = JSON.parse(responseText);

    return {
      ...parsed,
      totalChars: content.length,
      summaryGeneratedAt: Date.now(),
    };
  } catch (error) {
    console.error('[document-summary] Error generating summary:', error);
    // Return a basic fallback summary
    return {
      summary: `Dokument "${title}" mit ${content.length} Zeichen`,
      mainTopics: ['Inhalt nicht analysierbar'],
      sections: [{
        title: 'Gesamtes Dokument',
        startOffset: 0,
        endOffset: content.length,
        characterCount: content.length,
        topics: [],
      }],
      totalChars: content.length,
      summaryGeneratedAt: Date.now(),
    };
  }
}

/**
 * Find relevant sections based on a reference document
 * Uses the summary to identify which parts of the main document are relevant
 */
export async function findRelevantSections(
  documentSummary: DocumentSummary,
  _documentContent: string, // Full content available if needed
  referenceContent: string,
  referenceFilename: string,
  language: string = 'de'
): Promise<{ relevantSections: number[]; reasoning: string }> {
  const model = genAI.getGenerativeModel({
    model: config.gemini.model,
    generationConfig: {
      temperature: 1.0, // Gemini 3 default - optimized for reasoning
      maxOutputTokens: 2048,
    },
  });

  const languageMap: Record<string, string> = {
    de: 'Deutsch',
    en: 'English',
    fr: 'Français',
    es: 'Español',
  };
  const languageName = languageMap[language] || 'Deutsch';

  const prompt = `Du bist ein Experte für Dokumentenanalyse.

=== HAUPTDOKUMENT (Struktur) ===
Zusammenfassung: ${documentSummary.summary}
Hauptthemen: ${documentSummary.mainTopics.join(', ')}

Abschnitte:
${documentSummary.sections.map((s, i) => `${i}. "${s.title}" (${s.characterCount || (s.endOffset - s.startOffset)} Zeichen) - Themen: ${s.topics.join(', ')}`).join('\n')}

=== REFERENZDOKUMENT ===
Dateiname: ${referenceFilename}
Länge: ${referenceContent.length} Zeichen

${referenceContent.substring(0, 5000)}${referenceContent.length > 5000 ? '\n\n[... gekürzt ...]' : ''}

---

AUFGABE:
Identifiziere welche Abschnitte des Hauptdokuments basierend auf dem Referenzdokument überarbeitet werden sollten.

Gib deine Antwort als JSON zurück (auf ${languageName}):

{
  "relevantSections": [0, 2, 5],
  "reasoning": "Kurze Erklärung warum diese Abschnitte relevant sind"
}

WICHTIG:
- Antworte NUR mit validem JSON
- relevantSections enthält die Indizes der relevanten Abschnitte
- Wähle NUR Abschnitte aus, die wirklich vom Referenzdokument betroffen sind
- Antworte auf ${languageName}`;

  try {
    const result = await model.generateContent(prompt);
    let responseText = result.response.text().trim();

    responseText = responseText
      .replace(/^```json\n?/i, '')
      .replace(/^```\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();

    return JSON.parse(responseText);
  } catch (error) {
    console.error('[document-summary] Error finding relevant sections:', error);
    // Fallback: return all sections
    return {
      relevantSections: documentSummary.sections.map((_, i) => i),
      reasoning: 'Fehler bei der Analyse - alle Abschnitte werden berücksichtigt',
    };
  }
}

/**
 * Extract specific sections from document content based on summary
 */
export function extractSections(
  content: string,
  summary: DocumentSummary,
  sectionIndices: number[]
): string {
  const sections = sectionIndices.map(idx => {
    const section = summary.sections[idx];
    if (!section) return '';
    
    const start = Math.max(0, section.startOffset);
    const end = Math.min(content.length, section.endOffset);
    
    return `\n=== ${section.title} ===\n\n${content.substring(start, end)}`;
  });

  return sections.join('\n\n');
}

/**
 * Smart chunking: Split document into logical sections
 * This is better than arbitrary character-based chunking
 */
export function smartChunk(content: string, maxChunkSize: number = 80000): string[] {
  // Try to split on section boundaries (markdown headers, double newlines, etc.)
  const sectionPatterns = [
    /\n#{1,6}\s+.+\n/g,  // Markdown headers
    /\n\n/g,              // Paragraph breaks
  ];

  let bestChunks: string[] = [];
  let bestScore = Infinity;

  for (const pattern of sectionPatterns) {
    const splits = content.split(pattern);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const split of splits) {
      if (currentChunk.length + split.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = split;
      } else {
        currentChunk += split;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    // Score: prefer fewer chunks with more balanced sizes
    const score = chunks.length + (Math.max(...chunks.map(c => c.length)) - Math.min(...chunks.map(c => c.length))) / 1000;

    if (score < bestScore && chunks.every(c => c.length <= maxChunkSize)) {
      bestScore = score;
      bestChunks = chunks;
    }
  }

  // Fallback: simple character-based chunking
  if (bestChunks.length === 0) {
    bestChunks = [];
    for (let i = 0; i < content.length; i += maxChunkSize) {
      bestChunks.push(content.substring(i, i + maxChunkSize));
    }
  }

  return bestChunks;
}
