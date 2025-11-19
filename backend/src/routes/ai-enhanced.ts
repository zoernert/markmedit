import { Router } from 'express';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { FunctionCall } from '@google/generative-ai';
import { config } from '../config/index.js';
import { listActiveMcpServers } from '../services/mcp-registry.js';
import { getMCPServer } from '../services/mcp-manager.js';
import { AppError } from '../middleware/errorHandler.js';
import { z } from 'zod';

export const aiEnhancedRoutes = Router();

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

const chatSchema = z.object({
  message: z.string().min(1),
  documentContext: z.string().optional(),
  artifactContext: z.string().optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'model', 'function', 'assistant']), // Accept 'assistant' from frontend
    parts: z.array(z.any()),
  })).optional(),
});

interface MCPToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: SchemaType;
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Clean JSON Schema property for Gemini compatibility
 * Removes fields that Gemini doesn't support
 */
function cleanSchemaProperty(prop: any): any {
  if (!prop || typeof prop !== 'object') {
    return prop;
  }

  const cleaned: any = {};

  // Only keep Gemini-compatible fields
  const allowedFields = ['type', 'description', 'enum', 'items', 'properties', 'required'];
  
  for (const key of allowedFields) {
    if (prop[key] !== undefined) {
      if (key === 'properties' && typeof prop[key] === 'object') {
        // Recursively clean nested properties
        cleaned[key] = {};
        for (const [propKey, propValue] of Object.entries(prop[key])) {
          cleaned[key][propKey] = cleanSchemaProperty(propValue);
        }
      } else if (key === 'items' && typeof prop[key] === 'object') {
        // Clean array item schema
        cleaned[key] = cleanSchemaProperty(prop[key]);
      } else {
        cleaned[key] = prop[key];
      }
    }
  }

  return cleaned;
}

/**
 * Build Gemini function declarations from discovered MCP tools
 */
async function buildMCPFunctionDeclarations(): Promise<MCPToolDeclaration[]> {
  const activeServers = listActiveMcpServers();
  const declarations: MCPToolDeclaration[] = [];

  for (const server of activeServers) {
    try {
      const client = getMCPServer(server.id);
      const toolsResponse = await client.listTools();

      const tools = Array.isArray(toolsResponse)
        ? toolsResponse
        : Array.isArray(toolsResponse?.tools)
          ? toolsResponse.tools
          : [];

      for (const tool of tools) {
        if (!tool || typeof tool !== 'object' || !tool.name) {
          continue;
        }

        const inputSchema = tool.inputSchema || tool.input_schema || {};
        const rawProperties = inputSchema.properties || {};
        const required = inputSchema.required || [];

        // Clean all properties to remove Gemini-incompatible fields
        const cleanedProperties: Record<string, any> = {};
        for (const [key, value] of Object.entries(rawProperties)) {
          cleanedProperties[key] = cleanSchemaProperty(value);
        }

        declarations.push({
          name: `${server.id}_${tool.name}`.replace(/[^a-zA-Z0-9_]/g, '_'),
          description: tool.description || `Tool from ${server.name}: ${tool.name}`,
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              ...cleanedProperties,
              _serverId: {
                type: SchemaType.STRING,
                description: `Server ID (always: ${server.id})`,
              },
              _toolName: {
                type: SchemaType.STRING,
                description: `Tool name (always: ${tool.name})`,
              },
            },
            required: [...required, '_serverId', '_toolName'],
          },
        });
      }
    } catch (error) {
      console.warn(`Failed to load tools from MCP server '${server.id}':`, error);
    }
  }

  return declarations;
}

/**
 * Execute MCP tool call from Gemini function call
 */
async function executeMCPToolCall(functionCall: any): Promise<any> {
  const { name, args } = functionCall;
  
  // Try to get serverId and toolName from args (preferred)
  let serverId = args._serverId;
  let toolName = args._toolName;

  // Fallback: Extract from function name (format: serverId_toolName)
  if (!serverId || !toolName) {
    // Function name format: "powabase_execute_query" or "willi_mako_semantic_search"
    const parts = name.split('_');
    
    if (parts.length >= 2) {
      // Try to match against known servers
      const servers = listActiveMcpServers();
      
      // Find the longest matching server ID prefix
      for (const server of servers) {
        const serverIdNormalized = server.id.replace(/[^a-zA-Z0-9_]/g, '_');
        const serverIdParts = serverIdNormalized.split('_');
        
        // Check if name starts with this server's ID
        if (parts.slice(0, serverIdParts.length).join('_') === serverIdNormalized) {
          serverId = server.id;
          toolName = parts.slice(serverIdParts.length).join('_');
          break;
        }
      }
    }
  }

  if (!serverId || !toolName) {
    throw new AppError(400, `Missing _serverId or _toolName in function call: ${name}`);
  }

  const client = getMCPServer(serverId);

  // Remove internal metadata fields
  const { _serverId: _, _toolName: __, ...toolParams } = args;

  console.log(`Executing MCP tool: ${serverId}/${toolName}`, toolParams);

  const result = await client.callTool(toolName, toolParams);

  return result;
}

