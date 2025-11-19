/**
 * Tavily Web Search Service
 * 
 * Provides intelligent web search capabilities optimized for AI research.
 * Tavily delivers pre-filtered, high-quality sources ideal for fact-checking
 * and knowledge enrichment.
 * 
 * API: https://docs.tavily.com/
 */

import fetch from 'node-fetch';

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  raw_content?: string;
  published_date?: string;
}

export interface TavilySearchResponse {
  query: string;
  follow_up_questions?: string[];
  answer?: string;
  images?: string[];
  results: TavilySearchResult[];
  response_time: number;
}

export interface TavilySearchOptions {
  searchDepth?: 'basic' | 'advanced';
  includeAnswer?: boolean;
  includeRawContent?: boolean;
  maxResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  topic?: 'general' | 'news';
}

class TavilyService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.tavily.com';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TAVILY_API_KEY || '';
    
    if (!this.apiKey) {
      console.warn('⚠️  TAVILY_API_KEY not set - web search will be unavailable');
    }
  }

  /**
   * Check if Tavily is available (API key configured)
   */
  isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Perform web search using Tavily
   */
  async search(
    query: string,
    options: TavilySearchOptions = {}
  ): Promise<TavilySearchResponse> {
    if (!this.apiKey) {
      throw new Error('Tavily API key not configured. Set TAVILY_API_KEY environment variable.');
    }

    const {
      searchDepth = 'basic',
      includeAnswer = true,
      includeRawContent = false,
      maxResults = 10,
      includeDomains = [],
      excludeDomains = [],
      topic = 'general',
    } = options;

    try {
      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          search_depth: searchDepth,
          include_answer: includeAnswer,
          include_raw_content: includeRawContent,
          max_results: maxResults,
          include_domains: includeDomains.length > 0 ? includeDomains : undefined,
          exclude_domains: excludeDomains.length > 0 ? excludeDomains : undefined,
          topic,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Tavily API error (${response.status}): ${error}`);
      }

      const data = await response.json() as TavilySearchResponse;
      return data;
    } catch (error) {
      console.error('Tavily search failed:', error);
      throw error;
    }
  }

  /**
   * Extract relevant snippets from search results
   */
  extractSnippets(results: TavilySearchResult[], maxSnippets: number = 5): string[] {
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSnippets)
      .map(r => `${r.title}\n${r.content}\nSource: ${r.url}`);
  }

  /**
   * Format search results for AI context
   */
  formatForAI(searchResponse: TavilySearchResponse): string {
    let formatted = `# Web Search Results for: "${searchResponse.query}"\n\n`;

    if (searchResponse.answer) {
      formatted += `## Quick Answer\n${searchResponse.answer}\n\n`;
    }

    formatted += `## Sources (${searchResponse.results.length} results)\n\n`;

    searchResponse.results.forEach((result, index) => {
      formatted += `### ${index + 1}. ${result.title}\n`;
      formatted += `**URL**: ${result.url}\n`;
      formatted += `**Relevance Score**: ${result.score.toFixed(2)}\n\n`;
      formatted += `${result.content}\n\n`;
      
      if (result.published_date) {
        formatted += `*Published: ${result.published_date}*\n\n`;
      }

      formatted += '---\n\n';
    });

    if (searchResponse.follow_up_questions && searchResponse.follow_up_questions.length > 0) {
      formatted += `## Related Questions\n`;
      searchResponse.follow_up_questions.forEach(q => {
        formatted += `- ${q}\n`;
      });
    }

    return formatted;
  }
}

// Singleton instance
let tavilyService: TavilyService | null = null;

export function getTavilyService(): TavilyService {
  if (!tavilyService) {
    tavilyService = new TavilyService();
  }
  return tavilyService;
}

export { TavilyService };
