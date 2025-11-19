import { Router } from 'express';
import { getDatabase } from '../db/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { z } from 'zod';

export const exportRoutes = Router();

const exportSchema = z.object({
  documentId: z.string(),
  format: z.enum(['markdown', 'reveal', 'pdf', 'html']),
  options: z.object({
    theme: z.string().optional(),
    includeChildren: z.boolean().default(false),
  }).optional(),
});

// Export document
exportRoutes.post('/', async (req, res) => {
  const data = exportSchema.parse(req.body);
  const db = getDatabase();
  
  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(data.documentId) as any;
  if (!document) {
    throw new AppError(404, 'Document not found');
  }
  
  switch (data.format) {
    case 'markdown':
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="${document.slug}.md"`);
      res.send(document.content);
      break;
      
    case 'reveal':
      const revealHtml = generateRevealJS(document, data.options);
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="${document.slug}-slides.html"`);
      res.send(revealHtml);
      break;
      
    case 'html':
      const html = generateHTML(document);
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="${document.slug}.html"`);
      res.send(html);
      break;
      
    case 'pdf':
      // TODO: Implement PDF export via Pandoc
      throw new AppError(501, 'PDF export not yet implemented');
      
    default:
      throw new AppError(400, 'Invalid export format');
  }
});

function generateRevealJS(document: any, options?: any) {
  const theme = options?.theme || 'black';
  
  // Convert markdown to reveal.js slides
  // Split on ## for new slides
  const slides = document.content
    .split(/^## /m)
    .filter((s: string) => s.trim())
    .map((slide: string) => {
      return `<section data-markdown>
  <textarea data-template>
## ${slide.trim()}
  </textarea>
</section>`;
    })
    .join('\n');
  
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${document.title}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.5.0/dist/reset.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.5.0/dist/reveal.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.5.0/dist/theme/${theme}.css">
</head>
<body>
  <div class="reveal">
    <div class="slides">
      <section data-markdown>
        <textarea data-template>
# ${document.title}

*Erstellt mit MarkMEdit*
        </textarea>
      </section>
      ${slides}
    </div>
  </div>
  
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@4.5.0/dist/reveal.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@4.5.0/plugin/markdown/markdown.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@4.5.0/plugin/highlight/highlight.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/reveal.js@4.5.0/plugin/notes/notes.js"></script>
  <script>
    Reveal.initialize({
      hash: true,
      plugins: [ RevealMarkdown, RevealHighlight, RevealNotes ]
    });
  </script>
</body>
</html>`;
}

function generateHTML(document: any) {
  // Simple HTML export
  // In production, use a proper markdown-to-html converter
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${document.title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      color: #333;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    pre {
      background: #f4f4f4;
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
    }
    code {
      background: #f4f4f4;
      padding: 0.2em 0.4em;
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <article>
    <h1>${document.title}</h1>
    <pre>${document.content}</pre>
  </article>
</body>
</html>`;
}
