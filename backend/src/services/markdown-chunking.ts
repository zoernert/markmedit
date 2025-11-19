/**
 * Smart Markdown Chunking Service
 * Analyzes markdown structure and creates intelligent chunks with hierarchical metadata
 */

export interface MarkdownChunk {
  content: string;
  metadata: {
    chapter?: string;
    section?: string;
    heading_level: number;
    heading_text: string;
    chunk_index: number;
    content_type: 'text' | 'code' | 'table' | 'list' | 'quote';
    char_count: number;
  };
}

interface HeadingNode {
  level: number;
  text: string;
  line: number;
  content: string[];
  children: HeadingNode[];
}

/**
 * Parse markdown into hierarchical heading structure
 */
function parseMarkdownHierarchy(markdown: string): HeadingNode {
  const lines = markdown.split('\n');
  const root: HeadingNode = {
    level: 0,
    text: 'root',
    line: 0,
    content: [],
    children: [],
  };

  const stack: HeadingNode[] = [root];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();

      const node: HeadingNode = {
        level,
        text,
        line: i,
        content: [],
        children: [],
      };

      // Find correct parent in stack
      while (stack.length > 1 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else {
      // Add content to current heading
      if (stack.length > 0) {
        stack[stack.length - 1].content.push(line);
      }
    }
  }

  return root;
}

/**
 * Detect content type from markdown
 */
function detectContentType(content: string): 'text' | 'code' | 'table' | 'list' | 'quote' {
  const trimmed = content.trim();

  if (trimmed.startsWith('```')) {
    return 'code';
  }

  if (trimmed.startsWith('|') && trimmed.includes('|')) {
    return 'table';
  }

  if (/^[\s]*[-*+]\s/.test(trimmed) || /^[\s]*\d+\.\s/.test(trimmed)) {
    return 'list';
  }

  if (trimmed.startsWith('>')) {
    return 'quote';
  }

  return 'text';
}

/**
 * Build chapter/section path from heading hierarchy
 */
function buildHierarchyPath(_node: HeadingNode, ancestors: HeadingNode[]): {
  chapter?: string;
  section?: string;
} {
  // Find first level-1 heading as chapter
  const chapter = ancestors.find(n => n.level === 1);
  
  // Find first level-2 heading as section
  const section = ancestors.find(n => n.level === 2);

  return {
    chapter: chapter?.text,
    section: section?.text,
  };
}

/**
 * Split large content into smaller chunks while preserving context
 */
function splitContent(
  content: string,
  maxChunkSize: number = 2000,
  overlap: number = 200
): string[] {
  if (content.length <= maxChunkSize) {
    return [content];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < content.length) {
    const end = Math.min(start + maxChunkSize, content.length);
    
    // Try to break at paragraph boundary
    let breakPoint = end;
    if (end < content.length) {
      const lastNewline = content.lastIndexOf('\n\n', end);
      if (lastNewline > start + maxChunkSize / 2) {
        breakPoint = lastNewline;
      }
    }

    chunks.push(content.substring(start, breakPoint).trim());
    start = breakPoint - overlap;
  }

  return chunks;
}

/**
 * Process a heading node and its children recursively
 */
function processNode(
  node: HeadingNode,
  ancestors: HeadingNode[],
  chunks: MarkdownChunk[],
  maxChunkSize: number = 2000
): void {
  const hierarchy = buildHierarchyPath(node, ancestors);
  const fullContent = node.content.join('\n').trim();

  if (fullContent.length > 0) {
    const contentType = detectContentType(fullContent);
    const contentChunks = splitContent(fullContent, maxChunkSize);

    for (let i = 0; i < contentChunks.length; i++) {
      chunks.push({
        content: contentChunks[i],
        metadata: {
          ...hierarchy,
          heading_level: node.level,
          heading_text: node.text,
          chunk_index: i,
          content_type: contentType,
          char_count: contentChunks[i].length,
        },
      });
    }
  }

  // Process children
  const newAncestors = [...ancestors, node];
  for (const child of node.children) {
    processNode(child, newAncestors, chunks, maxChunkSize);
  }
}

/**
 * Main function: Parse markdown into intelligent chunks
 * @param markdown Markdown content to chunk
 * @param maxChunkSize Maximum characters per chunk (default: 2000)
 * @returns Array of chunks with metadata
 */
export function chunkMarkdown(
  markdown: string,
  maxChunkSize: number = 2000
): MarkdownChunk[] {
  const hierarchy = parseMarkdownHierarchy(markdown);
  const chunks: MarkdownChunk[] = [];

  // Process root content (content before first heading)
  if (hierarchy.content.length > 0) {
    const rootContent = hierarchy.content.join('\n').trim();
    if (rootContent.length > 0) {
      const contentChunks = splitContent(rootContent, maxChunkSize);
      for (let i = 0; i < contentChunks.length; i++) {
        chunks.push({
          content: contentChunks[i],
          metadata: {
            heading_level: 0,
            heading_text: 'Introduction',
            chunk_index: i,
            content_type: detectContentType(contentChunks[i]),
            char_count: contentChunks[i].length,
          },
        });
      }
    }
  }

  // Process all child nodes
  for (const child of hierarchy.children) {
    processNode(child, [], chunks, maxChunkSize);
  }

  // Update total chunk indices
  chunks.forEach((chunk, index) => {
    chunk.metadata.chunk_index = index;
  });

  return chunks;
}

/**
 * Extract table of contents from markdown
 */
export function extractTableOfContents(markdown: string): Array<{
  level: number;
  text: string;
  line: number;
}> {
  const lines = markdown.split('\n');
  const toc: Array<{ level: number; text: string; line: number }> = [];

  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      toc.push({
        level: match[1].length,
        text: match[2].trim(),
        line: index,
      });
    }
  });

  return toc;
}

/**
 * Get statistics about markdown document
 */
export function getMarkdownStats(markdown: string): {
  totalChars: number;
  totalLines: number;
  headings: { [level: number]: number };
  estimatedChunks: number;
  codeBlocks: number;
  tables: number;
  lists: number;
} {
  const lines = markdown.split('\n');
  const headings: { [level: number]: number } = {};
  let codeBlocks = 0;
  let tables = 0;
  let lists = 0;

  lines.forEach(line => {
    const headingMatch = line.match(/^(#{1,6})\s/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      headings[level] = (headings[level] || 0) + 1;
    }

    if (line.trim().startsWith('```')) codeBlocks++;
    if (line.trim().startsWith('|')) tables++;
    if (/^[\s]*[-*+]\s/.test(line) || /^[\s]*\d+\.\s/.test(line)) lists++;
  });

  return {
    totalChars: markdown.length,
    totalLines: lines.length,
    headings,
    estimatedChunks: Math.ceil(markdown.length / 2000),
    codeBlocks: Math.floor(codeBlocks / 2), // Divide by 2 (open + close)
    tables,
    lists,
  };
}
