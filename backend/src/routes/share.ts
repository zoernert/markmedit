import { Router } from 'express';
import { getDatabase } from '../db/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { marked } from 'marked';
import { randomBytes, randomUUID } from 'crypto';
import { 
  Document, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  AlignmentType, 
  Packer,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  VerticalAlign
} from 'docx';
import { optionalAuthMiddleware, type AuthRequest } from '../middleware/auth.js';

export const shareRoutes = Router();

/**
 * Generate a unique share ID for a document
 */
function generateShareId(): string {
  return randomBytes(8).toString('base64url');
}

/**
 * Enable sharing for a document (requires authentication)
 */
shareRoutes.post('/:documentId/enable', async (req, res) => {
  const { documentId } = req.params;
  const db = getDatabase();

  const document: any = db.prepare('SELECT id, share_id FROM documents WHERE id = ?').get(documentId);
  
  if (!document) {
    throw new AppError(404, 'Document not found');
  }

  let shareId = document.share_id;
  
  // Generate new share_id if it doesn't exist
  if (!shareId) {
    shareId = generateShareId();
    
    // Ensure uniqueness
    let attempts = 0;
    while (attempts < 10) {
      const existing = db.prepare('SELECT id FROM documents WHERE share_id = ?').get(shareId);
      if (!existing) break;
      shareId = generateShareId();
      attempts++;
    }
    
    if (attempts >= 10) {
      throw new AppError(500, 'Could not generate unique share ID');
    }
  }

  // Enable sharing
  db.prepare(`
    UPDATE documents 
    SET share_id = ?, share_enabled = 1 
    WHERE id = ?
  `).run(shareId, documentId);

  res.json({ shareId, shareUrl: `/share/${shareId}` });
});

/**
 * Disable sharing for a document
 */
shareRoutes.post('/:documentId/disable', async (req, res) => {
  const { documentId } = req.params;
  const db = getDatabase();

  db.prepare(`
    UPDATE documents 
    SET share_enabled = 0 
    WHERE id = ?
  `).run(documentId);

  res.json({ success: true });
});

/**
 * Get share status for a document
 */
shareRoutes.get('/:documentId/status', async (req, res) => {
  const { documentId } = req.params;
  const db = getDatabase();

  const document: any = db.prepare(`
    SELECT share_id, share_enabled 
    FROM documents 
    WHERE id = ?
  `).get(documentId);

  if (!document) {
    throw new AppError(404, 'Document not found');
  }

  res.json({
    shareId: document.share_id,
    shareEnabled: document.share_enabled === 1,
    shareUrl: document.share_id ? `/share/${document.share_id}` : null,
  });
});

// ============================================================================
// IMPORTANT: Specific format routes (.rss, .html, .pdf) must come BEFORE
// the generic /:shareId route to prevent Express from matching them incorrectly
// ============================================================================

/**
 * RSS Feed with version history
 */
