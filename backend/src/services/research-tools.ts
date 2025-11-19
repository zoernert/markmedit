import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';

export type TransformationType = 
  | 'summary' 
  | 'outline' 
  | 'questions'
  | 'key-points'
  | 'expand'
  | 'simplify'
  | 'academic'
  | 'podcast-script';

export interface TransformationOptions {
  type: TransformationType;
  content: string;
  customPrompt?: string;
  targetLength?: 'short' | 'medium' | 'long';
  targetAudience?: string;
}

export interface TransformationResult {
  type: TransformationType;
  output: string;
  provider: 'gemini';
  model: string;
  timestamp: number;
}

/**
 * Research Tools Service for Content Transformations
 * Inspired by Open-Notebook's transformation capabilities
 * Uses existing Gemini LLM integration
 */
export class ResearchToolsService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  }

  /**
   * Transform content based on type
   */
  async transform(options: TransformationOptions): Promise<TransformationResult> {
    try {
      const prompt = this.buildPrompt(options);
      const model = this.genAI.getGenerativeModel({ model: config.gemini.model });
      
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      return {
        type: options.type,
        output: text,
        provider: 'gemini',
        model: config.gemini.model,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Research transform error details:', {
        message: error instanceof Error ? error.message : String(error),
        cause: error instanceof Error ? error.cause : undefined,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Generate a podcast script with multiple hosts
   */
  async generatePodcastScript(content: string, numHosts: number = 2): Promise<string> {
    const hosts = Array.from({ length: numHosts }, (_, i) => `Host ${i + 1}`);
    
    const prompt = `Create an engaging podcast script based on the following content.

Format:
- Use ${numHosts} hosts: ${hosts.join(', ')}
- Natural, conversational dialogue
- Opening introduction
- Discussion of key points
- Questions and answers between hosts
- Engaging transitions
- Closing summary

IMPORTANT: Respond in the same language as the provided content.

Content:
${content}

Return the script with clear host labels (e.g., "HOST 1:", "HOST 2:").`;

    const model = this.genAI.getGenerativeModel({ model: config.gemini.model });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  /**
   * Generate citations from content
   */
  async generateCitations(content: string, style: 'apa' | 'mla' | 'chicago' = 'apa'): Promise<string[]> {
    const prompt = `Extract any references or sources mentioned in the following content and format them in ${style.toUpperCase()} citation style.

If sources are mentioned, cite them. If no sources are mentioned, suggest where citations would be appropriate.

IMPORTANT: Respond in the same language as the provided content.

Content:
${content}

Return only the citations, one per line.`;

    const model = this.genAI.getGenerativeModel({ model: config.gemini.model });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Split by newlines and filter empty lines
    return text.split('\n').filter((line: string) => line.trim().length > 0);
  }

  /**
   * Extract key concepts and generate research questions
   */
  async generateResearchQuestions(content: string): Promise<string[]> {
    const prompt = `Based on the following content, generate 5-10 deep research questions that would help explore the topic further.
Focus on questions that:
- Challenge assumptions
- Explore implications
- Connect to related fields
- Identify gaps in knowledge

Content:
${content}

Return only the questions, one per line, numbered.`;

    const model = this.genAI.getGenerativeModel({ model: config.gemini.model });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return text.split('\n').filter((line: string) => line.trim().length > 0);
  }

  /**
   * Build prompt based on transformation type
   */
  private buildPrompt(options: TransformationOptions): string {
    if (options.customPrompt) {
      return `${options.customPrompt}\n\nContent:\n${options.content}`;
    }

    const lengthGuide = {
      short: 'Keep it very concise (2-3 paragraphs maximum).',
      medium: 'Provide a moderate level of detail (4-6 paragraphs).',
      long: 'Be comprehensive and detailed.',
    };

    const length = lengthGuide[options.targetLength || 'medium'];
    const audience = options.targetAudience 
      ? `Target audience: ${options.targetAudience}.`
      : '';

    // Language instruction - respond in the same language as the input
    const languageInstruction = 'IMPORTANT: Respond in the same language as the provided content.';

    const prompts: Record<TransformationType, string> = {
      summary: `Summarize the following content. ${length} ${audience}\n${languageInstruction}`,
      
      outline: `Create a structured outline of the following content. Use hierarchical bullet points with main topics and subtopics.\n${languageInstruction}`,
      
      questions: `Generate thoughtful questions based on the following content. Include:
- Comprehension questions (questions about facts and details)
- Analysis questions (questions requiring interpretation and connections)
- Application questions (questions about practical use and implications)
${length}
${languageInstruction}`,
      
      'key-points': `Extract the key points from the following content. Present them as a bulleted list. ${length}\n${languageInstruction}`,
      
      expand: `Expand on the following content with more detail, examples, and explanations. ${length} ${audience}\n${languageInstruction}`,
      
      simplify: `Simplify the following content. Use clear, simple language while maintaining accuracy. ${audience || 'Target audience: general readers with no prior knowledge.'}\n${languageInstruction}`,
      
      academic: `Transform the following content into academic prose. Use formal language, proper citations (if applicable), and scholarly tone. ${length}\n${languageInstruction}`,
      
      'podcast-script': `Convert the following content into an engaging podcast script. Include:
- Natural dialogue between hosts
- Questions and answers
- Conversational tone
- Appropriate transitions
Make it engaging and informative.
${languageInstruction}`,
    };

    return `${prompts[options.type]}\n\nContent:\n${options.content}`;
  }
}

// Singleton instance
let researchToolsService: ResearchToolsService | null = null;

export function getResearchToolsService(): ResearchToolsService {
  if (!researchToolsService) {
    researchToolsService = new ResearchToolsService();
  }
  return researchToolsService;
}
