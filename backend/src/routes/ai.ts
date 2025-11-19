import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';
import { getDatabase } from '../db/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import multer from 'multer';
import { getTavilyService } from '../services/tavily.js';
import { getMCPManager } from '../services/mcp-manager.js';
import { optionalAuthMiddleware, type AuthRequest } from '../middleware/auth.js';
import { buildEnhancedVectorContext, formatEnhancedVectorContextForPrompt } from '../services/vector-context.js';
import {
  generateDocumentSummary,
  findRelevantSections,
  extractSections,
} from '../services/document-summary.js';

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Allow common document formats
    const allowedMimes = [
      'text/plain',
      'text/markdown',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc
    ];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(txt|md|markdown)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Allowed: TXT, MD, PDF, DOC, DOCX'));
    }
  },
});

export const aiRoutes = Router();

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

// Simple language detection based on common words
function detectLanguage(text: string): string {
  // Use first 2000 characters for detection (faster, still accurate)
  const sample = text.toLowerCase().substring(0, 2000);
  
  // Common words by language
  const patterns = {
    de: ['und', 'der', 'die', 'das', 'ist', 'in', 'den', 'von', 'zu', 'mit', 'auf', 'für', 'eine', 'ein', 'sich', 'nicht', 'werden', 'auch', 'oder', 'als', 'nach', 'bei', 'über', 'durch', 'aus', 'dieser'],
    en: ['the', 'and', 'is', 'in', 'to', 'of', 'a', 'that', 'it', 'with', 'for', 'as', 'on', 'was', 'are', 'be', 'this', 'from', 'by', 'at', 'or', 'an', 'which', 'have', 'has', 'had'],
    fr: ['le', 'la', 'de', 'et', 'un', 'une', 'est', 'dans', 'les', 'pour', 'qui', 'que', 'par', 'avec', 'sur', 'ce', 'il', 'sont', 'pas', 'être', 'du', 'au', 'cette', 'nous', 'vous'],
    es: ['el', 'la', 'de', 'y', 'en', 'un', 'una', 'es', 'por', 'que', 'para', 'con', 'los', 'las', 'del', 'se', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya'],
  };
  
  const scores: Record<string, number> = {};
  
  // Count matches for each language
  for (const [lang, words] of Object.entries(patterns)) {
    scores[lang] = 0;
    for (const word of words) {
      // Use word boundaries to avoid partial matches
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
  
  console.log(`[language-detection] Detected: ${detectedLang} (scores: ${JSON.stringify(scores)})`);
  return detectedLang;
}

// Get language-specific prompt instructions
function getLanguagePrompt(langCode: string): { 
  languageInstruction: string;
  languageName: string;
} {
  const languages: Record<string, { languageInstruction: string; languageName: string }> = {
    de: {
      languageInstruction: 'WICHTIG: Antworte AUSSCHLIESSLICH auf DEUTSCH! Alle Analysen, Vorschläge und Erklärungen müssen in deutscher Sprache verfasst sein.',
      languageName: 'DEUTSCH',
    },
    en: {
      languageInstruction: 'IMPORTANT: Answer EXCLUSIVELY in ENGLISH! All analyses, suggestions, and explanations must be written in English.',
      languageName: 'ENGLISH',
    },
    fr: {
      languageInstruction: 'IMPORTANT: Répondez EXCLUSIVEMENT en FRANÇAIS! Toutes les analyses, suggestions et explications doivent être rédigées en français.',
      languageName: 'FRANÇAIS',
    },
    es: {
      languageInstruction: 'IMPORTANTE: ¡Responde EXCLUSIVAMENTE en ESPAÑOL! Todos los análisis, sugerencias y explicaciones deben estar escritos en español.',
      languageName: 'ESPAÑOL',
    },
  };
  
  return languages[langCode] || languages.de; // Default to German
}

const generateOutlineSchema = z.object({
  topic: z.string().min(1),
  context: z.string().optional(),
  depth: z.number().min(1).max(5).default(3),
});

const expandSectionSchema = z.object({
  documentId: z.string(),
  section: z.string(),
  instruction: z.string().optional(),
});

const improveTextSchema = z.object({
  text: z.string().min(1),
  instruction: z.string().optional(),
});

const chatSchema = z.object({
  documentId: z.string().optional(),
  message: z.string().min(1),
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    parts: z.array(z.object({ text: z.string() })),
  })).optional(),
});

// Generate outline
aiRoutes.post('/generate-outline', async (req, res) => {
  const data = generateOutlineSchema.parse(req.body);
  
  const model = genAI.getGenerativeModel({ model: config.gemini.model });
  
  const prompt = `Erstelle eine strukturierte Gliederung für ein Dokument zum Thema: "${data.topic}"

${data.context ? `Zusätzlicher Kontext: ${data.context}` : ''}

Tiefe: ${data.depth} Ebenen

Erstelle eine detaillierte Markdown-Gliederung mit Haupt- und Unterkapiteln. 
Nutze ## für Hauptkapitel, ### für Unterkapitel, etc.
Füge kurze Beschreibungen (1-2 Sätze) zu jedem Abschnitt hinzu.`;

  const result = await model.generateContent(prompt);
  const outline = result.response.text();
  
  res.json({ outline });
});