shareRoutes.get('/:shareId.rss', async (req, res) => {
  let { shareId } = req.params;
  // Remove .rss suffix if Express included it in the parameter
  shareId = shareId.replace(/\.rss$/, '');
  
  const db = getDatabase();

  const document: any = db.prepare(`
    SELECT id, title, updated_at 
    FROM documents 
    WHERE share_id = ? AND share_enabled = 1
  `).get(shareId);

  if (!document) {
    throw new AppError(404, 'Shared document not found or sharing is disabled');
  }

  // Get version history
  const versions: any[] = db.prepare(`
    SELECT version, title, change_summary, created_at, content
    FROM document_versions
    WHERE document_id = ?
    ORDER BY version DESC
    LIMIT 20
  `).all(document.id);

  const baseUrl = `${req.protocol}://${req.get('host')}`;

  const items = versions.map((v) => `
    <item>
      <title>Version ${v.version}: ${v.change_summary || 'Keine Beschreibung'}</title>
      <link>${baseUrl}/share/${shareId}</link>
      <guid>${baseUrl}/share/${shareId}#v${v.version}</guid>
      <pubDate>${new Date(v.created_at).toUTCString()}</pubDate>
      <description><![CDATA[${v.change_summary || 'Dokumentversion aktualisiert'}]]></description>
    </item>
  `).join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${document.title}</title>
    <link>${baseUrl}/share/${shareId}</link>
    <description>Versionshistorie für ${document.title}</description>
    <language>de-DE</language>
    <lastBuildDate>${new Date(document.updated_at).toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/share/${shareId}.rss" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`;

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.send(rss);
});

/**
 * Markdown Export mit Metadaten für Import
 * Format: YAML Frontmatter + Markdown Content
 */
shareRoutes.get('/:shareId.md', async (req, res) => {
  let { shareId } = req.params;
  shareId = shareId.replace(/\.md$/, '');
  
  const db = getDatabase();

  const document: any = db.prepare(`
    SELECT id, title, content, updated_at, share_id
    FROM documents 
    WHERE share_id = ? AND share_enabled = 1
  `).get(shareId);

  if (!document) {
    throw new AppError(404, 'Shared document not found or sharing is disabled');
  }

  // Get latest version info
  const latestVersion: any = db.prepare(`
    SELECT version, change_summary, created_at
    FROM document_versions
    WHERE document_id = ?
    ORDER BY version DESC
    LIMIT 1
  `).get(document.id);

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const sourceUrl = `${baseUrl}/share/${shareId}`;
  
  // Helper to escape YAML string values
  const escapeYaml = (str: string) => {
    if (!str) return '""';
    // Replace quotes and backslashes, wrap in quotes if contains special chars
    const needsQuotes = /[:\n\r"'{}[\]&*#?|<>=!%@`]/.test(str);
    const escaped = str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return needsQuotes ? `"${escaped}"` : escaped;
  };
  
  // Safe date formatting
  const formatDate = (timestamp: number | null | undefined): string => {
    if (!timestamp || isNaN(Number(timestamp))) {
      return new Date().toISOString();
    }
    try {
      return new Date(Number(timestamp)).toISOString();
    } catch {
      return new Date().toISOString();
    }
  };
  
  // Create YAML frontmatter
  const frontmatter = `---
markmedit_import: true
source_url: ${escapeYaml(sourceUrl)}
source_id: ${escapeYaml(document.id)}
share_id: ${escapeYaml(shareId)}
title: ${escapeYaml(document.title)}
version: ${latestVersion?.version || 1}
last_updated: ${escapeYaml(formatDate(document.updated_at))}
change_summary: ${escapeYaml(latestVersion?.change_summary || 'Keine Beschreibung')}
---

`;

  const markdown = frontmatter + document.content;

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${document.title.replace(/[^a-z0-9]/gi, '_')}.md"`);
  res.send(markdown);
});

/**
 * HTML Download
 */
shareRoutes.get('/:shareId.html', async (req, res) => {
  let { shareId } = req.params;
  shareId = shareId.replace(/\.html$/, '');
  
  const db = getDatabase();

  const document: any = db.prepare(`
    SELECT title, content, updated_at 
    FROM documents 
    WHERE share_id = ? AND share_enabled = 1
  `).get(shareId);

  if (!document) {
    throw new AppError(404, 'Shared document not found or sharing is disabled');
  }

  // Convert Mermaid code blocks to <pre class="mermaid">
  let processedContent = document.content.replace(/```mermaid\n([\s\S]*?)```/g, '<pre class="mermaid">$1</pre>');
  
  const htmlContent = await marked(processedContent);

  const html = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${document.title}</title>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ 
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose'
    });
  </script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      font-weight: 600;
    }
    code {
      background: #f3f4f6;
      padding: 0.2em 0.4em;
      border-radius: 3px;
    }
    pre {
      background: #1f2937;
      color: #f9fafb;
      padding: 1rem;
      border-radius: 0.5rem;
      overflow-x: auto;
    }
    pre.mermaid {
      background: transparent;
      color: inherit;
      padding: 1rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>${document.title}</h1>
  ${htmlContent}
</body>
</html>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="${document.title}.html"`);
  res.send(html);
});

/**
 * PDF Export (TODO: Implement PDF generation)
 */
/**
 * PDF Export - Opens print-friendly HTML page
 */
shareRoutes.get('/:shareId.pdf', async (req, res) => {
  let { shareId } = req.params;
  shareId = shareId.replace(/\.pdf$/, '');
  
  const db = getDatabase();

  const document: any = db.prepare(`
    SELECT title, content 
    FROM documents 
    WHERE share_id = ? AND share_enabled = 1
  `).get(shareId);

  if (!document) {
    throw new AppError(404, 'Shared document not found or sharing is disabled');
  }

  // Convert Mermaid code blocks to <pre class="mermaid">
  let processedContent = document.content.replace(/```mermaid\n([\s\S]*?)```/g, '<pre class="mermaid">$1</pre>');
  
  // Convert markdown to HTML
  const htmlContent = await marked(processedContent);

  // Generate print-friendly HTML page
  const html = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>${document.title}</title>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ 
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose'
    });
    
    // Wait for Mermaid to render, then trigger print dialog
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.print();
      }, 2000);
    });
  </script>
  <style>
    @page {
      margin: 2cm;
      size: A4;
    }
    @media print {
      body {
        background: white !important;
      }
      .no-print {
        display: none !important;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      font-weight: 600;
      page-break-after: avoid;
    }
    h1 { 
      font-size: 2rem; 
      border-bottom: 2px solid #e5e7eb; 
      padding-bottom: 0.5rem;
    }
    h2 { font-size: 1.5rem; }
    h3 { font-size: 1.25rem; }
    p {
      margin: 0.5em 0;
      orphans: 3;
      widows: 3;
    }
    code {
      background: #f3f4f6;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-size: 0.9em;
      font-family: 'Courier New', monospace;
    }
    pre {
      background: #1f2937;
      color: #f9fafb;
      padding: 1rem;
      border-radius: 0.5rem;
      overflow-x: auto;
      page-break-inside: avoid;
    }
    pre code {
      background: none;
      padding: 0;
      color: inherit;
    }
    pre.mermaid {
      background: transparent;
      color: #1f2937;
      padding: 1rem;
      text-align: center;
      page-break-inside: avoid;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 0.5em;
      text-align: left;
    }
    th {
      background: #f3f4f6;
      font-weight: 600;
    }
    blockquote {
      border-left: 4px solid #e5e7eb;
      padding-left: 1em;
      margin-left: 0;
      color: #6b7280;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    .print-info {
      background: #eff6ff;
      border: 1px solid #3b82f6;
      border-radius: 0.5rem;
      padding: 1rem;
      margin-bottom: 2rem;
      text-align: center;
    }
    .print-info button {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 0.25rem;
      cursor: pointer;
      font-size: 1rem;
      margin: 0 0.5rem;
    }
    .print-info button:hover {
      background: #2563eb;
    }
  </style>
</head>
<body>
  <div class="print-info no-print">
    <p><strong>📄 PDF-Export</strong></p>
    <p>Der Druckdialog wird automatisch geöffnet. Wählen Sie "Als PDF speichern".</p>
    <button onclick="window.print()">🖨️ Jetzt drucken</button>
    <button onclick="window.close()">❌ Schließen</button>
  </div>
  <h1>${document.title}</h1>
  ${htmlContent}
</body>
</html>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

/**
 * DOCX Export with table and mermaid support
 */
shareRoutes.get('/:shareId.docx', async (req, res) => {
  let { shareId } = req.params;
  shareId = shareId.replace(/\.docx$/, '');
  
  const db = getDatabase();

  const document: any = db.prepare(`
    SELECT title, content 
    FROM documents 
    WHERE share_id = ? AND share_enabled = 1
  `).get(shareId);

  if (!document) {
    throw new AppError(404, 'Shared document not found or sharing is disabled');
  }

  try {
    // Parse markdown with marked to get tokens
    const tokens = marked.lexer(document.content);
    const docElements: any[] = [];

    // Add title
    docElements.push(
      new Paragraph({
        text: document.title,
        heading: HeadingLevel.TITLE,
        spacing: { after: 400 },
      })
    );

    // Helper function to parse inline formatting (bold, italic, code, links)
    function parseInlineFormatting(text: string): TextRun[] {
      const runs: TextRun[] = [];
      
      // Remove links but keep text
      let cleanText = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
      cleanText = cleanText.replace(/!\[([^\]]*)\]\([^\)]+\)/g, ''); // Remove images
      
      // Split by bold/italic markers
      const parts = cleanText.split(/(\*\*.*?\*\*|\*(?!\*).*?\*(?!\*)|__.*?__|_(?!_).*?_(?!_)|`[^`]+`)/g);
      
      for (const part of parts) {
        if (!part) continue;
        
        if (part.startsWith('**') && part.endsWith('**')) {
          runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
        } else if (part.startsWith('__') && part.endsWith('__')) {
          runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
        } else if (part.startsWith('`') && part.endsWith('`')) {
          runs.push(new TextRun({ text: part.slice(1, -1), font: 'Courier New', shading: { fill: 'F3F4F6' } }));
        } else if (part.match(/^\*[^*].*[^*]\*$/)) {
          runs.push(new TextRun({ text: part.slice(1, -1), italics: true }));
        } else if (part.match(/^_[^_].*[^_]_$/)) {
          runs.push(new TextRun({ text: part.slice(1, -1), italics: true }));
        } else {
          runs.push(new TextRun(part));
        }
      }
      
      return runs.length > 0 ? runs : [new TextRun(text)];
    }

    // Process tokens
    for (const token of tokens) {
      if (token.type === 'heading') {
        const level = [
          HeadingLevel.HEADING_1,
          HeadingLevel.HEADING_2,
          HeadingLevel.HEADING_3,
          HeadingLevel.HEADING_4,
          HeadingLevel.HEADING_5,
          HeadingLevel.HEADING_6,
        ][token.depth - 1] || HeadingLevel.HEADING_1;

        docElements.push(
          new Paragraph({
            text: token.text,
            heading: level,
            spacing: { before: 300, after: 200 },
          })
        );
      } else if (token.type === 'paragraph') {
        const textRuns = parseInlineFormatting(token.text);
        docElements.push(
          new Paragraph({
            children: textRuns,
            spacing: { after: 100 },
          })
        );
      } else if (token.type === 'code') {
        // Check if it's a mermaid diagram
        if (token.lang === 'mermaid') {
          docElements.push(
            new Paragraph({
              text: '📊 Mermaid-Diagramm',
              shading: { fill: 'E0F2FE' },
              spacing: { before: 200, after: 100 },
              border: {
                top: { color: '0EA5E9', size: 4, style: BorderStyle.SINGLE },
                bottom: { color: '0EA5E9', size: 4, style: BorderStyle.SINGLE },
                left: { color: '0EA5E9', size: 4, style: BorderStyle.SINGLE },
                right: { color: '0EA5E9', size: 4, style: BorderStyle.SINGLE },
              },
            })
          );
          docElements.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: '(Diagramme können in DOCX nicht dargestellt werden. Bitte nutzen Sie die HTML- oder PDF-Version für die vollständige Visualisierung.)',
                  italics: true,
                })
              ],
              spacing: { after: 200 },
            })
          );
        } else {
          // Regular code block
          const codeLines = token.text.split('\n');
          for (const line of codeLines) {
            docElements.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: line || ' ',
                    font: 'Courier New',
                  })
                ],
                shading: { fill: '1F2937' },
                spacing: { after: 0 },
              })
            );
          }
          docElements.push(new Paragraph({ text: '', spacing: { after: 200 } }));
        }
      } else if (token.type === 'table') {
        // Create table
        const tableRows: TableRow[] = [];
        
        // Header row
        if (token.header && token.header.length > 0) {
          const headerCells = token.header.map((cell: any) => {
            const textRuns = parseInlineFormatting(cell.text);
            return new TableCell({
              children: [new Paragraph({ children: textRuns })],
              shading: { fill: 'F3F4F6' },
              verticalAlign: VerticalAlign.CENTER,
            });
          });
          tableRows.push(new TableRow({ children: headerCells }));
        }
        
        // Body rows
        if (token.rows) {
          for (const row of token.rows) {
            const cells = row.map((cell: any) => {
              const textRuns = parseInlineFormatting(cell.text);
              return new TableCell({
                children: [new Paragraph({ children: textRuns })],
                verticalAlign: VerticalAlign.CENTER,
              });
            });
            tableRows.push(new TableRow({ children: cells }));
          }
        }
        
        const table = new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
            left: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
            right: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
          },
        });
        
        docElements.push(table);
        docElements.push(new Paragraph({ text: '', spacing: { after: 200 } }));
      } else if (token.type === 'list') {
        const items = token.items || [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const textRuns = parseInlineFormatting(item.text);
          
          if (token.ordered) {
            docElements.push(
              new Paragraph({
                children: textRuns,
                numbering: { reference: 'default-numbering', level: 0 },
              })
            );
          } else {
            docElements.push(
              new Paragraph({
                children: textRuns,
                bullet: { level: 0 },
              })
            );
          }
        }
      } else if (token.type === 'blockquote') {
        const text = token.text || '';
        const textRuns = parseInlineFormatting(text);
        docElements.push(
          new Paragraph({
            children: textRuns,
            border: {
              left: { color: 'E5E7EB', size: 12, style: BorderStyle.SINGLE },
            },
            indent: { left: 400 },
            spacing: { before: 100, after: 100 },
          })
        );
      } else if (token.type === 'space') {
        docElements.push(new Paragraph({ text: '' }));
      }
    }

    // Create document
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: docElements,
        },
      ],
      numbering: {
        config: [
          {
            reference: 'default-numbering',
            levels: [
              {
                level: 0,
                format: 'decimal',
                text: '%1.',
                alignment: AlignmentType.LEFT,
              },
            ],
          },
        ],
      },
    });

    // Generate DOCX buffer
    const buffer = await Packer.toBuffer(doc);

    // Send DOCX
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${document.title}.docx"`);
    res.send(buffer);
  } catch (error) {
    console.error('DOCX generation error:', error);
    throw new AppError(500, 'Failed to generate DOCX: ' + (error as Error).message);
  }
});

