/**
 * Service for parsing and managing embedded artifacts in markdown documents
 */

export interface EmbeddedArtifact {
  artifactId: string;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  content: string;
}

/**
 * Parse markdown content to find all embedded artifacts
 * Looks for <!-- ARTIFACT:id:start --> and <!-- ARTIFACT:id:end --> markers
 */
export function parseEmbeddedArtifacts(content: string): Map<string, EmbeddedArtifact[]> {
  const artifactMap = new Map<string, EmbeddedArtifact[]>();
  const lines = content.split('\n');
  
  let currentArtifact: { id: string; startLine: number; startOffset: number; contentLines: string[] } | null = null;
  let currentOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLength = line.length + 1; // +1 for newline

    // Check for start marker: <!-- ARTIFACT:id:start -->
    const startMatch = line.match(/<!--\s*ARTIFACT:([^:]+):start\s*-->/);
    if (startMatch) {
      const artifactId = startMatch[1];
      currentArtifact = {
        id: artifactId,
        startLine: i,
        startOffset: currentOffset,
        contentLines: []
      };
      currentOffset += lineLength;
      continue;
    }

    // Check for end marker: <!-- ARTIFACT:id:end -->
    const endMatch = line.match(/<!--\s*ARTIFACT:([^:]+):end\s*-->/);
    if (endMatch && currentArtifact) {
      const artifactId = endMatch[1];
      
      // Verify that end marker matches start marker
      if (artifactId === currentArtifact.id) {
        const embedded: EmbeddedArtifact = {
          artifactId: currentArtifact.id,
          startLine: currentArtifact.startLine,
          endLine: i,
          startOffset: currentArtifact.startOffset,
          endOffset: currentOffset,
          content: currentArtifact.contentLines.join('\n')
        };

        // Add to map
        if (!artifactMap.has(artifactId)) {
          artifactMap.set(artifactId, []);
        }
        artifactMap.get(artifactId)!.push(embedded);

        currentArtifact = null;
      } else {
        console.warn(`Mismatched artifact markers: start=${currentArtifact.id}, end=${artifactId}`);
      }
      
      currentOffset += lineLength;
      continue;
    }

    // Collect content between markers
    if (currentArtifact) {
      currentArtifact.contentLines.push(line);
    }

    currentOffset += lineLength;
  }

  // Warn if there's an unclosed marker
  if (currentArtifact) {
    console.warn(`Unclosed artifact marker for ID: ${currentArtifact.id}`);
  }

  return artifactMap;
}

/**
 * Embed an artifact into document content at specified position
 */
export function embedArtifactInContent(
  content: string,
  artifactId: string,
  artifactContent: string,
  position: 'start' | 'end' | number // number = character offset
): string {
  const startMarker = `<!-- ARTIFACT:${artifactId}:start -->`;
  const endMarker = `<!-- ARTIFACT:${artifactId}:end -->`;
  const embeddedBlock = `${startMarker}\n${artifactContent}\n${endMarker}`;

  if (position === 'start') {
    return `${embeddedBlock}\n\n${content}`;
  } else if (position === 'end') {
    return `${content}\n\n${embeddedBlock}`;
  } else {
    // Insert at specific offset
    const before = content.substring(0, position);
    const after = content.substring(position);
    return `${before}\n${embeddedBlock}\n${after}`;
  }
}

/**
 * Update all instances of an embedded artifact in document content
 */
export function updateEmbeddedArtifact(
  content: string,
  artifactId: string,
  newContent: string
): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let inArtifact = false;
  let currentArtifactId: string | null = null;

  for (const line of lines) {
    // Check for start marker
    const startMatch = line.match(/<!--\s*ARTIFACT:([^:]+):start\s*-->/);
    if (startMatch) {
      currentArtifactId = startMatch[1];
      inArtifact = true;
      result.push(line); // Keep the marker
      
      // If this is the artifact we're updating, insert new content
      if (currentArtifactId === artifactId) {
        result.push(newContent);
      }
      continue;
    }

    // Check for end marker
    const endMatch = line.match(/<!--\s*ARTIFACT:([^:]+):end\s*-->/);
    if (endMatch) {
      result.push(line); // Keep the marker
      inArtifact = false;
      currentArtifactId = null;
      continue;
    }

    // If we're in an artifact being updated, skip the old content
    if (inArtifact && currentArtifactId === artifactId) {
      continue; // Skip old content
    }

    // Otherwise, keep the line
    result.push(line);
  }

  return result.join('\n');
}

/**
 * Extract content between artifact markers for comparison
 */
export function extractEmbeddedContent(
  content: string,
  artifactId: string
): string | null {
  const artifacts = parseEmbeddedArtifacts(content);
  const instances = artifacts.get(artifactId);
  
  if (!instances || instances.length === 0) {
    return null;
  }

  // Return content from first instance
  return instances[0].content;
}

/**
 * Check if document content has changed compared to artifact content
 */
export function hasEmbeddedContentChanged(
  documentContent: string,
  artifactId: string,
  artifactContent: string
): boolean {
  const embeddedContent = extractEmbeddedContent(documentContent, artifactId);
  
  if (embeddedContent === null) {
    return false; // Artifact not embedded
  }

  return embeddedContent.trim() !== artifactContent.trim();
}
