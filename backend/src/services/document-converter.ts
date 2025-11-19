import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

export interface PresentationOptions {
  sourceContent: string;
  userPrompt?: string;
  maxSlidesPerSection?: number;
  includeImages?: boolean;
  theme?: 'light' | 'dark' | 'corporate' | 'modern';
}

export interface PresentationSlide {
  type: 'title' | 'agenda' | 'content' | 'image' | 'quote' | 'conclusion';
  title?: string;
  subtitle?: string;
  author?: string;
  content?: string[];
  imagePrompt?: string;
  notes?: string;
  layout?: 'default' | 'two-column' | 'image-right' | 'full-image';
}

export interface PresentationStructure {
  title: string;
  subtitle?: string;
  author?: string;
  slides: PresentationSlide[];
  theme: string;
}

/**
 * Converts markdown document to presentation structure using LLM
 */
export async function convertToPresentation(options: PresentationOptions): Promise<PresentationStructure> {
  const model = genAI.getGenerativeModel({ 
    model: config.gemini.model,
    generationConfig: {
      temperature: 1.0, // Gemini 3 default - optimized for reasoning
      maxOutputTokens: 16384, // Increased for large documents
      responseMimeType: 'application/json', // Force JSON output
    },
  });

  const systemPrompt = `Du bist ein Experte für die Erstellung professioneller Präsentationen aus Textdokumenten.

WICHTIGE REGELN für Präsentationen:
1. Beginne IMMER mit einem Titelslide (type: "title")
2. Zweiter Slide ist IMMER die Agenda (type: "agenda") mit Übersicht über Hauptthemen
3. Content-Slides haben MAXIMAL 7 Bulletpoints (besser 3-5)
4. Nutze verschiedene Slide-Typen für Abwechslung: content, image, quote
5. Beende mit einem Conclusion-Slide (type: "conclusion")
6. Jeder Slide sollte EINE klare Botschaft haben
7. Verwende klare, prägnante Sprache (keine langen Sätze)
8. Füge Speaker Notes hinzu für zusätzliche Informationen
9. Schlage visuelle Elemente vor (imagePrompt für Icons, Diagramme, Fotos)
10. WICHTIG: Bei sehr umfangreichen Dokumenten FOKUSSIERE auf die Kernbotschaften und erstelle MAXIMAL 15-20 Slides

SLIDE TYPES:
- "title": Haupttitel der Präsentation (title, subtitle, author)
- "agenda": Inhaltsübersicht (title, content als Liste der Hauptthemen)
- "content": Standard-Slide mit Bulletpoints (title, content max 7 items)
- "image": Visuell fokussierter Slide (title, imagePrompt, kurzer content)
- "quote": Zitat-Slide (content als Zitat, notes für Quelle)
- "conclusion": Abschluss-Slide (title, content mit Key Takeaways)

LAYOUTS:
- "default": Standard Titel + Content
- "two-column": Zweispaltig für Vergleiche
- "image-right": Bild rechts, Text links
- "full-image": Vollbild mit überlagerndem Text

Antworte NUR mit validem JSON im folgenden Format:
{
  "title": "Haupttitel",
  "subtitle": "Untertitel",
  "author": "Autor (falls erkennbar)",
  "theme": "${options.theme || 'modern'}",
  "slides": [
    {
      "type": "title",
      "title": "...",
      "subtitle": "...",
      "author": "..."
    },
    {
      "type": "agenda",
      "title": "Agenda",
      "content": ["Thema 1", "Thema 2", "Thema 3"]
    },
    {
      "type": "content",
      "title": "Slide Titel",
      "content": ["Punkt 1", "Punkt 2", "Punkt 3"],
      "notes": "Speaker notes",
      "layout": "default"
    }
  ]
}`;

  const userInstruction = options.userPrompt 
    ? `ZUSÄTZLICHE ANFORDERUNGEN: ${options.userPrompt}\n\n`
    : '';

  // For very large documents, use more aggressive truncation and add summary instruction
  const isVeryLarge = options.sourceContent.length > 20000;
  const maxContentLength = isVeryLarge ? 5000 : 10000;
  
  const contentPreview = options.sourceContent.length > maxContentLength
    ? options.sourceContent.substring(0, maxContentLength) + '\n\n[... Dokument ist sehr umfangreich - fokussiere auf die wichtigsten Kernaussagen ...]'
    : options.sourceContent;

  const prompt = `${userInstruction}Erstelle eine professionelle Präsentation aus folgendem Dokument:

---
${contentPreview}
---

${isVeryLarge ? 'HINWEIS: Dies ist ein sehr umfangreiches Dokument. Extrahiere NUR die KERNBOTSCHAFTEN und erstelle eine KOMPAKTE Präsentation.\n\n' : ''}Erstelle eine strukturierte Präsentation mit:
- 1 Titelslide
- 1 Agenda-Slide
- ${isVeryLarge ? '8-12' : options.maxSlidesPerSection || 3 + '-5'} Content-Slides insgesamt (fokussiere auf Hauptthemen)
- 1 Conclusion-Slide

WICHTIG: Fokussiere auf die KERNBOTSCHAFTEN. ${isVeryLarge ? 'Erstelle MAXIMAL 12-15 Slides.' : 'Bei umfangreichen Dokumenten REDUZIERE auf das Wesentliche.'}
${options.includeImages ? 'Schlage visuelle Elemente vor (imagePrompt für passende Icons, Diagramme oder Konzept-Fotos).' : 'Fokussiere auf Text-basierte Slides.'}

Antworte NUR mit dem vollständigen JSON-Objekt, ohne zusätzliche Erklärungen.`;

  console.log('[Converter] Starting LLM request for presentation generation...');
  console.log('[Converter] Content length:', options.sourceContent.length, 'characters');
  console.log('[Converter] Preview length:', contentPreview.length, 'characters');

  try {
    const result = await model.generateContent(systemPrompt + '\n\n' + prompt);
    const response = result.response.text();
    
    console.log('[Converter] LLM response received, length:', response.length);
    
    // Extract JSON from response (remove markdown code blocks if present)
    let jsonText = response.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    try {
      const presentation: PresentationStructure = JSON.parse(jsonText);
      
      // Validate presentation structure
      if (!presentation.title || !presentation.slides || !Array.isArray(presentation.slides)) {
        throw new Error('Invalid presentation structure: missing title or slides array');
      }
      
      if (presentation.slides.length === 0) {
        throw new Error('Invalid presentation structure: slides array is empty');
      }
      
      return presentation;
    } catch (parseError: any) {
      console.error('[Converter] Failed to parse LLM response as JSON:', parseError.message);
      console.error('[Converter] Response preview (first 1000 chars):', jsonText.substring(0, 1000));
      console.error('[Converter] Response ending (last 500 chars):', jsonText.substring(Math.max(0, jsonText.length - 500)));
      
      // Check if response was truncated
      if (!jsonText.trim().endsWith('}') && !jsonText.trim().endsWith(']')) {
        throw new Error('LLM response was truncated. Try reducing document size or increasing maxSlidesPerSection parameter.');
      }
      
      throw new Error('Failed to generate presentation structure - invalid JSON: ' + parseError.message);
    }
  } catch (error: any) {
    console.error('[Converter] LLM API call failed:', error.message);
    if (error.message?.includes('fetch failed')) {
      throw new Error('Network error: Unable to reach Gemini API. Check network connection and API key.');
    }
    throw error;
  }
}

