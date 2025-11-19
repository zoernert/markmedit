import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const client = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds default timeout
});

// Add auth token to requests
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Longer timeout for AI/MCP requests (can take several minutes with complex multi-tool queries)
const aiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 300000, // 5 minutes for complex MCP tool chains (e.g., database queries with joins)
});

// Add auth token to AI requests too
aiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface Artifact {
  id: string;
  documentId: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateArtifactData {
  title: string;
  content: string;
}

export interface UpdateArtifactData {
  title?: string;
  content?: string;
}

export interface CopyArtifactData {
  targetDocumentId: string;
  moveInsteadOfCopy?: boolean;
}

export interface ConvertArtifactToDocumentData {
  title: string;
}

export interface MCPToolHint {
  id: string;
  tool_name: string;
  server_id: string | null;
  description: string | null;
  keywords: string | null;
  usage_hint: string | null;
  priority: number;
  created_at: number;
  updated_at: number;
}

export interface CreateMCPHintData {
  tool_name: string;
  server_id?: string;
  description?: string;
  keywords?: string;
  usage_hint?: string;
  priority?: number;
}

export interface UpdateMCPHintData {
  tool_name?: string;
  server_id?: string;
  description?: string;
  keywords?: string;
  usage_hint?: string;
  priority?: number;
}

export type MCPDefaultTools = Partial<{
  chat: string;
  search: string;
  reasoning: string;
  edifactAnalyze: string;
  edifactExplain: string;
  edifactValidate: string;
  edifactChat: string;
  edifactModify: string;
}>;

export interface MCPDiscoveredTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface MCPServerInfo {
  id: string;
  name: string;
  url: string;
  type: 'http';
  description: string;
  capabilities?: string[];
  defaultTools?: MCPDefaultTools;
  enabled?: boolean;
  isDefault?: boolean;
  tools?: MCPDiscoveredTool[];
  toolError?: string;
}

export type MCPServerCreatePayload = {
  id: string;
  name: string;
  url: string;
  type: 'http';
  description: string;
  capabilities?: string[];
  defaultTools?: MCPDefaultTools;
  enabled?: boolean;
  isDefault?: boolean;
};

export type MCPServerUpdatePayload = Partial<Omit<MCPServerCreatePayload, 'id'>>;

export interface MCPServerResponse<T = any> {
  serverId: string;
  serverName: string;
  serverDescription?: string;
  tool: string;
  result: T;
}

interface MCPSearchParams {
  query: string;
  limit?: number;
  collection?: string;
  serverId?: string;
  tool?: string;
  autoSelect?: boolean;
  allowedServerIds?: string[];
}

interface MCPChatParams {
  message: string;
  history?: Array<{ role: string; content: string }>;
  metadata?: Record<string, unknown>;
  serverId?: string;
  tool?: string;
  autoSelect?: boolean;
  allowedServerIds?: string[];
}

// Document Converter - Presentation conversion interfaces
export interface PresentationSlide {
  type: 'title' | 'agenda' | 'content' | 'image' | 'quote' | 'conclusion';
  title: string;
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
  theme: 'light' | 'dark' | 'corporate' | 'modern';
}

export interface ConvertToPresentationParams {
  content: string;
  userPrompt?: string;
  maxSlidesPerSection?: number;
  includeImages?: boolean;
  theme?: 'light' | 'dark' | 'corporate' | 'modern';
}

export interface ConvertToPresentationResponse {
  presentation: PresentationStructure;
  html: string;
}

interface MCPReasoningParams {
  query: string;
  context?: string;
  messages?: Array<{ role: string; content: string }>;
  serverId?: string;
  tool?: string;
  autoSelect?: boolean;
  allowedServerIds?: string[];
}

interface MCPEdifactParams {
  message: string;
  serverId?: string;
  tool?: string;
  autoSelect?: boolean;
  allowedServerIds?: string[];
}

interface MCPEdifactChatParams {
  message: string;
  edifactMessage: string;
  history?: Array<{ role: string; content: string }>;
  serverId?: string;
  tool?: string;
  autoSelect?: boolean;
  allowedServerIds?: string[];
}

interface MCPEdifactModifyParams {
  instruction: string;
  currentMessage: string;
  serverId?: string;
  tool?: string;
  autoSelect?: boolean;
  allowedServerIds?: string[];
}

export const api = {
  // Documents
  getDocuments: async (options?: { include_archived?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.include_archived) {
      params.append('include_archived', 'true');
    }
    const url = params.toString() ? `/documents?${params.toString()}` : '/documents';
    const { data } = await client.get(url);
    return data;
  },

  getSharedDocuments: async () => {
    const { data } = await client.get('/documents/shared/viewed');
    return data;
  },
  
  getDocument: async (id: string) => {
    const { data } = await client.get(`/documents/${id}`);
    return data;
  },
  
  createDocument: async (document: { title: string; content: string }) => {
    const { data } = await client.post('/documents', document);
    return data;
  },
  
  updateDocument: async (id: string, updates: any) => {
    const { data } = await client.put(`/documents/${id}`, updates);
    return data;
  },

  customizeDocument: async (id: string, customization: { background_color?: string | null; is_pinned?: boolean }) => {
    const { data } = await client.patch(`/documents/${id}/customize`, customization);
    return data;
  },

  archiveDocument: async (id: string) => {
    const { data } = await client.patch(`/documents/${id}/archive`);
    return data;
  },

  unarchiveDocument: async (id: string) => {
    const { data } = await client.patch(`/documents/${id}/unarchive`);
    return data;
  },
  
  deleteDocument: async (id: string) => {
    const { data } = await client.delete(`/documents/${id}`);
    return data;
  },

  // Document Versions
  getDocumentVersions: async (documentId: string) => {
    const { data } = await client.get(`/documents/${documentId}/versions`);
    return data.versions;
  },

  getDocumentVersion: async (documentId: string, versionId: string) => {
    const { data } = await client.get(`/documents/${documentId}/versions/${versionId}`);
    return data.version;
  },

  restoreDocumentVersion: async (documentId: string, versionId: string) => {
    const { data } = await client.post(`/documents/${documentId}/versions/${versionId}/restore`);
    return data.document;
  },
  
  // AI - using aiClient with longer timeout
  generateOutline: async (params: { topic: string; context?: string; depth?: number }) => {
    const { data } = await aiClient.post('/ai/generate-outline', params);
    return data;
  },
  
  expandSection: async (params: { documentId: string; section: string; instruction?: string }) => {
    const { data } = await aiClient.post('/ai/expand-section', params);
    return data;
  },
  
  improveText: async (params: { text: string; instruction?: string }) => {
    const { data } = await aiClient.post('/ai/improve-text', params);
    return data;
  },
  
  summarize: async (params: { documentId: string; length?: 'short' | 'medium' | 'long' }) => {
    const { data } = await aiClient.post('/ai/summarize', params);
    return data;
  },
  
  generateMermaid: async (params: { 
    documentId: string; 
    instruction: string; 
    diagramType?: 'flowchart' | 'sequence' | 'class' | 'state' | 'er' | 'gantt' | 'pie' | 'mindmap' | 'auto' 
  }) => {
    const { data } = await aiClient.post('/ai/generate-mermaid', params);
    return data;
  },
  
  chat: async (params: { documentId?: string; message: string; history?: any[] }) => {
    const { data } = await aiClient.post('/ai/chat', params);
    return data;
  },

  // AI Enhanced - Chat with MCP function calling
  chatWithMCP: async (params: { 
    message: string; 
    documentContext?: string; 
    artifactContext?: string;
    history?: any[] 
  }) => {
    const { data } = await aiClient.post('/ai-enhanced/chat-with-mcp', params);
    return data;
  },

  getMCPCapabilities: async () => {
    const { data } = await aiClient.get('/ai-enhanced/mcp-capabilities');
    return data;
  },
  
  // MCP server management
  getMcpServers: async () => {
    const { data } = await client.get<{ servers: MCPServerInfo[] }>('/mcp-generic/servers');
    return data;
  },

  createMcpServer: async (payload: MCPServerCreatePayload) => {
    const { data } = await client.post<{ server: MCPServerInfo }>('/mcp-servers', payload);
    return data;
  },

  updateMcpServer: async (id: string, payload: MCPServerUpdatePayload) => {
    const { data } = await client.put<{ server: MCPServerInfo }>(`/mcp-servers/${id}`, payload);
    return data;
  },

  setDefaultMcpServer: async (id: string) => {
    const { data } = await client.post<{ server: MCPServerInfo }>(`/mcp-servers/${id}/default`, {});
    return data;
  },

  deleteMcpServer: async (id: string) => {
    await client.delete(`/mcp-servers/${id}`);
  },

  // MCP - Search & Chat (using aiClient with longer timeout)
  mcpSearch: async (params: MCPSearchParams): Promise<MCPServerResponse> => {
    const payload = {
      query: params.query,
      limit: params.limit,
      collection: params.collection,
      serverId: params.serverId,
      tool: params.tool,
      autoSelect: params.autoSelect ?? !params.serverId,
      allowedServerIds: params.allowedServerIds,
    };
    const { data } = await aiClient.post<MCPServerResponse>('/mcp/search', payload);
    return data;
  },
  
  mcpChat: async (params: MCPChatParams): Promise<MCPServerResponse> => {
    const payload = {
      message: params.message,
      history: params.history,
      metadata: params.metadata,
      serverId: params.serverId,
      tool: params.tool,
      autoSelect: params.autoSelect ?? !params.serverId,
      allowedServerIds: params.allowedServerIds,
    };
    const { data } = await aiClient.post<MCPServerResponse>('/mcp/chat', payload);
    return data;
  },
  
  mcpReasoning: async (params: MCPReasoningParams): Promise<MCPServerResponse> => {
    const payload = {
      query: params.query,
      context: params.context,
      messages: params.messages,
      serverId: params.serverId,
      tool: params.tool,
      autoSelect: params.autoSelect ?? !params.serverId,
      allowedServerIds: params.allowedServerIds,
    };
    const { data } = await aiClient.post<MCPServerResponse>('/mcp/reasoning', payload);
    return data;
  },
  
  // EDIFACT Operations (using aiClient with longer timeout)
  edifactAnalyze: async (params: MCPEdifactParams): Promise<MCPServerResponse> => {
    const payload = {
      message: params.message,
      serverId: params.serverId,
      tool: params.tool,
      autoSelect: params.autoSelect ?? !params.serverId,
      allowedServerIds: params.allowedServerIds,
    };
    const { data } = await aiClient.post<MCPServerResponse>('/mcp/edifact/analyze', payload);
    return data;
  },
  
  edifactExplain: async (params: MCPEdifactParams): Promise<MCPServerResponse> => {
    const payload = {
      message: params.message,
      serverId: params.serverId,
      tool: params.tool,
      autoSelect: params.autoSelect ?? !params.serverId,
      allowedServerIds: params.allowedServerIds,
    };
    const { data } = await aiClient.post<MCPServerResponse>('/mcp/edifact/explain', payload);
    return data;
  },
  
  edifactValidate: async (params: MCPEdifactParams): Promise<MCPServerResponse> => {
    const payload = {
      message: params.message,
      serverId: params.serverId,
      tool: params.tool,
      autoSelect: params.autoSelect ?? !params.serverId,
      allowedServerIds: params.allowedServerIds,
    };
    const { data } = await aiClient.post<MCPServerResponse>('/mcp/edifact/validate', payload);
    return data;
  },
  
  edifactChat: async (params: MCPEdifactChatParams): Promise<MCPServerResponse> => {
    const payload = {
      message: params.message,
      edifactMessage: params.edifactMessage,
      history: params.history,
      serverId: params.serverId,
      tool: params.tool,
      autoSelect: params.autoSelect ?? !params.serverId,
      allowedServerIds: params.allowedServerIds,
    };
    const { data } = await aiClient.post<MCPServerResponse>('/mcp/edifact/chat', payload);
    return data;
  },
  
  edifactModify: async (params: MCPEdifactModifyParams): Promise<MCPServerResponse> => {
    const payload = {
      instruction: params.instruction,
      currentMessage: params.currentMessage,
      serverId: params.serverId,
      tool: params.tool,
      autoSelect: params.autoSelect ?? !params.serverId,
      allowedServerIds: params.allowedServerIds,
    };
    const { data } = await aiClient.post<MCPServerResponse>('/mcp/edifact/modify', payload);
    return data;
  },
  
  // Artifacts
  getArtifacts: async (documentId: string) => {
    const { data } = await client.get<{ artifacts: Artifact[] }>(`/documents/${documentId}/artifacts`);
    return data.artifacts;
  },

  getAllArtifacts: async () => {
    const { data } = await client.get<{ artifacts: Artifact[] }>(`/artifacts`);
    return data;
  },

  getArtifact: async (documentId: string, artifactId: string) => {
    const { data } = await client.get<{ artifact: Artifact }>(`/documents/${documentId}/artifacts/${artifactId}`);
    return data.artifact;
  },

  createArtifact: async (documentId: string, artifactData: CreateArtifactData) => {
    const { data } = await client.post<{ artifact: Artifact }>(`/documents/${documentId}/artifacts`, artifactData);
    return data.artifact;
  },

  updateArtifact: async (documentId: string, artifactId: string, updates: UpdateArtifactData) => {
    const { data } = await client.put<{ artifact: Artifact }>(`/documents/${documentId}/artifacts/${artifactId}`, updates);
    return data.artifact;
  },

  deleteArtifact: async (documentId: string, artifactId: string) => {
    const { data } = await client.delete<{ success: boolean }>(`/documents/${documentId}/artifacts/${artifactId}`);
    return data.success;
  },

  copyArtifact: async (documentId: string, artifactId: string, copyData: CopyArtifactData) => {
    const { data } = await client.post<{ artifact: Artifact; moved: boolean }>(`/documents/${documentId}/artifacts/${artifactId}/copy`, copyData);
    return data;
  },

  convertArtifactToDocument: async (documentId: string, artifactId: string, convertData: ConvertArtifactToDocumentData) => {
    const { data } = await client.post<{ document: Document }>(`/documents/${documentId}/artifacts/${artifactId}/convert-to-document`, convertData);
    return data.document;
  },

  embedArtifact: async (documentId: string, artifactId: string, position: 'start' | 'end' | number = 'end') => {
    const { data } = await client.post<{ success: boolean; content: string }>(`/documents/${documentId}/embed-artifact`, {
      artifactId,
      position,
    });
    return data;
  },
  
  // MCP Tool Hints
  getMCPHints: async () => {
    const { data } = await client.get<{ hints: MCPToolHint[] }>('/mcp-hints');
    return data.hints;
  },

  getMCPHintsByServer: async (serverId: string) => {
    const { data } = await client.get<{ hints: MCPToolHint[] }>(`/mcp-hints/server/${serverId}`);
    return data.hints;
  },

  createMCPHint: async (hintData: CreateMCPHintData) => {
    const { data } = await client.post<{ hint: MCPToolHint }>('/mcp-hints', hintData);
    return data.hint;
  },

  updateMCPHint: async (hintId: string, updates: UpdateMCPHintData) => {
    const { data } = await client.put<{ hint: MCPToolHint }>(`/mcp-hints/${hintId}`, updates);
    return data.hint;
  },

  deleteMCPHint: async (hintId: string) => {
    const { data } = await client.delete<{ success: boolean }>(`/mcp-hints/${hintId}`);
    return data.success;
  },

  createBulkMCPHints: async (hints: CreateMCPHintData[]) => {
    const { data } = await client.post<{ hints: MCPToolHint[] }>('/mcp-hints/bulk', { hints });
    return data.hints;
  },
  
  // Document Converter - Convert documents to presentations
  convertToPresentation: async (params: ConvertToPresentationParams): Promise<ConvertToPresentationResponse> => {
    const { data } = await aiClient.post<ConvertToPresentationResponse>('/converter/to-presentation', params);
    return data;
  },
  
  // Export
  exportDocument: async (params: { documentId: string; format: string; options?: any }) => {
    const { data } = await client.post('/export', params, {
      responseType: 'blob',
    });
    return data;
  },

  // Research Tools
  transformDocument: async (documentId: string, type: string, targetAudience?: string) => {
    const { data } = await aiClient.post(`/research/documents/${documentId}/transform`, {
      type,
      targetAudience,
    });
    return data;
  },

  transformContent: async (content: string, type: string, targetAudience?: string) => {
    const { data } = await aiClient.post('/research/transform', {
      content,
      type,
      targetAudience,
    });
    return data;
  },

  generatePodcastScript: async (content: string, numHosts: number = 2) => {
    const { data } = await aiClient.post('/research/podcast', {
      content,
      numHosts,
    });
    return data;
  },

  generateCitations: async (content: string, style: 'apa' | 'mla' | 'chicago' = 'apa') => {
    const { data } = await aiClient.post('/research/citations', {
      content,
      style,
    });
    return data;
  },

  generateResearchQuestions: async (content: string) => {
    const { data } = await aiClient.post('/research/questions', {
      content,
    });
    return data;
  },

  // Image Upload
  uploadImage: async (documentId: string, file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    formData.append('image', file);

    const { data } = await client.post(`/images/upload/${documentId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          onProgress(progress);
        }
      },
    });
    return data;
  },

  // File Upload - Upload and convert file to document
  uploadFile: async (file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);

    const { data } = await client.post('/converter/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          onProgress(progress);
        }
      },
    });
    return data;
  },

  getDocumentImages: async (documentId: string) => {
    const { data } = await client.get(`/images/document/${documentId}`);
    return data;
  },

  deleteImage: async (filename: string) => {
    const { data } = await client.delete(`/images/${filename}`);
    return data;
  },

  // Multi-Document AI Features
  chatWithDocument: async (params: {
    file: File;
    documentId?: string;
    message: string;
    history?: any[];
  }) => {
    const formData = new FormData();
    formData.append('file', params.file);
    if (params.documentId) formData.append('documentId', params.documentId);
    formData.append('message', params.message);
    if (params.history) formData.append('history', JSON.stringify(params.history));

    const { data } = await aiClient.post('/ai/chat-with-document', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data;
  },

  suggestChanges: async (params: {
    file: File;
    documentId: string;
    instruction?: string;
  }) => {
    const formData = new FormData();
    formData.append('file', params.file);
    formData.append('documentId', params.documentId);
    if (params.instruction) formData.append('instruction', params.instruction);

    const { data } = await aiClient.post('/ai/suggest-changes', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data;
  },

  applySuggestion: async (params: {
    documentId: string;
    suggestion: any;
    sectionIdentifier: string;
  }) => {
    const { data } = await aiClient.post('/ai/apply-suggestion', params);
    return data;
  },

  integrateSuggestions: async (params: {
    documentId: string;
    acceptedSuggestions: number[];
    suggestionsData: any;
  }) => {
    const { data } = await aiClient.post('/ai/integrate-suggestions', params);
    return data;
  },

  // Deep Research
  deepResearch: async (params: {
    documentId: string;
    query?: string;
    selectedText?: string;
    sectionContext?: string;
    searchScope: {
      web: boolean;
      mcp: string[];
    };
    maxSources?: number;
  }) => {
    const { data } = await aiClient.post('/ai/deep-research', params);
    return data;
  },

  researchBatch: async (params: {
    documentId: string;
    artifactIds: string[];
    researchQuery?: string;
    searchScope: {
      web: boolean;
      mcp: string[];
    };
  }) => {
    const { data } = await aiClient.post('/ai/research-batch', params);
    return data;
  },

  enrichSection: async (params: {
    documentId: string;
    selectedText: string;
    beforeContext?: string;
    afterContext?: string;
    enrichmentGoal: 'expand' | 'update' | 'fact-check' | 'add-sources';
    searchScope: {
      web: boolean;
      mcp: string[];
    };
  }) => {
    const { data } = await aiClient.post('/ai/enrich-section', params);
    return data;
  },

  // Document Relationships (Import/Fork/Sync)
  checkUpstreamUpdates: async (documentId: string) => {
    const { data } = await client.get(`/documents/${documentId}/upstream/check`);
    return data;
  },

  syncWithUpstream: async (documentId: string) => {
    const { data } = await client.post(`/documents/${documentId}/sync`);
    return data;
  },

  forkDocument: async (documentId: string) => {
    const { data } = await client.post(`/documents/${documentId}/fork`);
    return data;
  },

  createPullRequest: async (documentId: string, message: string) => {
    const { data } = await client.post(`/documents/${documentId}/pull-request`, { message });
    return data;
  },

  getPullRequests: async (documentId: string) => {
    const { data } = await client.get(`/documents/${documentId}/pull-requests`);
    return data;
  },

  acceptPullRequest: async (prId: string) => {
    const { data } = await client.post(`/documents/pull-requests/${prId}/accept`);
    return data;
  },

  rejectPullRequest: async (prId: string) => {
    const { data } = await client.post(`/documents/pull-requests/${prId}/reject`);
    return data;
  },
};