// Expand section
aiRoutes.post('/expand-section', async (req, res) => {
  const data = expandSectionSchema.parse(req.body);
  const db = getDatabase();
  
  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(data.documentId) as any;
  if (!document) {
    throw new AppError(404, 'Document not found');
  }
  
  const model = genAI.getGenerativeModel({ model: config.gemini.model });
  
  const prompt = `Du bist ein Experte für technisches Schreiben. 

Dokument-Kontext:
Titel: ${document.title}
Aktueller Inhalt:
${document.content}

---

Aufgabe: Erweitere den folgenden Abschnitt mit detaillierten Informationen:
"${data.section}"

${data.instruction ? `Spezielle Anweisungen: ${data.instruction}` : ''}

Schreibe in professionellem Stil, nutze Markdown-Formatierung.
Füge Beispiele und konkrete Details hinzu wo sinnvoll.`;

  const result = await model.generateContent(prompt);
  const expansion = result.response.text();
  
  res.json({ expansion });
});

// Improve text
aiRoutes.post('/improve-text', async (req, res) => {
  const data = improveTextSchema.parse(req.body);
  
  const model = genAI.getGenerativeModel({ model: config.gemini.model });
  
  const prompt = `Verbessere den folgenden Text:

${data.text}

${data.instruction ? `Fokus: ${data.instruction}` : 'Fokus: Klarheit, Präzision, professioneller Stil'}

Behalte die Markdown-Formatierung bei.
Gib nur den verbesserten Text zurück, ohne zusätzliche Erklärungen.`;

  const result = await model.generateContent(prompt);
  const improved = result.response.text();
  
  res.json({ improved });
});

// Summarize
aiRoutes.post('/summarize', async (req, res) => {
  const { documentId, length } = z.object({
    documentId: z.string(),
    length: z.enum(['short', 'medium', 'long']).default('medium'),
  }).parse(req.body);
  
  const db = getDatabase();
  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as any;
  
  if (!document) {
    throw new AppError(404, 'Document not found');
  }
  
  const model = genAI.getGenerativeModel({ model: config.gemini.model });
  
  const lengthInstructions = {
    short: '3-5 Sätze',
    medium: '1-2 Absätze',
    long: '3-4 Absätze mit Details',
  };
  
  const prompt = `Fasse das folgende Dokument zusammen:

Titel: ${document.title}

${document.content}

Länge: ${lengthInstructions[length]}

Nutze Markdown-Formatierung. Hebe die wichtigsten Punkte hervor.`;

  const result = await model.generateContent(prompt);
  const summary = result.response.text();
  
  res.json({ summary });
});