/**
 * Generates Reveal.js HTML from presentation structure
 */
export function generateRevealHTML(presentation: PresentationStructure): string {
  const themeColors = {
    light: { bg: '#ffffff', text: '#333333', accent: '#3b82f6' },
    dark: { bg: '#1e293b', text: '#f1f5f9', accent: '#60a5fa' },
    corporate: { bg: '#f8fafc', text: '#1e40af', accent: '#2563eb' },
    modern: { bg: '#0f172a', text: '#e2e8f0', accent: '#06b6d4' },
  };

  const theme = themeColors[presentation.theme as keyof typeof themeColors] || themeColors.modern;

  const renderSlide = (slide: PresentationSlide): string => {
    switch (slide.type) {
      case 'title':
        return `
        <section data-background-color="${theme.bg}">
          <h1 style="color: ${theme.accent}; font-size: 3em; margin-bottom: 0.5em;">${slide.title || presentation.title}</h1>
          ${slide.subtitle ? `<h3 style="color: ${theme.text}; opacity: 0.8;">${slide.subtitle}</h3>` : ''}
          ${slide.author ? `<p style="color: ${theme.text}; opacity: 0.6; margin-top: 2em;">${slide.author}</p>` : ''}
        </section>`;

      case 'agenda':
        return `
        <section data-background-color="${theme.bg}">
          <h2 style="color: ${theme.accent};">${slide.title || 'Agenda'}</h2>
          <ul style="font-size: 1.5em; line-height: 2;">
            ${(slide.content || []).map((item, i) => `
              <li style="color: ${theme.text}; margin: 0.5em 0;">
                <span style="color: ${theme.accent}; margin-right: 0.5em;">0${i + 1}</span> ${item}
              </li>
            `).join('')}
          </ul>
        </section>`;

      case 'content':
        return `
        <section data-background-color="${theme.bg}">
          <h2 style="color: ${theme.accent};">${slide.title}</h2>
          ${slide.content && slide.content.length > 0 ? `
            <ul style="font-size: 1.2em; line-height: 1.8;">
              ${slide.content.map(item => `
                <li style="color: ${theme.text}; margin: 0.4em 0;">
                  <span style="color: ${theme.accent};">▸</span> ${item}
                </li>
              `).join('')}
            </ul>
          ` : ''}
          ${slide.notes ? `<aside class="notes">${slide.notes}</aside>` : ''}
        </section>`;

      case 'image':
        return `
        <section data-background-color="${theme.bg}">
          <h2 style="color: ${theme.accent};">${slide.title}</h2>
          ${slide.imagePrompt ? `
            <div style="background: linear-gradient(135deg, ${theme.accent}22 0%, ${theme.accent}44 100%); 
                        padding: 3em; border-radius: 1em; margin: 1em 0;">
              <p style="color: ${theme.text}; font-size: 1.2em;">
                💡 Visuelles Element: ${slide.imagePrompt}
              </p>
            </div>
          ` : ''}
          ${slide.content ? `<p style="color: ${theme.text}; font-size: 1.1em; margin-top: 1em;">${slide.content[0]}</p>` : ''}
          ${slide.notes ? `<aside class="notes">${slide.notes}</aside>` : ''}
        </section>`;

      case 'quote':
        return `
        <section data-background-color="${theme.bg}">
          <blockquote style="font-size: 2em; font-style: italic; color: ${theme.accent}; 
                             border-left: 5px solid ${theme.accent}; padding-left: 1em; margin: 1em;">
            "${slide.content ? slide.content[0] : ''}"
          </blockquote>
          ${slide.notes ? `<p style="color: ${theme.text}; opacity: 0.7; margin-top: 2em;">— ${slide.notes}</p>` : ''}
        </section>`;

      case 'conclusion':
        return `
        <section data-background-color="${theme.bg}">
          <h2 style="color: ${theme.accent};">${slide.title || 'Zusammenfassung'}</h2>
          ${slide.content && slide.content.length > 0 ? `
            <ul style="font-size: 1.3em; line-height: 2;">
              ${slide.content.map(item => `
                <li style="color: ${theme.text}; margin: 0.5em 0;">
                  <span style="color: ${theme.accent};">✓</span> ${item}
                </li>
              `).join('')}
            </ul>
          ` : ''}
          <p style="color: ${theme.accent}; font-size: 2em; margin-top: 1.5em;">Vielen Dank!</p>
        </section>`;

      default:
        return `<section data-background-color="${theme.bg}"><p style="color: ${theme.text};">Unknown slide type</p></section>`;
    }
  };

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${presentation.title}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.0.4/dist/reset.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.0.4/dist/reveal.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.0.4/dist/theme/black.css">
  <style>
    .reveal {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    .reveal h1, .reveal h2, .reveal h3 {
      font-weight: 700;
      text-transform: none;
    }
    .reveal ul {
      list-style: none;
    }
    .reveal li {
      text-align: left;
    }
    .reveal blockquote {
      box-shadow: none;
      background: transparent;
    }
  </style>
</head>
<body>
  <div class="reveal">
    <div class="slides">
      ${presentation.slides.map(slide => renderSlide(slide)).join('\n')}
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@5.0.4/dist/reveal.js"></script>
  <script>
    Reveal.initialize({
      hash: true,
      transition: 'slide',
      transitionSpeed: 'default',
      controls: true,
      progress: true,
      center: true,
      slideNumber: 'c/t',
      showNotes: false,
      width: 1280,
      height: 720,
    });
  </script>
</body>
</html>`;
}