/**
 * Public HTML Preview (no auth required)
 */
shareRoutes.get('/:shareId', optionalAuthMiddleware, async (req: AuthRequest, res) => {
  const { shareId } = req.params;
  const db = getDatabase();

  const document: any = db.prepare(`
    SELECT id, title, content, updated_at 
    FROM documents 
    WHERE share_id = ? AND share_enabled = 1
  `).get(shareId);

  if (!document) {
    throw new AppError(404, 'Shared document not found or sharing is disabled');
  }

  // Get latest version info
  const latestVersion: any = db.prepare(`
    SELECT version, change_summary, created_at
    FROM document_versions
    WHERE document_id = ?
    ORDER BY version DESC
    LIMIT 1
  `).get(document.id);

  // Log access if user is authenticated
  if (req.user?.id) {
    const accessLogId = randomUUID();
    db.prepare(`
      INSERT INTO document_access_log (id, document_id, user_id, access_type, share_id, accessed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(accessLogId, document.id, req.user.id, 'share_link', shareId, Date.now());
  }

  // Convert Mermaid code blocks to <pre class="mermaid">
  let processedContent = document.content.replace(/```mermaid\n([\s\S]*?)```/g, '<pre class="mermaid">$1</pre>');
  
  // Render markdown to HTML
  const htmlContent = await marked(processedContent);

  const html = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${document.title}</title>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ 
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose'
    });
  </script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      background: #f9fafb;
      color: #1f2937;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      font-weight: 600;
    }
    h1 { font-size: 2rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }
    h2 { font-size: 1.5rem; }
    code {
      background: #f3f4f6;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-size: 0.9em;
    }
    pre {
      background: #1f2937;
      color: #f9fafb;
      padding: 1rem;
      border-radius: 0.5rem;
      overflow-x: auto;
    }
    pre code {
      background: none;
      padding: 0;
      color: inherit;
    }
    pre.mermaid {
      background: transparent;
      color: inherit;
      padding: 1rem;
      text-align: center;
    }
    a { color: #3b82f6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 0.5em;
      text-align: left;
    }
    th {
      background: #f3f4f6;
      font-weight: 600;
    }
    .header {
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #e5e7eb;
    }
    .formats {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid #e5e7eb;
      font-size: 0.875rem;
      color: #6b7280;
    }
    .formats a {
      margin-right: 1rem;
    }
  </style>
</head>
<body>
  <div class="header">
    <p style="color: #6b7280; font-size: 0.875rem; margin: 0.25rem 0;">
      ${latestVersion ? `Version ${latestVersion.version}` : ''}
      ${document.updated_at ? ` • Zuletzt aktualisiert: ${new Date(Number(document.updated_at)).toLocaleString('de-DE', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      })}` : ''}
    </p>
    ${latestVersion?.change_summary ? `
    <p style="color: #6b7280; font-size: 0.875rem; margin: 0.25rem 0; font-style: italic;">
      📝 ${latestVersion.change_summary.length > 100 ? latestVersion.change_summary.substring(0, 100) + '...' : latestVersion.change_summary}
    </p>
    ` : ''}
  </div>
  ${htmlContent}
  <div class="formats">
    <strong>Andere Formate:</strong>
    <a href="/share/${shareId}.pdf" target="_blank">📄 PDF</a>
    <a href="/share/${shareId}.docx">📝 DOCX</a>
    <a href="/share/${shareId}.html">💾 HTML Download</a>
    <a href="/share/${shareId}.md">⬇️ Markdown (zum Importieren)</a>
    <a href="/share/${shareId}.rss">📡 RSS Feed</a>
  </div>
</body>
</html>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});