// Generate Mermaid Diagram
aiRoutes.post('/generate-mermaid', async (req, res) => {
  const { documentId, instruction, diagramType } = z.object({
    documentId: z.string(),
    instruction: z.string().min(1),
    diagramType: z.enum(['flowchart', 'sequence', 'class', 'state', 'er', 'gantt', 'pie', 'mindmap', 'bar', 'auto']).default('auto'),
  }).parse(req.body);
  
  const db = getDatabase();
  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as any;
  
  if (!document) {
    throw new AppError(404, 'Document not found');
  }
  
  const model = genAI.getGenerativeModel({ model: config.gemini.model });
  
  const diagramTypeInstructions = {
    flowchart: 'Erstelle ein Flowchart (flowchart TD oder flowchart LR)',
    sequence: 'Erstelle ein Sequenzdiagramm (sequenceDiagram)',
    class: 'Erstelle ein Klassendiagramm (classDiagram)',
    state: 'Erstelle ein Zustandsdiagramm (stateDiagram-v2)',
    er: 'Erstelle ein Entity-Relationship-Diagramm (erDiagram)',
    gantt: 'Erstelle ein Gantt-Diagramm (gantt)',
    pie: 'Erstelle ein Kreisdiagramm (pie)',
    mindmap: 'Erstelle eine Mindmap (mindmap)',
    bar: 'Erstelle ein Balkendiagramm mit xychart-beta (nutze die VEREINFACHTE Syntax ohne verschachtelte Objekte)',
    auto: 'Wähle den passendsten Mermaid-Diagrammtyp basierend auf dem Inhalt',
  };
  
  const prompt = `Du bist ein Experte für Mermaid-Diagramme (Version 11.x). 

Dokument-Kontext:
Titel: ${document.title}
Inhalt:
${document.content}

---

Aufgabe: ${instruction}

${diagramTypeInstructions[diagramType]}

KRITISCH - Mermaid 11.x xychart-beta Syntax (VEREINFACHT):

FALSCH (alte Syntax mit verschachtelten Objekten):
xychart-beta
    title "Titel"
    x-axis "Label" {
        type category
        categories [A, B, C]
    }
    bar "Serie" {
        data [1, 2, 3]
    }

RICHTIG (Mermaid 11.x Syntax - FLACH, KEINE geschweiften Klammern):
xychart-beta
    title "Titel"
    x-axis [A, B, C]
    y-axis "Label" 0 --> 100
    bar [1, 2, 3]

WICHTIGE Regeln:
1. Gib NUR den Mermaid-Code zurück, KEINE Markdown-Code-Blöcke
2. Beginne direkt mit dem Diagrammtyp
3. Nutze deutsche Labels
4. Für xychart-beta: KEINE geschweiften Klammern {}, KEINE "type:", KEINE "categories:", KEINE "data:"
5. x-axis nimmt direkt ein Array: x-axis [Wert1, Wert2, Wert3]
6. y-axis optional mit Range: y-axis "Label" min --> max
7. bar nimmt direkt ein Array: bar [Wert1, Wert2, Wert3]

Erstelle jetzt das Diagramm basierend auf dem Dokumentinhalt:
5. Nutze Mermaid-Syntax korrekt (keine Erfindungen)

Beispiel-Format für Flowchart:
flowchart TD
    A[Start] --> B{Entscheidung}
    B -->|Ja| C[Aktion 1]
    B -->|Nein| D[Aktion 2]

Erstelle jetzt das Diagramm basierend auf dem Dokumentinhalt:`;

  const result = await model.generateContent(prompt);
  let mermaidCode = result.response.text().trim();
  
  // Clean up common issues
  mermaidCode = mermaidCode
    .replace(/^```mermaid\n?/i, '')
    .replace(/^```\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();
  
  res.json({ mermaidCode });
});

// Chat
aiRoutes.post('/chat', optionalAuthMiddleware, async (req: AuthRequest, res) => {
  const data = chatSchema.parse(req.body);
  
  const model = genAI.getGenerativeModel({ model: config.gemini.model });
  
  let systemContext = '';
  
  // Try to use enhanced vector search if user is logged in
  if (req.user?.id && data.message) {
    try {
      const vectorContext = await buildEnhancedVectorContext(
        req.user.id,
        data.message,
        data.documentId,
        10 // max chunks
      );
      
      if (vectorContext && vectorContext.chunks.length > 0) {
        systemContext = formatEnhancedVectorContextForPrompt(vectorContext);
        console.log(`✨ Using enhanced vector context: ${vectorContext.chunks.length} chunks from knowledge base`);
      }
    } catch (error) {
      console.log('⚠️ Could not use enhanced vector search, falling back to full document:', error);
    }
  }
  
  // Fallback: Include full document if no vector context or if explicitly requested
  if (!systemContext && data.documentId) {
    const db = getDatabase();
    const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(data.documentId) as any;
    
    if (document) {
      systemContext = `Aktuelles Dokument:
Titel: ${document.title}

${document.content}

---
`;
    }
  }
  
  const chat = model.startChat({
    history: data.history || [],
  });
  
  const result = await chat.sendMessage(systemContext + data.message);
  const response = result.response.text();
  
  res.json({ 
    response,
    history: await chat.getHistory(),
  });
});

// Multi-Document Chat with File Upload
aiRoutes.post('/chat-with-document', upload.single('file'), optionalAuthMiddleware, async (req: AuthRequest, res) => {
  try {
    const { documentId, message, history } = z.object({
      documentId: z.string().optional(),
      message: z.string().min(1),
      history: z.string().optional(), // JSON string
    }).parse(req.body);

    if (!req.file) {
      throw new AppError(400, 'No file uploaded');
    }

    // Extract text from uploaded file
    let uploadedContent = '';
    const fileBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;
    const filename = req.file.originalname;

    if (mimeType === 'text/plain' || filename.match(/\.(txt|md|markdown)$/i)) {
      uploadedContent = fileBuffer.toString('utf-8');
    } else if (mimeType === 'application/pdf') {
      // For PDF, we'll use Gemini's native file handling
      uploadedContent = `[PDF-Datei: ${filename}]\nHinweis: PDF-Inhalt wird direkt von Gemini verarbeitet.`;
    } else {
      throw new AppError(400, 'Unsupported file format for text extraction');
    }

    const model = genAI.getGenerativeModel({ model: config.gemini.model });

    // Build context with enhanced vector search + uploaded document
    let systemContext = 'Du bist ein intelligenter Dokumenten-Assistent. Analysiere die folgenden Dokumente und beantworte die Frage des Nutzers.\n\n';

    // Try to use enhanced vector search if user is logged in
    if (req.user?.id && message) {
      try {
        const vectorContext = await buildEnhancedVectorContext(
          req.user.id,
          message,
          documentId,
          8 // Slightly fewer chunks since we have uploaded doc too
        );
        
        if (vectorContext && vectorContext.chunks.length > 0) {
          systemContext += formatEnhancedVectorContextForPrompt(vectorContext);
          console.log(`✨ Using enhanced vector context with upload: ${vectorContext.chunks.length} chunks`);
        }
      } catch (error) {
        console.log('⚠️ Could not use enhanced vector search, falling back to full document:', error);
      }
    }

    // Fallback: Add current document if no vector context
    if (!systemContext.includes('Wissensdatenbank') && documentId) {
      const db = getDatabase();
      const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as any;
      
      if (document) {
        systemContext += `=== HAUPTDOKUMENT (aktuell geöffnet) ===
Titel: ${document.title}

${document.content}

`;
      }
    }

    // Add uploaded document
    systemContext += `\n\n=== HOCHGELADENES DOKUMENT ===
Dateiname: ${filename}

${uploadedContent}

---

`;

    const parsedHistory = history ? JSON.parse(history) : [];
    
    const chat = model.startChat({
      history: parsedHistory,
    });

    const result = await chat.sendMessage(systemContext + message);
    const response = result.response.text();

    res.json({
      response,
      history: await chat.getHistory(),
      uploadedFileName: filename,
    });
  } catch (error: any) {
    if (error instanceof multer.MulterError) {
      throw new AppError(400, `Upload error: ${error.message}`);
    }
    throw error;
  }
});

// Generate document suggestions based on uploaded document
aiRoutes.post('/suggest-changes', upload.single('file'), async (req, res) => {
  try {
    const { documentId, instruction } = z.object({
      documentId: z.string(),
      instruction: z.string().optional(),
    }).parse(req.body);

    if (!req.file) {
      throw new AppError(400, 'No file uploaded');
    }

    const db = getDatabase();
    const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as any;
    
    if (!document) {
      throw new AppError(404, 'Document not found');
    }

    // Extract text from uploaded file
    let uploadedContent = '';
    const fileBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;
    const filename = req.file.originalname;

    if (mimeType === 'text/plain' || filename.match(/\.(txt|md|markdown)$/i)) {
      uploadedContent = fileBuffer.toString('utf-8');
    } else if (mimeType === 'application/pdf') {
      uploadedContent = `[PDF-Datei: ${filename}]\nHinweis: PDF-Inhalt wird direkt von Gemini verarbeitet.`;
    } else {
      throw new AppError(400, 'Unsupported file format');
    }

    // Check document sizes and implement smart handling for large documents
    const maxDocLength = 100000; // 100k characters - Gemini 2.0 Flash can handle much more
    const documentLength = document.content.length;
    const uploadedLength = uploadedContent.length;
    
    // If uploaded document is too large, reject
    if (uploadedLength > maxDocLength) {
      throw new AppError(400, `Referenzdokument zu groß (${uploadedLength} Zeichen). Maximum: ${maxDocLength} Zeichen. Bitte teile das Dokument in kleinere Abschnitte.`);
    }
    
    // For main document: Use smart summary-based strategy if too large
    const useSummaryStrategy = documentLength > maxDocLength;
    
    // Detect language from document content
    const detectedLang = detectLanguage(document.content + '\n\n' + uploadedContent);
    const { languageInstruction, languageName } = getLanguagePrompt(detectedLang);
    
    if (useSummaryStrategy) {
      // Smart summary-based strategy for very large documents
      console.log(`[suggest-changes] Large document detected (${documentLength} chars), using summary-based strategy`);
      
      // Step 1: Generate document summary if not cached
      console.log('[suggest-changes] Step 1: Generating document summary...');
      const summary = await generateDocumentSummary(
        document.content,
        document.title,
        detectedLang
      );
      console.log(`[suggest-changes] Summary generated: ${summary.sections.length} sections identified`);
      
      // Step 2: Find relevant sections based on reference document
      console.log('[suggest-changes] Step 2: Identifying relevant sections...');
      const { relevantSections, reasoning } = await findRelevantSections(
        summary,
        document.content,
        uploadedContent,
        filename,
        detectedLang
      );
      console.log(`[suggest-changes] Found ${relevantSections.length} relevant sections: ${relevantSections.join(', ')}`);
      console.log(`[suggest-changes] Reasoning: ${reasoning}`);
      
      // Step 3: Extract only relevant sections for analysis
      const relevantContent = extractSections(document.content, summary, relevantSections);
      console.log(`[suggest-changes] Extracted content: ${relevantContent.length} chars (from ${documentLength} total)`);
      
      // Step 4: Analyze relevant sections with full context
      console.log('[suggest-changes] Step 3: Analyzing relevant sections...');
      const model = genAI.getGenerativeModel({ 
        model: config.gemini.model,
        generationConfig: {
          temperature: 1.0, // Gemini 3 default - optimized for reasoning
          maxOutputTokens: 8192,
        },
      });

      const analysisPrompt = `Du bist ein Experte für Dokumentenanalyse und -bearbeitung.

${languageInstruction}

=== KONTEXT ===
Das Hauptdokument ist sehr groß (${documentLength} Zeichen). Ich habe bereits eine Voranalyse durchgeführt und ${relevantSections.length} relevante Abschnitte identifiziert.

Grund für die Auswahl: ${reasoning}

=== HAUPTDOKUMENT (relevante Abschnitte) ===
Titel: ${document.title}
Gesamtlänge: ${documentLength} Zeichen
Analysierte Abschnitte: ${relevantSections.map(i => summary.sections[i]?.title).filter(Boolean).join(', ')}

${relevantContent}

=== REFERENZDOKUMENT (neue Informationen) ===
Dateiname: ${filename}
Länge: ${uploadedLength} Zeichen

${uploadedContent}

---

AUFGABE:
Analysiere die ausgewählten Abschnitte des Hauptdokuments und erstelle konkrete Änderungsvorschläge basierend auf dem Referenzdokument.

${instruction ? `ZUSÄTZLICHE ANWEISUNG: ${instruction}` : ''}

Gib deine Antwort als JSON zurück:

{
  "analysis": "Zusammenfassung deiner Analyse auf ${languageName} (2-3 Sätze)",
  "suggestions": [
    {
      "section": "Name oder Überschrift des betroffenen Abschnitts",
      "location": "Abschnitt im Dokument (z.B. aus den identifizierten Abschnitten)",
      "action": "insert_after|replace|insert_before|new_section",
      "reason": "Warum diese Änderung vorgeschlagen wird",
      "priority": "high|medium|low",
      "preview": "Kurze Vorschau der Änderung (1-2 Sätze)"
    }
  ]
}

WICHTIG:
- Antworte AUSSCHLIESSLICH auf ${languageName}
- Gib NUR valides JSON zurück, keine zusätzlichen Erklärungen
- Konzentriere dich auf die ausgewählten Abschnitte
- Wenn keine Änderungen nötig sind, gib ein leeres suggestions-Array zurück`;

      const timeoutMs = 120000;
      const generateWithTimeout = async () => {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Gemini API Timeout nach 120 Sekunden')), timeoutMs);
        });
        const apiPromise = model.generateContent(analysisPrompt);
        return Promise.race([apiPromise, timeoutPromise]);
      };

      let result;
      try {
        result = await generateWithTimeout() as any;
      } catch (error: any) {
        if (error.message?.includes('Timeout')) {
          throw new AppError(504, 'Die Analyse dauert zu lange (>120s). Bitte versuche es erneut.');
        }
        if (error.message?.includes('fetch failed')) {
          throw new AppError(503, 'Verbindung zur KI-API fehlgeschlagen. Bitte versuche es später erneut.');
        }
        throw error;
      }

      let responseText = result.response.text().trim();
      responseText = responseText
        .replace(/^```json\n?/i, '')
        .replace(/^```\n?/i, '')
        .replace(/\n?```$/i, '')
        .trim();

      let suggestionsData;
      try {
        suggestionsData = JSON.parse(responseText);
      } catch (parseError) {
        suggestionsData = {
          analysis: 'Fehler beim Parsen der AI-Antwort',
          suggestions: [],
          rawResponse: responseText,
        };
      }

      console.log(`[suggest-changes] Analysis complete: ${suggestionsData.suggestions?.length || 0} suggestions`);

      res.json({
        ...suggestionsData,
        uploadedFileName: filename,
        documentTitle: document.title,
        smartStrategy: true,
        analyzedSections: relevantSections.map(i => summary.sections[i]?.title).filter(Boolean),
        reasoning,
      });
      return;
    }

    // Standard analysis for documents within size limit
    const model = genAI.getGenerativeModel({ 
      model: config.gemini.model,
      generationConfig: {
        temperature: 1.0, // Gemini 3 default - optimized for reasoning
        maxOutputTokens: 8192,
      },
    });

    const prompt = `Du bist ein Experte für Dokumentenanalyse und -bearbeitung.

${languageInstruction}

=== HAUPTDOKUMENT (soll überarbeitet werden) ===
Titel: ${document.title}
Länge: ${documentLength} Zeichen

${document.content}

=== REFERENZDOKUMENT (neue Informationen) ===
Dateiname: ${filename}
Länge: ${uploadedLength} Zeichen

${uploadedContent}

---

AUFGABE:
Analysiere beide Dokumente und identifiziere, welche Abschnitte des Hauptdokuments basierend auf den Informationen aus dem Referenzdokument überarbeitet werden sollten.

${instruction ? `ZUSÄTZLICHE ANWEISUNG: ${instruction}` : ''}

Gib deine Antwort als JSON-Array mit strukturierten Änderungsvorschlägen zurück:

{
  "analysis": "Kurze Zusammenfassung deiner Analyse auf ${languageName} (2-3 Sätze)",
  "suggestions": [
    {
      "section": "Name oder Überschrift des betroffenen Abschnitts (auf ${languageName})",
      "location": "Zeilenbereich oder Kapitel (z.B. 'Kapitel 2.3' oder 'Zeilen 45-67')",
      "action": "insert_after|replace|insert_before|new_section",
      "reason": "Warum diese Änderung vorgeschlagen wird (auf ${languageName})",
      "priority": "high|medium|low",
      "preview": "Kurze Vorschau der Änderung auf ${languageName} (1-2 Sätze)"
    }
  ]
}

WICHTIG:
- Antworte AUSSCHLIESSLICH auf ${languageName}
- Gib NUR valides JSON zurück, keine zusätzlichen Erklärungen
- Identifiziere konkrete Abschnitte im Hauptdokument
- Erkläre klar auf ${languageName}, warum jede Änderung sinnvoll ist
- Priorisiere die Vorschläge nach Wichtigkeit
- Wenn keine Änderungen nötig sind, gib ein leeres suggestions-Array zurück`;

    // Add timeout wrapper for Gemini API call
    const timeoutMs = 120000; // 120 seconds
    const generateWithTimeout = async () => {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Gemini API Timeout nach 120 Sekunden')), timeoutMs);
      });
      
      const apiPromise = model.generateContent(prompt);
      
      return Promise.race([apiPromise, timeoutPromise]);
    };

    let result;
    try {
      result = await generateWithTimeout() as any;
    } catch (error: any) {
      if (error.message?.includes('Timeout')) {
        throw new AppError(504, 'Die Analyse dauert zu lange (>120s). Das Dokument ist sehr komplex. Versuche es erneut oder verwende kleinere Abschnitte.');
      }
      if (error.message?.includes('fetch failed')) {
        throw new AppError(503, 'Verbindung zur KI-API fehlgeschlagen. Bitte versuche es später erneut.');
      }
      throw error;
    }

    let responseText = result.response.text().trim();

    // Clean up JSON response
    responseText = responseText
      .replace(/^```json\n?/i, '')
      .replace(/^```\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();

    let suggestionsData;
    try {
      suggestionsData = JSON.parse(responseText);
    } catch (parseError) {
      // If JSON parsing fails, return a structured error
      suggestionsData = {
        analysis: 'Fehler beim Parsen der AI-Antwort',
        suggestions: [],
        rawResponse: responseText,
      };
    }

    res.json({
      ...suggestionsData,
      uploadedFileName: filename,
      documentTitle: document.title,
    });
  } catch (error: any) {
    if (error instanceof multer.MulterError) {
      throw new AppError(400, `Upload error: ${error.message}`);
    }
    throw error;
  }
});

// Apply a specific suggestion to the document
aiRoutes.post('/apply-suggestion', async (req, res) => {
  const { documentId, suggestion, sectionIdentifier } = z.object({
    documentId: z.string(),
    suggestion: z.object({
      section: z.string(),
      location: z.string(),
      action: z.enum(['insert_after', 'replace', 'insert_before', 'new_section']),
      reason: z.string(),
      priority: z.enum(['high', 'medium', 'low']),
    }),
    sectionIdentifier: z.string(), // Actual text to find in document
  }).parse(req.body);

  const db = getDatabase();
  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as any;
  
  if (!document) {
    throw new AppError(404, 'Document not found');
  }

  const model = genAI.getGenerativeModel({ model: config.gemini.model });

  const prompt = `Du bist ein Experte für präzise Dokumentenbearbeitung.

=== DOKUMENT ===
${document.content}

=== ÄNDERUNGSANWEISUNG ===
Abschnitt: ${suggestion.section}
Position: ${suggestion.location}
Aktion: ${suggestion.action}
Begründung: ${suggestion.reason}

Such-Identifikator im Dokument: "${sectionIdentifier}"

---

AUFGABE:
Generiere den EXAKTEN neuen Inhalt für diese Änderung. Gib deine Antwort als JSON zurück:

{
  "newContent": "Der neue oder geänderte Markdown-Inhalt",
  "affectedLines": "Beschreibung welche Zeilen/Abschnitte betroffen sind",
  "preview": "Eine kurze Vorschau wie die Änderung aussieht"
}

WICHTIG:
- Behalte die Markdown-Formatierung bei
- Achte auf konsistenten Stil mit dem Rest des Dokuments
- Gib NUR valides JSON zurück
- Der Inhalt in "newContent" sollte direkt verwendbar sein`;

  const result = await model.generateContent(prompt);
  let responseText = result.response.text().trim();

  // Clean up JSON
  responseText = responseText
    .replace(/^```json\n?/i, '')
    .replace(/^```\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();

  let changeData;
  try {
    changeData = JSON.parse(responseText);
  } catch (parseError) {
    throw new AppError(500, 'Failed to parse AI response');
  }

  res.json(changeData);
});

// Integrate accepted suggestions into document
aiRoutes.post('/integrate-suggestions', async (req, res) => {
  const { documentId, acceptedSuggestions, suggestionsData } = z.object({
    documentId: z.string(),
    acceptedSuggestions: z.array(z.number()),
    suggestionsData: z.object({
      suggestions: z.array(z.any()),
      uploadedFileName: z.string().optional(),
    }),
  }).parse(req.body);

  const db = getDatabase();
  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as any;
  
  if (!document) {
    throw new AppError(404, 'Document not found');
  }

  const model = genAI.getGenerativeModel({ model: config.gemini.model });

  // Build list of accepted suggestions
  const accepted = acceptedSuggestions.map(index => suggestionsData.suggestions[index]);

  const prompt = `Du bist ein Experte für präzise Dokumentenbearbeitung.

=== AKTUELLES DOKUMENT ===
${document.content}

=== AKZEPTIERTE ÄNDERUNGSVORSCHLÄGE ===
${accepted.map((s, i) => `
${i + 1}. Abschnitt: ${s.section}
   Position: ${s.location}
   Aktion: ${s.action}
   Begründung: ${s.reason}
   ${s.preview ? `Vorschau: ${s.preview}` : ''}
`).join('\n')}

---

AUFGABE:
Integriere diese Änderungen in das Dokument und gib das VOLLSTÄNDIG ÜBERARBEITETE Dokument zurück.

WICHTIGE REGELN:
1. Behalte die Markdown-Formatierung bei
2. Achte auf konsistenten Stil
3. Integriere die Änderungen an den richtigen Stellen
4. Für "insert_after": Füge NACH dem genannten Abschnitt ein
5. Für "insert_before": Füge VOR dem genannten Abschnitt ein
6. Für "replace": Ersetze den genannten Abschnitt
7. Für "new_section": Füge einen neuen Abschnitt hinzu
8. Gib NUR das überarbeitete Dokument zurück, KEINE Erklärungen
9. Gib KEIN JSON zurück, sondern direkt den Markdown-Text

Beginne jetzt mit dem überarbeiteten Dokument:`;

  const result = await model.generateContent(prompt);
  const updatedContent = result.response.text().trim();

  // Clean up potential markdown code blocks
  let cleanedContent = updatedContent
    .replace(/^```markdown\n?/i, '')
    .replace(/^```\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();

  // Update the document in database
  const now = Date.now();
  db.prepare('UPDATE documents SET content = ?, updated_at = ? WHERE id = ?')
    .run(cleanedContent, now, documentId);

  res.json({
    success: true,
    updatedContent: cleanedContent,
    appliedChanges: accepted.length,
    message: `${accepted.length} Änderungen erfolgreich ins Dokument integriert`,
  });
});

/**
 * POST /ai/deep-research
 * 
 * Perform deep research using web search and/or MCP queries.
 * Returns structured suggestions for document enrichment.
 */
aiRoutes.post('/deep-research', async (req, res) => {
  const schema = z.object({
    documentId: z.string(),
    query: z.string().optional(),
    selectedText: z.string().optional(),
    sectionContext: z.string().optional(),
    searchScope: z.object({
      web: z.boolean().default(true),
      mcp: z.array(z.string()).default([]),
    }),
    maxSources: z.number().min(1).max(50).default(10),
  });

  const data = schema.parse(req.body);

  // Get document from database
  const db = getDatabase();
  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(data.documentId) as any;

  if (!document) {
    throw new AppError(404, 'Document not found');
  }

  // Determine research query
  const researchQuery = data.query || data.selectedText || 'General research on document topic';

  const sources: any = {
    web: [],
    mcp: [],
  };

  let webSearchResults = '';
  let mcpResults = '';

  // Execute Web Search if enabled
  if (data.searchScope.web) {
    const tavilyService = getTavilyService();
    
    if (tavilyService.isAvailable()) {
      try {
        const searchResponse = await tavilyService.search(researchQuery, {
          maxResults: Math.min(data.maxSources, 10),
          searchDepth: 'basic',
          includeAnswer: true,
        });

        sources.web = searchResponse.results.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.content,
          relevanceScore: r.score,
        }));

        webSearchResults = tavilyService.formatForAI(searchResponse);
      } catch (error: any) {
        console.warn('Web search failed:', error.message);
        // Continue without web results
      }
    } else {
      console.warn('Tavily not available - skipping web search');
    }
  }

  // Execute MCP Queries if servers specified
  if (data.searchScope.mcp.length > 0) {
    const mcpManager = getMCPManager();
    
    for (const serverName of data.searchScope.mcp) {
      try {
        const server = mcpManager.getServer(serverName);
        
        if (!server) {
          console.warn(`MCP server ${serverName} not found`);
          continue;
        }

        // Use semantic search for willi-mako and powabase
        let result;
        
        if (serverName === 'willi-mako') {
          result = await server.callTool(
            'mcp_mcp-willi-mak_willi-mako-semantic-search',
            { query: researchQuery, options: { limit: 5 } }
          );
        } else if (serverName === 'powabase') {
          // For powabase, discover data sources first
          await server.callTool('mcp_powabase_discover_data_sources', {});
          
          // Then provide info about available data
          result = {
            content: [{ type: 'text', text: 'Powabase MaStR data available. Specify exact query for detailed results.' }],
          };
        }

        if (result?.content?.[0]?.text) {
          sources.mcp.push({
            server: serverName,
            summary: result.content[0].text.substring(0, 500) + '...',
          });

          mcpResults += `\n\n## ${serverName} Results\n${result.content[0].text}\n`;
        }
      } catch (error: any) {
        console.warn(`MCP query failed for ${serverName}:`, error.message);
        // Continue with other servers
      }
    }
  }

  // AI Synthesis: Analyze all sources and generate suggestions
  const model = genAI.getGenerativeModel({ model: config.gemini.model });

  const synthesisPrompt = `Du bist ein Experte für wissenschaftliche Recherche und Dokumenten-Anreicherung.

=== AKTUELLES DOKUMENT ===
${document.content}

${data.selectedText ? `\n=== AUSGEWÄHLTER ABSCHNITT ===\n${data.selectedText}\n` : ''}
${data.sectionContext ? `\n=== KONTEXT ===\n${data.sectionContext}\n` : ''}

=== RECHERCHE-ANFRAGE ===
${researchQuery}

=== WEB-RECHERCHE ERGEBNISSE ===
${webSearchResults || 'Keine Web-Ergebnisse verfügbar'}

=== MCP FACHWISSEN ===
${mcpResults || 'Keine MCP-Ergebnisse verfügbar'}

AUFGABE:
Analysiere die Recherche-Ergebnisse und das aktuelle Dokument. Erstelle strukturierte Vorschläge zur Anreicherung des Dokuments mit den neu gefundenen Informationen.

Gib deine Antwort als JSON-Array mit folgendem Format zurück:

[
  {
    "section": "Name des Abschnitts der angereichert werden soll",
    "action": "insert_after" | "replace" | "new_section",
    "content": "Der neue oder erweiterte Inhalt",
    "reason": "Warum diese Änderung sinnvoll ist",
    "priority": "high" | "medium" | "low",
    "sources": ["URL1", "URL2", "MCP:server-name"]
  }
]

WICHTIG:
- Behalte den Markdown-Stil des Dokuments bei
- Integriere nur relevante, faktisch korrekte Informationen
- Gib Quellen an (URLs aus Web-Suche oder "MCP:server-name")
- Priorisiere Vorschläge nach Relevanz
- Maximal 8 Vorschläge

Antworte NUR mit dem JSON-Array, ohne zusätzlichen Text.`;

  const result = await model.generateContent(synthesisPrompt);
  const response = result.response.text();

  // Parse AI response
  let suggestions = [];
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      suggestions = JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('Failed to parse AI suggestions:', error);
    suggestions = [];
  }

  res.json({
    success: true,
    sources,
    suggestions,
    metadata: {
      researchDate: new Date().toISOString(),
      queriesExecuted: (data.searchScope.web ? 1 : 0) + data.searchScope.mcp.length,
      sourcesAnalyzed: sources.web.length + sources.mcp.length,
    },
  });
});

