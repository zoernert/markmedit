import { config } from '../config/index.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Detect language from document content using simple pattern matching
 */
export function detectLanguage(text: string): string {
  const sample = text.toLowerCase().substring(0, 2000);
  
  const patterns: Record<string, string[]> = {
    de: ['und', 'der', 'die', 'das', 'ist', 'in', 'den', 'von', 'zu', 'mit', 'auf', 'für', 'eine', 'als', 'wird', 'des', 'dem', 'im', 'sich', 'nicht', 'auch', 'werden', 'oder', 'ein', 'wird', 'sind'],
    en: ['the', 'and', 'is', 'in', 'to', 'of', 'a', 'that', 'it', 'for', 'as', 'with', 'was', 'on', 'are', 'be', 'this', 'by', 'at', 'from', 'or', 'an', 'which', 'you', 'have'],
    fr: ['le', 'la', 'de', 'et', 'un', 'une', 'est', 'dans', 'les', 'des', 'pour', 'que', 'qui', 'sur', 'par', 'avec', 'au', 'du', 'ce', 'sont', 'plus', 'pas', 'comme', 'à', 'ou'],
    es: ['el', 'la', 'de', 'y', 'en', 'un', 'una', 'es', 'los', 'las', 'del', 'que', 'para', 'con', 'por', 'su', 'al', 'como', 'se', 'más', 'no', 'o', 'pero', 'este', 'esta'],
  };

  const scores: Record<string, number> = {};
  
  // Count word matches for each language
  for (const [lang, words] of Object.entries(patterns)) {
    scores[lang] = 0;
    for (const word of words) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = sample.match(regex);
      if (matches) {
        scores[lang] += matches.length;
      }
    }
  }

  // Find language with highest score
  let detectedLang = 'de'; // Default to German
  let maxScore = scores.de || 0;
  
  for (const [lang, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedLang = lang;
    }
  }

  console.log(`[document-helpers] Language detected: ${detectedLang} (scores: ${JSON.stringify(scores)})`);
  
  return detectedLang;
}

/**
 * Extract the first markdown heading (# Title) from content
 */