/**
 * Enhanced chat endpoint with MCP function calling - Streaming version with SSE
 */
aiEnhancedRoutes.post('/chat-with-mcp-stream', async (req, res): Promise<void> => {
  if (!config.features.enableMCP) {
    throw new AppError(503, 'MCP not enabled');
  }

  const data = chatSchema.parse(req.body);

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendEvent('status', { message: 'Initializing MCP tools...', iteration: 0 });

    // Build function declarations from MCP tools
    const functionDeclarations = await buildMCPFunctionDeclarations();

    if (functionDeclarations.length === 0) {
      sendEvent('error', { message: 'No MCP tools available' });
      res.end();
      return;
    }

    sendEvent('status', { message: `${functionDeclarations.length} tools loaded`, iteration: 0 });

    const model = genAI.getGenerativeModel({
      model: config.gemini.model,
      tools: [{ functionDeclarations }],
    });

    // Analyze available tools to build intelligent prompt
    const availableToolTypes = {
      hasSemanticSearch: functionDeclarations.some(f => 
        f.name.includes('semantic') || f.description?.toLowerCase().includes('semantic search')
      ),
      hasChat: functionDeclarations.some(f => 
        f.name.includes('chat') && !f.name.includes('edifact')
      ),
      hasEDIFACT: functionDeclarations.some(f => 
        f.name.includes('edifact')
      ),
      hasReasoning: functionDeclarations.some(f => 
        f.name.includes('reasoning')
      ),
    };

    // Build balanced tool usage instructions with sufficient context
    const toolInstructions = [];
    
    if (availableToolTypes.hasSemanticSearch) {
      toolInstructions.push(`
📚 SEMANTISCHE SUCHE verfügbar:
   - Nutze diese bei JEDER Fachfrage zu Energiewirtschaft, bevor du antwortest
   - Suche nach relevanten Dokumenten, Richtlinien, Regelwerken
   - Auch bei Begriffen wie "Baukostenzuschuss", "§14a", "TAB", "Netzentgelte" → erst suchen!`);
    }

    if (availableToolTypes.hasChat) {
      toolInstructions.push(`
💬 CHAT-TOOL verfügbar:
   - Für komplexe Fachfragen mit Kontext-Verständnis
   - Nutze dies als Alternative oder Ergänzung zur semantischen Suche`);
    }

    if (availableToolTypes.hasEDIFACT) {
      toolInstructions.push(`
📄 EDIFACT-TOOLS verfügbar:
   - Für Analyse, Validierung, Erklärung von EDIFACT-Nachrichten`);
    }

    if (availableToolTypes.hasReasoning) {
      toolInstructions.push(`
🧠 REASONING-TOOL verfügbar:
   - Für mehrstufige Analysen und komplexe Problemlösungen`);
    }

    let systemPrompt = `Du bist ein intelligenter Assistent für die deutsche Energiewirtschaft mit Zugriff auf spezialisierte Wissensdatenbanken.

🔧 Verfügbare Tool-Kategorien:
${toolInstructions.join('\n')}

⚠️ WICHTIGSTE REGEL - Tool-First-Ansatz:
1. IMMER erst Tools befragen, bevor du eine Antwort aus deinem Trainingswissen gibst
2. Nutze Dokumentenkontext und Chat-Verlauf, um zu entscheiden, welche Tools relevant sind
3. Bei Unsicherheit: Lieber 2-3 Tools aufrufen als direkt zu antworten
4. Erst wenn ALLE relevanten Tools KEINE hilfreichen Informationen liefern, darfst du aus deinem Wissen antworten
5. Wenn du aus deinem Wissen antwortest, kennzeichne dies: "Basierend auf allgemeinem Wissen (nicht aus Datenbanken):"

🎯 Vorgehen bei Fragen:
1. Analysiere die Frage und den Kontext
2. Identifiziere relevante Tools
3. Rufe Tools auf - lieber zu viel als zu wenig!
4. Synthetisiere die Tool-Ergebnisse zu einer Antwort
5. Zitiere Quellen und Tool-Ergebnisse explizit

📊 MERMAID-DIAGRAMME (Mermaid 11.x):
Wenn du Mermaid-Diagramme erstellst, nutze die KORREKTE Syntax:

FALSCH (alte Syntax):
xychart-beta
    x-axis "Label" {
        type category
        categories [A, B]
    }
    bar "Serie" {
        data [1, 2]
    }

RICHTIG (Mermaid 11.x - FLACH):
xychart-beta
    title "Titel"
    x-axis [A, B, C]
    y-axis "Label" 0 --> 100
    bar [1, 2, 3]

KEINE geschweiften Klammern bei xychart-beta!

📝 DOKUMENTEN-BEARBEITUNG:
Wenn der User Änderungen am aktuellen Dokument möchte (z.B. "Arbeite ein...", "Füge hinzu...", "Ergänze...", "Ändere..."):
1. Du kannst das Dokument DIREKT bearbeiten - der vollständige Inhalt ist verfügbar!
2. Gib den VOLLSTÄNDIG AKTUALISIERTEN Dokumentinhalt in deiner Antwort zurück
3. Nutze YAML-Frontmatter für Metadaten (author, type, last_updated, etc.)
4. Beispiel-Struktur:
   \`\`\`markdown
   ---
   author: [Name]
   type: Living Document
   last_updated: 2025-11-13
   ---
   
   # Dokumenttitel
   
   [Dokumentinhalt...]
   \`\`\`
5. Erkläre kurz WELCHE Änderungen du vorgenommen hast
6. Der User kann deine Änderungen dann direkt ins Dokument übernehmen

Antworte IMMER auf Deutsch. Sei präzise und transparent über deine Informationsquellen.
`;

    const contextHints = [];
    
    if (data.documentContext && data.documentContext.length > 0) {
      const docLength = data.documentContext.length;
      contextHints.push(`📄 Vollständiges Dokument (${docLength} Zeichen) verfügbar - DU KANNST ES DIREKT BEARBEITEN!`);
    }
    
    if (data.artifactContext && data.artifactContext.length > 0) {
      const artifactLength = data.artifactContext.length;
      const artifactCount = data.artifactContext.split('---').length;
      contextHints.push(`📦 ${artifactCount} Artefakt(e) mit Inhalten (${artifactLength} Zeichen) verfügbar`);
    }
    
    if (contextHints.length > 0) {
      systemPrompt += `\n\n💡 Verfügbarer Kontext:\n${contextHints.map(h => `   - ${h}`).join('\n')}\n\nBei Fragen zu Dokumenten oder Artefakten nutze die Tools!\n---\n`;
    }

    // Convert 'assistant' role to 'model' for Gemini compatibility
    const geminiHistory = (data.history || []).map(msg => ({
      ...msg,
      role: msg.role === 'assistant' ? ('model' as const) : msg.role,
    }));

    // Debug logging
    console.log('[AI-Enhanced] Chat history length:', geminiHistory.length);
    if (geminiHistory.length > 0) {
      console.log('[AI-Enhanced] Last 2 history items:', geminiHistory.slice(-2).map(h => ({
        role: h.role,
        contentPreview: h.parts?.[0]?.text?.slice(0, 100) || 'no text'
      })));
    }

    const chat = model.startChat({
      history: geminiHistory,
    });

    // Prepend system prompt to user message
    let fullMessage = systemPrompt + '\n\n';
    
    // Append document context if available (CRITICAL: Must be included!)
    if (data.documentContext && data.documentContext.length > 0) {
      fullMessage += `📄 AKTUELLES DOKUMENT (vollständiger Inhalt):\n\`\`\`markdown\n${data.documentContext}\n\`\`\`\n\n`;
    }
    
    // Append artifact context if available
    if (data.artifactContext && data.artifactContext.length > 0) {
      fullMessage += `📦 VERFÜGBARE ARTEFAKTE (vollständiger Inhalt):\n${data.artifactContext}\n\n`;
    }
    
    // Add user message
    fullMessage += data.message;
    
    sendEvent('status', { message: 'Sending initial message to AI...', iteration: 0 });
    let result = await chat.sendMessage(fullMessage);
    let response = result.response;

    // Handle function calls with progress updates
    const maxIterations = 10;
    let iterations = 0;

    while (iterations < maxIterations) {
      const calls = response.functionCalls?.();
      
      if (!calls || calls.length === 0) {
        break;
      }

      iterations++;
      sendEvent('iteration', { 
        iteration: iterations, 
        toolCount: calls.length,
        tools: calls.map(c => c.name)
      });

      const functionResponses = await Promise.all(
        calls.map(async (fc: FunctionCall, index: number) => {
          try {
            sendEvent('tool-start', { 
              iteration: iterations,
              toolIndex: index + 1,
              toolTotal: calls.length,
              toolName: fc.name,
              args: fc.args
            });

            const toolResult = await executeMCPToolCall(fc);
            
            sendEvent('tool-complete', {
              iteration: iterations,
              toolIndex: index + 1,
              toolName: fc.name,
              success: true
            });

            return {
              functionResponse: {
                name: fc.name,
                response: toolResult,
              },
            };
          } catch (error) {
            console.error(`Function call ${fc.name} failed:`, error);
            
            sendEvent('tool-error', {
              iteration: iterations,
              toolIndex: index + 1,
              toolName: fc.name,
              error: error instanceof Error ? error.message : String(error)
            });

            return {
              functionResponse: {
                name: fc.name,
                response: {
                  error: error instanceof Error ? error.message : String(error),
                },
              },
            };
          }
        }),
      );

      sendEvent('status', { 
        message: `Processing AI response after ${calls.length} tool calls...`,
        iteration: iterations 
      });

      // Retry logic for Gemini API calls
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          result = await chat.sendMessage(functionResponses);
          response = result.response;
          break;
        } catch (error: any) {
          retryCount++;
          sendEvent('retry', {
            iteration: iterations,
            retryCount,
            maxRetries,
            error: error.message
          });
          
          if (retryCount >= maxRetries) {
            sendEvent('error', { 
              message: 'Max retries reached',
              partialResult: true 
            });
            const partialText = response.text() || 'Die Anfrage konnte nicht vollständig verarbeitet werden.';
            sendEvent('done', {
              response: partialText,
              history: await chat.getHistory(),
              toolCallsMade: iterations,
              partialResult: true,
            });
            res.end();
            return;
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
        }
      }
    }

    if (iterations >= maxIterations) {
      sendEvent('warning', { message: 'Max function call iterations reached' });
    }

    const finalText = response.text();
    const history = await chat.getHistory();

    sendEvent('done', {
      response: finalText,
      history,
      toolCallsMade: iterations,
    });

  } catch (error) {
    console.error('Streaming chat error:', error);
    sendEvent('error', { 
      message: error instanceof Error ? error.message : String(error) 
    });
  }

  res.end();
});