/**
 * POST /ai/research-batch
 * 
 * Perform research based on selected artifacts (notes).
 * Extracts topics from artifacts, then executes deep research.
 */
aiRoutes.post('/research-batch', async (req, res) => {
  const schema = z.object({
    documentId: z.string(),
    artifactIds: z.array(z.string()).min(1),
    researchQuery: z.string().optional(),
    searchScope: z.object({
      web: z.boolean().default(true),
      mcp: z.array(z.string()).default([]),
    }),
  });

  const data = schema.parse(req.body);

  // Get artifacts from database
  const db = getDatabase();
  const artifacts = data.artifactIds
    .map(id => db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id))
    .filter(Boolean) as any[];

  if (artifacts.length === 0) {
    throw new AppError(404, 'No artifacts found');
  }

  // Extract topics from artifacts using AI
  const model = genAI.getGenerativeModel({ model: config.gemini.model });

  const artifactsContent = artifacts.map((a, i) => 
    `### Artefakt ${i + 1}: ${a.name}\n${a.content}`
  ).join('\n\n');

  const topicExtractionPrompt = `Analysiere folgende Notizen/Artefakte und extrahiere 3-5 Hauptthemen oder Forschungsfragen, die daraus hervorgehen.

${artifactsContent}

Gib die Themen als JSON-Array von Strings zurück:
["Thema 1", "Thema 2", "Thema 3"]

Antworte NUR mit dem JSON-Array.`;

  const topicResult = await model.generateContent(topicExtractionPrompt);
  const topicResponse = topicResult.response.text();

  let extractedTopics: string[] = [];
  try {
    const jsonMatch = topicResponse.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      extractedTopics = JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('Failed to parse topics:', error);
    extractedTopics = ['General research based on artifacts'];
  }

  // Combine extracted topics with optional user query
  const finalQuery = data.researchQuery 
    ? `${data.researchQuery}\n\nExtrahierte Themen aus Artefakten: ${extractedTopics.join(', ')}`
    : extractedTopics.join(', ');

  // Execute deep research with the combined query
  // Reuse the deep-research logic (simplified here)
  const sources: any = { web: [], mcp: [] };
  let webSearchResults = '';

  if (data.searchScope.web) {
    const tavilyService = getTavilyService();
    
    if (tavilyService.isAvailable()) {
      try {
        const searchResponse = await tavilyService.search(finalQuery, {
          maxResults: 10,
          searchDepth: 'advanced', // Use advanced for batch research
        });

        sources.web = searchResponse.results.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.content,
          relevanceScore: r.score,
        }));

        webSearchResults = tavilyService.formatForAI(searchResponse);
      } catch (error: any) {
        console.warn('Web search failed:', error.message);
      }
    }
  }

  // Get document for context
  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(data.documentId) as any;

  // Generate suggestions
  const synthesisPrompt = `Du bist ein Experte für wissenschaftliche Recherche.

=== AKTUELLES DOKUMENT ===
${document?.content || 'Kein Dokument-Kontext'}

=== ANALYSIERTE ARTEFAKTE ===
${artifactsContent}

=== EXTRAHIERTE THEMEN ===
${extractedTopics.join('\n- ')}

=== RECHERCHE-ERGEBNISSE ===
${webSearchResults || 'Keine Web-Ergebnisse'}

AUFGABE:
Basierend auf den Artefakten und der Recherche, erstelle Vorschläge zur Anreicherung des Dokuments.

Gib deine Antwort als JSON-Array zurück:
[
  {
    "section": "Abschnitt",
    "action": "insert_after" | "replace" | "new_section",
    "content": "Neuer Inhalt",
    "reason": "Begründung",
    "priority": "high" | "medium" | "low",
    "sources": ["URL oder MCP:server"]
  }
]

Antworte NUR mit dem JSON-Array.`;

  const result = await model.generateContent(synthesisPrompt);
  const response = result.response.text();

  let suggestions = [];
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      suggestions = JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('Failed to parse suggestions:', error);
  }

  res.json({
    success: true,
    artifactsAnalyzed: artifacts.length,
    extractedTopics,
    sources,
    suggestions,
  });
});

