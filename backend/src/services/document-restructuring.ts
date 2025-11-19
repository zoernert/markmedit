/**
 * Document Restructuring Service
 * Analyzes document structure and suggests improvements
 */

import { searchDocumentChunks, getDocumentStructure } from './document-indexer.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

/**
 * Find all chunks related to a specific topic
 */
export async function findTopicClusters(
  documentId: string,
  topic: string
): Promise<{
  clusters: Array<{
    chapter: string;
    section: string;
    chunkCount: number;
    averageRelevance: number;
  }>;
  totalMatches: number;
}> {
  try {
    const results = await searchDocumentChunks(topic, {
      documentId,
      limit: 50,
      scoreThreshold: 0.7,
    });

    if (results.length === 0) {
      return { clusters: [], totalMatches: 0 };
    }

    // Group by chapter and section
    const groups: { [key: string]: { chunks: number; totalScore: number } } = {};

    results.forEach(r => {
      const key = `${r.metadata.chapter || 'Unassigned'} > ${r.metadata.section || 'Unassigned'}`;
      if (!groups[key]) {
        groups[key] = { chunks: 0, totalScore: 0 };
      }
      groups[key].chunks++;
      groups[key].totalScore += r.score;
    });

    const clusters = Object.entries(groups).map(([key, data]) => {
      const [chapter, section] = key.split(' > ');
      return {
        chapter,
        section,
        chunkCount: data.chunks,
        averageRelevance: data.totalScore / data.chunks,
      };
    }).sort((a, b) => b.chunkCount - a.chunkCount);

    return {
      clusters,
      totalMatches: results.length,
    };
  } catch (error) {
    console.error('Error finding topic clusters:', error);
    throw error;
  }
}

/**
 * Analyze document structure and suggest improvements
 */
export async function analyzeDocumentStructure(
  documentId: string
): Promise<{
  structure: {
    chapters: Array<{
      name: string;
      sections: Array<{
        name: string;
        chunkCount: number;
      }>;
    }>;
    totalChunks: number;
  };
  suggestions: string[];
  issues: Array<{
    type: 'imbalance' | 'duplicate_topic' | 'scattered_topic';
    description: string;
    severity: 'low' | 'medium' | 'high';
  }>;
}> {
  try {
    const structure = await getDocumentStructure(documentId);
    const suggestions: string[] = [];
    const issues: Array<{
      type: 'imbalance' | 'duplicate_topic' | 'scattered_topic';
      description: string;
      severity: 'low' | 'medium' | 'high';
    }> = [];

    // Analyze chapter balance
    const chapterSizes = structure.chapters.map(ch => 
      ch.sections.reduce((sum, s) => sum + s.chunkCount, 0)
    );

    if (chapterSizes.length > 0) {
      const avgSize = chapterSizes.reduce((a, b) => a + b, 0) / chapterSizes.length;
      const maxSize = Math.max(...chapterSizes);
      const minSize = Math.min(...chapterSizes);

      // Check for imbalance
      if (maxSize > avgSize * 3) {
        const largeChapter = structure.chapters[chapterSizes.indexOf(maxSize)];
        issues.push({
          type: 'imbalance',
          description: `Kapitel "${largeChapter.name}" ist unverhältnismäßig groß (${maxSize} vs durchschnittlich ${Math.round(avgSize)} Chunks). Erwäge eine Aufteilung.`,
          severity: 'medium',
        });
        suggestions.push(`Unterteile Kapitel "${largeChapter.name}" in mehrere Unterkapitel`);
      }

      if (minSize < avgSize / 3 && chapterSizes.length > 2) {
        const smallChapter = structure.chapters[chapterSizes.indexOf(minSize)];
        issues.push({
          type: 'imbalance',
          description: `Kapitel "${smallChapter.name}" ist sehr klein (${minSize} Chunks). Könnte in ein anderes Kapitel integriert werden.`,
          severity: 'low',
        });
        suggestions.push(`Integriere Kapitel "${smallChapter.name}" in ein verwandtes Kapitel`);
      }
    }

    // Check for empty or single-section chapters
    structure.chapters.forEach(chapter => {
      if (chapter.sections.length === 1) {
        suggestions.push(`Füge mehr Abschnitte zu Kapitel "${chapter.name}" hinzu oder integriere es`);
      }
    });

    return {
      structure,
      suggestions,
      issues,
    };
  } catch (error) {
    console.error('Error analyzing document structure:', error);
    throw error;
  }
}

/**
 * Suggest restructuring for scattered topics
 */
export async function suggestTopicConsolidation(
  documentId: string,
  topic: string
): Promise<{
  isScattered: boolean;
  currentLocations: string[];
  suggestion: string;
}> {
  try {
    const clusters = await findTopicClusters(documentId, topic);

    if (clusters.clusters.length <= 1) {
      return {
        isScattered: false,
        currentLocations: [],
        suggestion: `Thema "${topic}" ist gut konzentriert.`,
      };
    }

    const locations = clusters.clusters.map(c => 
      `${c.chapter} > ${c.section} (${c.chunkCount} Abschnitte)`
    );

    const suggestion = clusters.clusters.length >= 3
      ? `Thema "${topic}" ist über ${clusters.clusters.length} Bereiche verteilt. ` +
        `Erwäge, ein dediziertes Kapitel "${topic}" zu erstellen und alle Inhalte dort zu konsolidieren.`
      : `Thema "${topic}" erscheint in ${clusters.clusters.length} Bereichen. ` +
        `Prüfe, ob eine Konsolidierung sinnvoll ist.`;

    return {
      isScattered: clusters.clusters.length >= 3,
      currentLocations: locations,
      suggestion,
    };
  } catch (error) {
    console.error('Error suggesting topic consolidation:', error);
    throw error;
  }
}

/**
 * Generate AI-powered restructuring recommendations
 */
export async function generateRestructuringPlan(
  documentId: string,
  goal: string
): Promise<{
  plan: string;
  steps: string[];
  estimatedImpact: 'low' | 'medium' | 'high';
}> {
  try {
    const analysis = await analyzeDocumentStructure(documentId);
    
    const model = genAI.getGenerativeModel({ model: config.gemini.model });

    const prompt = `
Du bist ein Experte für Dokumentstruktur und -organisation.

Ziel: ${goal}

Aktuelle Dokumentstruktur:
${JSON.stringify(analysis.structure, null, 2)}

Identifizierte Probleme:
${analysis.issues.map(i => `- ${i.description}`).join('\n')}

Erstelle einen detaillierten Restrukturierungsplan, der:
1. Die Probleme adressiert
2. Das angegebene Ziel erreicht
3. Die Lesbarkeit und Navigation verbessert

Format:
**Zusammenfassung:** [Eine Zeile]

**Schritte:**
1. [Schritt 1]
2. [Schritt 2]
...

**Geschätzter Impact:** [low/medium/high]
`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Parse response
    const stepsMatch = response.match(/\*\*Schritte:\*\*\s*([\s\S]+?)\*\*Geschätzter Impact:\*\*/);
    const impactMatch = response.match(/\*\*Geschätzter Impact:\*\*\s*(low|medium|high)/i);

    const steps = stepsMatch 
      ? stepsMatch[1].split('\n').filter(line => line.trim().match(/^\d+\./)).map(line => line.trim())
      : [];

    const estimatedImpact = (impactMatch?.[1]?.toLowerCase() as 'low' | 'medium' | 'high') || 'medium';

    return {
      plan: response,
      steps,
      estimatedImpact,
    };
  } catch (error) {
    console.error('Error generating restructuring plan:', error);
    throw error;
  }
}