/**
 * Enhanced chat endpoint with MCP function calling - Original non-streaming version
 */
aiEnhancedRoutes.post('/chat-with-mcp', async (req, res): Promise<void> => {
  if (!config.features.enableMCP) {
    throw new AppError(503, 'MCP not enabled');
  }

  const data = chatSchema.parse(req.body);

  // Build function declarations from MCP tools
  const functionDeclarations = await buildMCPFunctionDeclarations();

  if (functionDeclarations.length === 0) {
    throw new AppError(503, 'No MCP tools available');
  }

  const model = genAI.getGenerativeModel({
    model: config.gemini.model,
    tools: [{ functionDeclarations }],
  });

  // Analyze available tools to build intelligent prompt
  const availableToolTypes = {
    hasSemanticSearch: functionDeclarations.some(f => 
      f.name.includes('semantic') || f.description?.toLowerCase().includes('semantic search')
    ),
    hasChat: functionDeclarations.some(f => 
      f.name.includes('chat') && !f.name.includes('edifact')
    ),
    hasEDIFACT: functionDeclarations.some(f => 
      f.name.includes('edifact')
    ),
    hasReasoning: functionDeclarations.some(f => 
      f.name.includes('reasoning')
    ),
  };

  // Build balanced tool usage instructions with sufficient context
  const toolInstructions = [];
  
  if (availableToolTypes.hasSemanticSearch) {
    toolInstructions.push(`
📚 SEMANTISCHE SUCHE verfügbar:
   - Nutze diese bei JEDER Fachfrage zu Energiewirtschaft, bevor du antwortest
   - Suche nach relevanten Dokumenten, Richtlinien, Regelwerken
   - Auch bei Begriffen wie "Baukostenzuschuss", "§14a", "TAB", "Netzentgelte" → erst suchen!`);
  }

  if (availableToolTypes.hasChat) {
    toolInstructions.push(`
💬 CHAT-TOOL verfügbar:
   - Für komplexe Fachfragen mit Kontext-Verständnis
   - Nutze dies als Alternative oder Ergänzung zur semantischen Suche`);
  }

  if (availableToolTypes.hasEDIFACT) {
    toolInstructions.push(`
📄 EDIFACT-TOOLS verfügbar:
   - Für Analyse, Validierung, Erklärung von EDIFACT-Nachrichten`);
  }

  if (availableToolTypes.hasReasoning) {
    toolInstructions.push(`
🧠 REASONING-TOOL verfügbar:
   - Für mehrstufige Analysen und komplexe Problemlösungen`);
  }

  let systemPrompt = `Du bist ein intelligenter Assistent für die deutsche Energiewirtschaft mit Zugriff auf spezialisierte Wissensdatenbanken.

🔧 Verfügbare Tool-Kategorien:
${toolInstructions.join('\n')}

⚠️ WICHTIGSTE REGEL - Tool-First-Ansatz:
1. IMMER erst Tools befragen, bevor du eine Antwort aus deinem Trainingswissen gibst
2. Nutze Dokumentenkontext und Chat-Verlauf, um zu entscheiden, welche Tools relevant sind
3. Bei Unsicherheit: Lieber 2-3 Tools aufrufen als direkt zu antworten
4. Erst wenn ALLE relevanten Tools KEINE hilfreichen Informationen liefern, darfst du aus deinem Wissen antworten
5. Wenn du aus deinem Wissen antwortest, kennzeichne dies: "Basierend auf allgemeinem Wissen (nicht aus Datenbanken):"

🎯 Vorgehen bei Fragen:
1. Analysiere die Frage und den Kontext
2. Identifiziere relevante Tools
3. Rufe Tools auf - lieber zu viel als zu wenig!
4. Synthetisiere die Tool-Ergebnisse zu einer Antwort
5. Zitiere Quellen und Tool-Ergebnisse explizit

📝 DOKUMENTEN-BEARBEITUNG:
Wenn der User Änderungen am aktuellen Dokument möchte (z.B. "Arbeite ein...", "Füge hinzu...", "Ergänze...", "Ändere..."):
1. Du kannst das Dokument DIREKT bearbeiten - der vollständige Inhalt ist verfügbar!
2. Gib den VOLLSTÄNDIG AKTUALISIERTEN Dokumentinhalt in deiner Antwort zurück
3. Nutze YAML-Frontmatter für Metadaten (author, type, last_updated, etc.)
4. Beispiel-Struktur:
   \`\`\`markdown
   ---
   author: [Name]
   type: Living Document
   last_updated: 2025-11-13
   ---
   
   # Dokumenttitel
   
   [Dokumentinhalt...]
   \`\`\`
5. Erkläre kurz WELCHE Änderungen du vorgenommen hast
6. Der User kann deine Änderungen dann direkt ins Dokument übernehmen

Antworte IMMER auf Deutsch. Sei präzise und transparent über deine Informationsquellen.
`;

  // Add available context hints
  const contextHints = [];
  
  if (data.documentContext && data.documentContext.length > 0) {
    const docLength = data.documentContext.length;
    contextHints.push(`📄 Vollständiges Dokument (${docLength} Zeichen) verfügbar - DU KANNST ES DIREKT BEARBEITEN!`);
  }
  
  if (data.artifactContext && data.artifactContext.length > 0) {
    const artifactLength = data.artifactContext.length;
    const artifactCount = data.artifactContext.split('---').length;
    contextHints.push(`📦 ${artifactCount} Artefakt(e) mit Inhalten (${artifactLength} Zeichen) verfügbar`);
  }
  
  if (contextHints.length > 0) {
    systemPrompt += `\n\n💡 Verfügbarer Kontext:\n${contextHints.map(h => `   - ${h}`).join('\n')}\n\nBei Fragen zu Dokumenten oder Artefakten nutze die Tools!\n---\n`;
  }

  // Convert 'assistant' role to 'model' for Gemini compatibility
  const geminiHistory = (data.history || []).map(msg => ({
    ...msg,
    role: msg.role === 'assistant' ? ('model' as const) : msg.role,
  }));

  // Debug logging
  console.log('[Streaming] Chat history length:', geminiHistory.length);
  if (geminiHistory.length > 0) {
    console.log('[Streaming] Last 2 history items:', geminiHistory.slice(-2).map(h => ({
      role: h.role,
      contentPreview: h.parts?.[0]?.text?.slice(0, 100) || 'no text'
    })));
  }

  const chat = model.startChat({
    history: geminiHistory,
  });

  // Prepend system prompt to user message
  // Frontend now sends: "Intent: ... Kontext: ... Frage: ..."
  // Backend adds: Tool-aware system prompt + available contexts
  let fullMessage = systemPrompt + '\n\n';
  
  // Append document context if available (CRITICAL: Must be included!)
  if (data.documentContext && data.documentContext.length > 0) {
    fullMessage += `📄 AKTUELLES DOKUMENT (vollständiger Inhalt):\n\`\`\`markdown\n${data.documentContext}\n\`\`\`\n\n`;
  }
  
  // Append artifact context if available (full content for AI to process)
  if (data.artifactContext && data.artifactContext.length > 0) {
    fullMessage += `📦 VERFÜGBARE ARTEFAKTE (vollständiger Inhalt):\n${data.artifactContext}\n\n`;
  }
  
  // Add user message
  fullMessage += data.message;
  
  let result = await chat.sendMessage(fullMessage);
  let response = result.response;

  // Handle function calls with retry logic
  const maxIterations = 10;
  let iterations = 0;

  while (iterations < maxIterations) {
    const calls = response.functionCalls?.();
    
    if (!calls || calls.length === 0) {
      break;
    }

    iterations++;

    const functionResponses = await Promise.all(
      calls.map(async (fc: FunctionCall) => {
        try {
          const toolResult = await executeMCPToolCall(fc);
          return {
            functionResponse: {
              name: fc.name,
              response: toolResult,
            },
          };
        } catch (error) {
          console.error(`Function call ${fc.name} failed:`, error);
          return {
            functionResponse: {
              name: fc.name,
              response: {
                error: error instanceof Error ? error.message : String(error),
              },
            },
          };
        }
      }),
    );

    // Retry logic for Gemini API calls (network failures, rate limits)
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        result = await chat.sendMessage(functionResponses);
        response = result.response;
        break; // Success
      } catch (error: any) {
        retryCount++;
        console.error(`Gemini API call failed (attempt ${retryCount}/${maxRetries}):`, error.message);
        
        if (retryCount >= maxRetries) {
          // Last retry failed - return partial results
          console.error('Max retries reached, returning partial results');
          const partialText = response.text() || 'Die Anfrage konnte nicht vollständig verarbeitet werden. Bitte versuche es mit einer spezifischeren Frage erneut.';
          res.json({
            response: partialText,
            history: await chat.getHistory(),
            toolCallsMade: iterations,
            partialResult: true,
          });
          return;
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
      }
    }
  }

  if (iterations >= maxIterations) {
    console.warn('Max function call iterations reached');
  }

  const finalText = response.text();
  const history = await chat.getHistory();

  res.json({
    response: finalText,
    history,
    toolCallsMade: iterations,
  });
});

/**
 * Get available MCP capabilities for display
 */
aiEnhancedRoutes.get('/mcp-capabilities', async (_req, res) => {
  if (!config.features.enableMCP) {
    throw new AppError(503, 'MCP not enabled');
  }

  const activeServers = listActiveMcpServers();
  const capabilities = await Promise.all(
    activeServers.map(async (server) => {
      try {
        const client = getMCPServer(server.id);
        const toolsResponse = await client.listTools();

        const tools = Array.isArray(toolsResponse)
          ? toolsResponse
          : Array.isArray(toolsResponse?.tools)
            ? toolsResponse.tools
            : [];

        return {
          id: server.id,
          name: server.name,
          description: server.description,
          toolCount: tools.length,
          tools: tools.map((t: any) => ({
            name: t.name,
            description: t.description,
          })),
        };
      } catch (error) {
        return {
          id: server.id,
          name: server.name,
          description: server.description,
          toolCount: 0,
          tools: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  res.json({ capabilities });
});