/**
 * POST /ai/enrich-section
 * 
 * Enrich a specific section with focused research.
 * Similar to deep-research but optimized for section-level updates.
 */
aiRoutes.post('/enrich-section', async (req, res) => {
  const schema = z.object({
    documentId: z.string(),
    selectedText: z.string().min(1),
    beforeContext: z.string().default(''),
    afterContext: z.string().default(''),
    enrichmentGoal: z.enum(['expand', 'update', 'fact-check', 'add-sources']).default('expand'),
    searchScope: z.object({
      web: z.boolean().default(true),
      mcp: z.array(z.string()).default([]),
    }),
  });

  const data = schema.parse(req.body);

  // Build context-aware query
  const contextQuery = `${data.selectedText}\n\nGoal: ${data.enrichmentGoal}`;

  // Execute web search
  const tavilyService = getTavilyService();
  const sources: any = { web: [] };
  let webResults = '';

  if (data.searchScope.web && tavilyService.isAvailable()) {
    try {
      const searchResponse = await tavilyService.search(contextQuery, {
        maxResults: 5,
        searchDepth: 'basic',
      });

      sources.web = searchResponse.results.map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
        relevanceScore: r.score,
      }));

      webResults = tavilyService.formatForAI(searchResponse);
    } catch (error: any) {
      console.warn('Web search failed:', error.message);
    }
  }

  // Generate focused suggestion
  const model = genAI.getGenerativeModel({ model: config.gemini.model });

  const enrichmentPrompt = `Du bist ein Experte für präzise Text-Anreicherung.

=== KONTEXT VORHER ===
${data.beforeContext}

=== ABSCHNITT ZUM ANREICHERN ===
${data.selectedText}

=== KONTEXT NACHHER ===
${data.afterContext}

=== ANREICHERUNGS-ZIEL ===
${data.enrichmentGoal === 'expand' ? 'Erweitere den Abschnitt mit zusätzlichen Details' :
  data.enrichmentGoal === 'update' ? 'Aktualisiere den Abschnitt mit neuesten Informationen' :
  data.enrichmentGoal === 'fact-check' ? 'Überprüfe Fakten und korrigiere falls nötig' :
  'Füge Quellenangaben hinzu'}

=== RECHERCHE-ERGEBNISSE ===
${webResults || 'Keine zusätzlichen Quellen'}

AUFGABE:
Erstelle EINEN fokussierten Vorschlag zur Verbesserung des markierten Abschnitts.

Gib deine Antwort als JSON-Objekt zurück:
{
  "section": "Name des Abschnitts",
  "action": "replace" | "insert_after",
  "content": "Der verbesserte Inhalt",
  "reason": "Kurze Begründung",
  "priority": "high" | "medium" | "low",
  "sources": ["URLs"]
}

Antworte NUR mit dem JSON-Objekt.`;

  const result = await model.generateContent(enrichmentPrompt);
  const response = result.response.text();

  let suggestion = null;
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      suggestion = JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('Failed to parse suggestion:', error);
  }

  res.json({
    success: true,
    sources,
    suggestions: suggestion ? [suggestion] : [],
  });
});