export function extractMarkdownTitle(content: string): string | null {
  // Match first H1 heading: # Title
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // Fallback: Match first H2 heading: ## Title
  const h2Match = content.match(/^##\s+(.+)$/m);
  if (h2Match) {
    return h2Match[1].trim();
  }

  return null;
}

/**
 * Generate a title using LLM based on document content
 */
export async function generateTitleWithLLM(content: string): Promise<string> {
  if (!config.gemini.apiKey) {
    throw new Error('Gemini API key is not configured');
  }

  const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  const model = genAI.getGenerativeModel({ 
    model: config.gemini.model,
    generationConfig: {
      temperature: 1.0, // Gemini 3 default - optimized for reasoning
      maxOutputTokens: 50,
    }
  });

  const prompt = `Analysiere folgenden Dokumentinhalt und generiere einen prägnanten, aussagekräftigen deutschen Titel (maximal 8 Wörter).

WICHTIG: Antworte NUR mit dem Titel selbst, ohne Anführungszeichen oder zusätzlichen Text.

Dokumentinhalt:
${content.substring(0, 1000)}${content.length > 1000 ? '...' : ''}`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  let title = response.text().trim();

  // Remove quotes if present
  title = title.replace(/^["']|["']$/g, '');

  // Limit to 200 characters
  if (title.length > 200) {
    title = title.substring(0, 197) + '...';
  }

  return title || 'Unbenanntes Dokument';
}

/**
 * Get or generate a title for document content
 */
export async function getDocumentTitle(content: string, providedTitle?: string): Promise<string> {
  // 1. If title is explicitly provided, use it
  if (providedTitle && providedTitle.trim()) {
    return providedTitle.trim();
  }

  // 2. Try to extract from markdown
  const extractedTitle = extractMarkdownTitle(content);
  if (extractedTitle) {
    return extractedTitle;
  }

  // 3. Generate with LLM if content is available
  if (content.trim().length > 0) {
    try {
      return await generateTitleWithLLM(content);
    } catch (error) {
      console.error('Failed to generate title with LLM:', error);
      // Fallback: Use first 50 chars of content
      const firstLine = content.split('\n')[0].trim();
      if (firstLine) {
        return firstLine.substring(0, 50) + (firstLine.length > 50 ? '...' : '');
      }
    }
  }

  // 4. Final fallback
  return 'Unbenanntes Dokument';
}

/**
 * Generate a change summary using LLM by comparing old and new content
 * Automatically detects document language and generates summary in that language
 */
export async function generateChangeSummary(oldContent: string, newContent: string): Promise<string> {
  if (!config.gemini.apiKey) {
    return 'Dokument aktualisiert';
  }

  // If content is too similar, return simple message
  if (oldContent === newContent) {
    return 'Keine Änderungen';
  }

  try {
    // Detect language from new content
    const detectedLang = detectLanguage(newContent);
    
    // Language-specific prompts and fallbacks
    const languageConfig: Record<string, { prompt: string, fallback: string, noChanges: string }> = {
      de: {
        prompt: 'Vergleiche die beiden Versionen eines Dokuments und beschreibe die Änderungen in einem kurzen deutschen Satz (maximal 15 Wörter).\n\nWICHTIG: Antworte NUR mit der Beschreibung, ohne zusätzlichen Text.',
        fallback: 'Dokument aktualisiert',
        noChanges: 'Keine Änderungen',
      },
      en: {
        prompt: 'Compare both versions of a document and describe the changes in a short English sentence (maximum 15 words).\n\nIMPORTANT: Answer ONLY with the description, without additional text.',
        fallback: 'Document updated',
        noChanges: 'No changes',
      },
      fr: {
        prompt: 'Compare les deux versions d\'un document et décris les modifications dans une courte phrase française (maximum 15 mots).\n\nIMPORTANT: Réponds UNIQUEMENT avec la description, sans texte supplémentaire.',
        fallback: 'Document mis à jour',
        noChanges: 'Aucun changement',
      },
      es: {
        prompt: 'Compara ambas versiones de un documento y describe los cambios en una frase corta en español (máximo 15 palabras).\n\nIMPORTANTE: Responde SOLO con la descripción, sin texto adicional.',
        fallback: 'Documento actualizado',
        noChanges: 'Sin cambios',
      },
    };

    const langConfig = languageConfig[detectedLang] || languageConfig.de;

    const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    const model = genAI.getGenerativeModel({ 
      model: config.gemini.model,
      generationConfig: {
        temperature: 1.0, // Gemini 3 default - optimized for reasoning
        maxOutputTokens: 512, // Increased from 100 to allow proper summary generation
      }
    });

    const prompt = `${langConfig.prompt}

Alte Version (erste 500 Zeichen):
${oldContent.substring(0, 500)}

Neue Version (erste 500 Zeichen):
${newContent.substring(0, 500)}`;

    console.log(`[document-helpers] Generating change summary for language: ${detectedLang}`);
    
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Gemini API timeout')), 30000)
    );
    
    const result = await Promise.race([
      model.generateContent(prompt),
      timeoutPromise
    ]);
    
    const response = result.response;
    
    // Check for safety blocks or other issues
    if (response.promptFeedback?.blockReason) {
      console.error(`[document-helpers] Content blocked: ${response.promptFeedback.blockReason}`);
      return langConfig.fallback;
    }
    
    let summary = response.text().trim();
    
    // Log if empty
    if (!summary) {
      console.warn(`[document-helpers] Empty response from Gemini. Candidates:`, JSON.stringify(response.candidates?.map(c => ({
        finishReason: c.finishReason,
        safetyRatings: c.safetyRatings,
        hasContent: !!c.content?.parts?.[0]?.text
      }))));
    }

    // Limit to 200 characters
    if (summary.length > 200) {
      summary = summary.substring(0, 197) + '...';
    }

    console.log(`[document-helpers] Generated summary: "${summary}"`);
    return summary || langConfig.fallback;
  } catch (error) {
    console.error('[document-helpers] Failed to generate change summary:', error);
    
    // Return language-specific fallback
    const detectedLang = detectLanguage(newContent);
    const fallbacks: Record<string, string> = {
      de: 'Dokument aktualisiert',
      en: 'Document updated',
      fr: 'Document mis à jour',
      es: 'Documento actualizado',
    };
    
    return fallbacks[detectedLang] || fallbacks.de;
  }
}
