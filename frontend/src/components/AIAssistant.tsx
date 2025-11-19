import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../lib/api';
import { useStreamingChat } from '../hooks/useStreamingChat';
import { ChatProgressIndicator } from './ChatProgressIndicator';
import { DocumentSelector, DocumentSource } from './DocumentSelector';
import { DocumentSuggestions } from './DocumentSuggestions';

type IntentMode = 'exploration' | 'structuring' | 'editing' | 'proofreading' | 'supplementing' | 'revision' | 'summarizing';
type AIBackend = 'mcp' | 'gemini';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  intent?: IntentMode;
  backend?: AIBackend;
  serverName?: string;
  serverTool?: string;
  timestamp: number;
}

interface AIAssistantProps {
  documentId: string;
  selectedText?: string;
  documentContent?: string; // Full document content for better context
  onInsert: (text: string) => void;
  onUpdateDocument?: (content: string) => void; // For updating the entire document
  onClose?: () => void;
  selectedArtifactIds?: string[];
}

const INTENT_LABELS: Record<IntentMode, { label: string; icon: string; color: string }> = {
  exploration: { label: 'Wissen sammeln', icon: '🔍', color: 'bg-blue-600' },
  structuring: { label: 'Strukturierung', icon: '📋', color: 'bg-purple-600' },
  editing: { label: 'Bearbeiten', icon: '✏️', color: 'bg-green-600' },
  proofreading: { label: 'Lektorat', icon: '📝', color: 'bg-yellow-600' },
  supplementing: { label: 'Ergänzung', icon: '➕', color: 'bg-cyan-600' },
  revision: { label: 'Überarbeitung', icon: '🔄', color: 'bg-orange-600' },
  summarizing: { label: 'Zusammenfassung', icon: '📊', color: 'bg-indigo-600' },
};

export function detectIntentByMessage(
  message: string,
  selectedText?: string,
  fallbackIntent: IntentMode = 'exploration',
): IntentMode {
  const lowerMsg = message.toLowerCase();

  if (/(korrigiere|korrektur|fehler|rechtschreibung|grammatik|lektorat|prüfe)/i.test(lowerMsg)) {
    return 'proofreading';
  }

  if (/(zusammenfass|summary|kurz|überblick|tldr)/i.test(lowerMsg)) {
    return 'summarizing';
  }

  if (/(struktur|glieder|kapitel|aufbau|organisier|diagramm|mermaid|flowchart|mindmap|visualisier)/i.test(lowerMsg)) {
    return 'structuring';
  }

  if (/(änder|bearbeit|edit|umschreib|verbessere)/i.test(lowerMsg)) {
    return 'editing';
  }

  if (/(überarbeit|revis|refactor|neuschreib)/i.test(lowerMsg)) {
    return 'revision';
  }

  if (/(ergänz|erweitere|füge.*hinzu|mehr|ausführlich|arbeite.*ein)/i.test(lowerMsg)) {
    return 'supplementing';
  }

  if (/(was ist|warum|wie|erkläre|erklär|info|wissen|lerne)/i.test(lowerMsg)) {
    return 'exploration';
  }

  if (selectedText && selectedText.length > 0) {
    return 'editing';
  }

  return fallbackIntent;
}

type ChatMutationResult = {
  content: string;
  intent: IntentMode;
  backend: AIBackend;
  serverInfo?: {
    name: string;
    tool?: string;
  };
};

export function AIAssistant({ documentId: _documentId, selectedText, documentContent, onInsert, onUpdateDocument, onClose, selectedArtifactIds }: AIAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [currentIntent, setCurrentIntent] = useState<IntentMode>('exploration');
  const [saveArtifactContent, setSaveArtifactContent] = useState<string | null>(null);
  const [artifactTitle, setArtifactTitle] = useState('');
  const [useStreaming, setUseStreaming] = useState(true); // Enable streaming by default
  
  // Multi-document source state (upload, existing doc, or artifact)
  const [documentSource, setDocumentSource] = useState<DocumentSource | null>(null);
  const [suggestionsData, setSuggestionsData] = useState<any>(null);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<number>>(new Set());
  const [rejectedSuggestions, setRejectedSuggestions] = useState<Set<number>>(new Set());
  const [isApplyingSuggestions, setIsApplyingSuggestions] = useState(false);
  const [isAnalyzingDocument, setIsAnalyzingDocument] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Streaming chat hook
  const streamingChat = useStreamingChat({
    onComplete: (result) => {
      setMessages(prev => [
        ...prev.slice(0, -1), // Remove "assistant is typing" message
        {
          role: 'assistant',
          content: result.response,
          backend: 'mcp',
          timestamp: Date.now(),
        },
      ]);
    },
    onError: (error) => {
      setMessages(prev => [
        ...prev.slice(0, -1), // Remove "assistant is typing" message
        {
          role: 'assistant',
          content: `❌ Fehler bei der KI-Anfrage: ${error}`,
          backend: 'mcp',
          timestamp: Date.now(),
        },
      ]);
    },
  });

  // Fetch artifacts to get their content
  const { data: artifacts } = useQuery({
    queryKey: ['artifacts', _documentId],
    queryFn: () => api.getArtifacts(_documentId),
  });

  // Build artifact context from selected IDs
  const artifactContext = selectedArtifactIds && selectedArtifactIds.length > 0 && artifacts
    ? artifacts
        .filter(a => selectedArtifactIds.includes(a.id.toString()))
        .map(a => `**${a.title}**:\n${a.content}`)
        .join('\n\n---\n\n')
    : null;

  // Fetch MCP capabilities for dynamic display
  const { data: mcpCapabilities } = useQuery({
    queryKey: ['mcp-capabilities'],
    queryFn: async () => {
      try {
        return await api.getMCPCapabilities();
      } catch (error) {
        console.warn('Failed to fetch MCP capabilities:', error);
        return null;
      }
    },
    staleTime: 60000, // Cache for 1 minute
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const detectIntent = (message: string): IntentMode =>
    detectIntentByMessage(message, selectedText, currentIntent);

  const chatMutation = useMutation<ChatMutationResult, unknown, string>({
    mutationFn: async (userMessage: string) => {
      const intent = detectIntent(userMessage);
      setCurrentIntent(intent);

      // Add user message
      const userMsg: Message = {
        role: 'user',
        content: userMessage,
        intent,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMsg]);

      // Check if we have a document source for multi-document chat
      if (documentSource) {
        try {
          const chatHistory = messages.map(m => ({
            role: m.role,
            parts: [{ text: m.content }],
          }));

          let result;
          const sourceName = documentSource.name;

          // Handle different source types
          if (documentSource.type === 'upload') {
            result = await api.chatWithDocument({
              file: documentSource.file,
              documentId: _documentId,
              message: userMessage,
              history: chatHistory,
            });
          } else if (documentSource.type === 'existing') {
            // Fetch the existing document content
            const doc = await api.getDocument(documentSource.documentId);
            // Create a virtual file from document content
            const blob = new Blob([doc.content], { type: 'text/markdown' });
            const file = new File([blob], `${doc.title}.md`, { type: 'text/markdown' });
            result = await api.chatWithDocument({
              file,
              documentId: _documentId,
              message: userMessage,
              history: chatHistory,
            });
          } else if (documentSource.type === 'artifact') {
            // Fetch the artifact content
            const artifacts = await api.getArtifacts(documentSource.documentId);
            const artifact = artifacts.find((a: any) => a.id === documentSource.artifactId);
            if (artifact) {
              // Create a virtual file from artifact content
              const blob = new Blob([artifact.content], { type: 'text/markdown' });
              const file = new File([blob], `${artifact.title}.md`, { type: 'text/markdown' });
              result = await api.chatWithDocument({
                file,
                documentId: _documentId,
                message: userMessage,
                history: chatHistory,
              });
            }
          }

          if (result) {
            const assistantMsg: Message = {
              role: 'assistant',
              content: result.response,
              backend: 'mcp',
              timestamp: Date.now(),
            };
            setMessages(prev => [...prev, assistantMsg]);

            return {
              content: result.response,
              intent,
              backend: 'mcp' as AIBackend,
              serverInfo: {
                name: 'Multi-Document Analysis',
                tool: `with ${sourceName}`,
              },
            };
          }
        } catch (error: any) {
          const errorMsg: Message = {
            role: 'assistant',
            content: `❌ Fehler beim Multi-Dokument-Chat: ${error.message || 'Unbekannter Fehler'}`,
            backend: 'mcp',
            timestamp: Date.now(),
          };
          setMessages(prev => [...prev, errorMsg]);
          throw error;
        }
      }

      // Build comprehensive context for AI - balanced detail level
      const contextParts = [];
      
      // 1. Document context (selected or summary)
      if (selectedText && selectedText.trim()) {
        contextParts.push(`📄 Ausgewählter Textabschnitt:\n\`\`\`\n${selectedText}\n\`\`\``);
      } else if (documentContent && documentContent.trim()) {
        // Send meaningful summary with document beginning for context
        const wordCount = documentContent.split(/\s+/).length;
        const firstLines = documentContent.split('\n').slice(0, 3).join('\n').slice(0, 200);
        contextParts.push(`📄 Dokument: ${wordCount} Wörter\nBeginn: ${firstLines}...`);
      }
      
      // 2. Artifact context - send full content for selected artifacts
      if (artifactContext) {
        contextParts.push(`📦 Ausgewählte Artefakte:\n${artifactContext}`);
      }
      
      // Note: Chat history is automatically included via the 'history' parameter
      // No need to duplicate it here - Gemini has full access to previous messages
      
      const fullContext = contextParts.length > 0 
        ? contextParts.join('\n\n')
        : 'Kein spezifischer Kontext verfügbar.';

      // Build intent-specific instruction (NOT full system prompt - backend adds that)
      const intentInstructions: Record<IntentMode, string> = {
        exploration: 'Beantworte ausführlich und verständlich mit Hintergrundwissen.',
        structuring: 'Hilf bei Organisation und Gliederung, schlage klare Strukturen vor.',
        editing: 'Verbessere den Text direkt und erkläre kurz deine Änderungen.',
        proofreading: 'Finde und korrigiere Rechtschreib-, Grammatik- und Stilfehler.',
        supplementing: 'Füge relevante Informationen, Beispiele oder Details hinzu.',
        revision: 'Analysiere den Text und schlage umfassende Verbesserungen vor.',
        summarizing: 'Extrahiere die Kernaussagen und fasse prägnant zusammen.',
      };

      const intentInstruction = intentInstructions[intent];

      // Always use MCP-enhanced chat with function calling
      // Gemini will decide which tools to use (if any) based on the question
      const backend: AIBackend = 'mcp';
      
      // Use streaming or traditional mode based on user preference
      if (useStreaming) {
        // Build chat history WITHOUT intent/context prefixes
        // (those are only for the current request, not for history)
        const chatHistory = messages.map(m => ({
          role: m.role,
          parts: [{ text: m.content }],
        }));

        // Add a placeholder "assistant is typing" message
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: '...',
            backend: 'mcp',
            timestamp: Date.now(),
          },
        ]);

        // Send via streaming endpoint
        // IMPORTANT: If text is selected, use ONLY the selection as context, not the full document
        const contextToSend = selectedText && selectedText.trim() 
          ? selectedText 
          : (documentContent || '');
        
        await streamingChat.sendMessage({
          message: `Intent: ${intentInstruction}\n\nKontext: ${fullContext}\n\nFrage: ${userMessage}`,
          documentContext: contextToSend,
          artifactContext: artifactContext || undefined,
          history: chatHistory,
        });

        // Response will be added by onComplete callback
        return {
          content: '', // Not used in streaming mode
          intent,
          backend,
          serverInfo: {
            name: 'MCP Streaming',
            tool: 'streaming with progress',
          },
        };
      } else {
        // Traditional non-streaming mode
        const chatHistory = messages.map(m => ({
          role: m.role,
          parts: [{ text: m.content }],
        }));
        
        // IMPORTANT: If text is selected, use ONLY the selection as context, not the full document
        const contextToSend = selectedText && selectedText.trim() 
          ? selectedText 
          : (documentContent || '');
        
        const response = await api.chatWithMCP({
          message: `Intent: ${intentInstruction}\n\nKontext: ${fullContext}\n\nFrage: ${userMessage}`,
          documentContext: contextToSend,
          artifactContext: artifactContext || undefined,
          history: chatHistory,
        });

        return {
          content: response.response,
          intent,
          backend,
          serverInfo: {
            name: 'MCP Function Calling',
            tool: response.toolCallsMade > 0 ? `${response.toolCallsMade} tool calls` : 'direct response',
          },
        };
      }
    },
    onSuccess: (data) => {
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.content,
        intent: data.intent,
        backend: data.backend,
        serverName: data.serverInfo?.name,
        serverTool: data.serverInfo?.tool,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      setInput('');
    },
    onError: (error) => {
      console.error('AI chat failed:', error);
      const errorMsg: Message = {
        role: 'assistant',
        content: '❌ Fehler bei der KI-Anfrage. Bitte versuche es erneut.',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    },
  });

  const handleSend = () => {
    if (!input.trim()) return;
    
    // Prevent sending if either mutation or streaming is in progress
    if (chatMutation.isPending || streamingChat.isProcessing) return;
    
    // In streaming mode, the mutation is only used to trigger the flow
    // The actual response will be handled by streaming callbacks
    chatMutation.mutate(input);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInsert = (content: string) => {
    onInsert(content);
  };

  // Mutation for creating artifacts
  const createArtifactMutation = useMutation({
    mutationFn: (data: { title: string; content: string }) =>
      api.createArtifact(_documentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts', _documentId] });
      setSaveArtifactContent(null);
      setArtifactTitle('');
    },
  });

  const handleSaveAsArtifact = (content: string) => {
    setSaveArtifactContent(content);
  };

  const handleConfirmSaveArtifact = () => {
    if (saveArtifactContent && artifactTitle.trim()) {
      createArtifactMutation.mutate({
        title: artifactTitle.trim(),
        content: saveArtifactContent,
      });
    }
  };

  const handleCancelSaveArtifact = () => {
    setSaveArtifactContent(null);
    setArtifactTitle('');
  };

  // Handler for applying accepted suggestions
  const handleApplySuggestions = async () => {
    if (!suggestionsData || acceptedSuggestions.size === 0) return;
    
    setIsApplyingSuggestions(true);
    
    try {
      // Use the new integration endpoint to directly update the document
      const result = await api.integrateSuggestions({
        documentId: _documentId,
        acceptedSuggestions: Array.from(acceptedSuggestions),
        suggestionsData,
      });

      // Update the document content in the editor if callback is provided
      if (onUpdateDocument && result.updatedContent) {
        onUpdateDocument(result.updatedContent);
      }

      // Add success message
      setMessages(prev => [...prev, 
        {
          role: 'user',
          content: `✨ Wende ${acceptedSuggestions.size} akzeptierte Änderungen an`,
          timestamp: Date.now(),
        },
        {
          role: 'assistant',
          content: `✅ ${result.message}\n\nDas Dokument wurde automatisch aktualisiert. Du kannst die Änderungen im Editor sehen.`,
          backend: 'mcp',
          timestamp: Date.now(),
        }
      ]);

      // Clear suggestions after applying
      setSuggestionsData(null);
      setAcceptedSuggestions(new Set());
      setRejectedSuggestions(new Set());
      
      // Invalidate document query to refresh
      queryClient.invalidateQueries({ queryKey: ['document', _documentId] });
      
    } catch (error: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Fehler beim Anwenden der Änderungen: ${error.message}`,
        backend: 'mcp',
        timestamp: Date.now(),
      }]);
    } finally {
      setIsApplyingSuggestions(false);
    }
  };

  const getCurrentModeInfo = () => INTENT_LABELS[currentIntent];

  return (
    <div className="flex flex-col h-full bg-gray-800">
      {/* Header with Mode Indicator */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-semibold">✨ KI-Assistent</h3>
          <div className="flex items-center gap-2">
            {/* Streaming Toggle */}
            <button
              onClick={() => setUseStreaming(!useStreaming)}
              className={`text-xs px-2 py-1 rounded ${
                useStreaming ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
              } hover:opacity-80 transition-opacity`}
              title={useStreaming ? 'Live-Progress aktiviert' : 'Standard-Modus'}
            >
              {useStreaming ? '📡 Live' : '⏱️ Normal'}
            </button>
            {onClose && (
              <button onClick={onClose} className="text-gray-400 hover:text-white">
                ✕
              </button>
            )}
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs text-white ${getCurrentModeInfo().color} inline-block mb-2`}>
          {getCurrentModeInfo().icon} {getCurrentModeInfo().label}
        </div>
        {selectedText && (
          <div className="text-xs text-gray-400 bg-gray-700 p-2 rounded mb-2">
            📌 {selectedText.length} Zeichen ausgewählt
          </div>
        )}
        
        {/* Multi-Document Selector */}
        <DocumentSelector
          currentDocumentId={_documentId}
          selectedSource={documentSource}
          onSourceSelect={(source) => {
            setDocumentSource(source);
            setSuggestionsData(null); // Reset suggestions when new source is selected
            setAcceptedSuggestions(new Set());
            setRejectedSuggestions(new Set());
          }}
          onRemove={() => {
            setDocumentSource(null);
            setSuggestionsData(null);
            setAcceptedSuggestions(new Set());
            setRejectedSuggestions(new Set());
          }}
          disabled={chatMutation.isPending}
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Streaming Progress Indicator */}
        {useStreaming && streamingChat.isProcessing && (
          <ChatProgressIndicator progress={streamingChat.progress} />
        )}

        {/* Document Suggestions */}
        {suggestionsData && (() => {
          console.log('[AIAssistant] Rendering DocumentSuggestions, data:', suggestionsData);
          return (
            <div className="mb-4">
              <DocumentSuggestions
                data={suggestionsData}
                acceptedIndices={acceptedSuggestions}
                rejectedIndices={rejectedSuggestions}
                onAccept={(_suggestion, index) => {
                  setAcceptedSuggestions(prev => new Set([...prev, index]));
                }}
                onReject={(index) => {
                  setRejectedSuggestions(prev => new Set([...prev, index]));
                }}
                onRequestDetails={(suggestion, _index) => {
                  // Add a message asking for more details about this suggestion
                  const message = `Bitte erkläre mir genauer, warum die Änderung in "${suggestion.section}" sinnvoll ist und zeige mir eine ausführlichere Vorschau.`;
                  setInput(message);
                }}
                onApplyAll={handleApplySuggestions}
                isApplying={isApplyingSuggestions}
              />
            </div>
          );
        })()}

        {messages.length === 0 ? (
          <div className="text-center text-gray-400 mt-8">
            <p className="mb-2">💬 Stelle eine Frage zum Dokument</p>
            <p className="text-xs mb-3">Ich erkenne automatisch, ob du erkunden, strukturieren, bearbeiten oder zusammenfassen möchtest.</p>
            <div className="text-xs bg-gray-700 p-3 rounded-lg">
              <p className="mb-2 font-semibold text-gray-300">🧠 Intelligente Backend-Auswahl:</p>
              {mcpCapabilities?.capabilities && mcpCapabilities.capabilities.length > 0 ? (
                <>
                  <p className="mb-1">
                    <span className="text-green-400">⚡ MCP Services</span> ({mcpCapabilities.capabilities.length} aktiv):
                  </p>
                  <ul className="ml-4 mb-2 space-y-0.5">
                    {mcpCapabilities.capabilities.map((cap: any) => (
                      <li key={cap.id} className="text-gray-400">
                        • {cap.name} ({cap.toolCount} Tools) - {cap.description}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mb-1"><span className="text-green-400">⚡ MCP Services</span> für Energiemarkt-Themen (EDIFACT, BDEW, EnWG, etc.)</p>
              )}
              <p><span className="text-purple-400">🤖 Google Gemini</span> für allgemeine Textbearbeitung & Zusammenfassungen</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.role === 'user' ? 'bg-blue-600' : 'bg-gray-700'} rounded-lg p-3`}>
                {msg.role === 'assistant' && (msg.intent || msg.backend || msg.serverName) && (
                  <div className="text-xs text-gray-300 mb-2 flex items-center gap-2 flex-wrap">
                    {msg.intent && (
                      <span className={`px-2 py-0.5 rounded ${INTENT_LABELS[msg.intent].color} text-white`}>
                        {INTENT_LABELS[msg.intent].icon} {INTENT_LABELS[msg.intent].label}
                      </span>
                    )}
                    {msg.backend && (
                      <span className={`px-2 py-0.5 rounded text-white ${
                        msg.backend === 'mcp' ? 'bg-green-700' : 'bg-purple-700'
                      }`}>
                        {msg.backend === 'mcp' ? '⚡ MCP' : '🤖 Gemini'}
                      </span>
                    )}
                    {msg.backend === 'mcp' && msg.serverName && (
                      <span className="px-2 py-0.5 rounded bg-gray-600 text-white">
                        {msg.serverName}{msg.serverTool ? ` • ${msg.serverTool}` : ''}
                      </span>
                    )}
                  </div>
                )}
                <div className="text-white text-sm prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // Custom link styling
                      a: ({ node, ...props }) => (
                        <a {...props} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer" />
                      ),
                      // Custom code block styling
                      code: ({ node, className, children, ...props }) => {
                        const match = /language-(\w+)/.exec(className || '');
                        return match ? (
                          <pre className="bg-gray-900 rounded p-2 overflow-x-auto">
                            <code className={className} {...props}>
                              {children}
                            </code>
                          </pre>
                        ) : (
                          <code className="bg-gray-600 px-1 py-0.5 rounded text-xs" {...props}>
                            {children}
                          </code>
                        );
                      },
                      // Custom list styling
                      ul: ({ node, ...props }) => (
                        <ul {...props} className="list-disc list-inside space-y-1" />
                      ),
                      ol: ({ node, ...props }) => (
                        <ol {...props} className="list-decimal list-inside space-y-1" />
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
                {msg.role === 'assistant' && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => handleInsert(msg.content)}
                      className="text-xs text-blue-300 hover:text-blue-200 flex items-center gap-1"
                    >
                      ➕ An Cursor einfügen
                    </button>
                    <button
                      onClick={() => navigator.clipboard.writeText(msg.content)}
                      className="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1"
                    >
                      📋 Kopieren
                    </button>
                    <button
                      onClick={() => handleSaveAsArtifact(msg.content)}
                      className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1"
                    >
                      📦 Als Artefakt speichern
                    </button>
                  </div>
                )}
              </div>
            </div>
            ))}
            
            {/* Loading indicator */}
            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="max-w-[85%] bg-gray-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-300">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    <span className="text-sm">Denke nach...</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700">
        {/* Help text when artifacts are selected */}
        {selectedArtifactIds && selectedArtifactIds.length > 0 && (
          <div className="mb-3 text-xs bg-blue-900/30 border border-blue-700/50 rounded p-2">
            💡 <strong>{selectedArtifactIds.length} Artefakt{selectedArtifactIds.length > 1 ? 'e' : ''} ausgewählt</strong> - Stelle direkt Fragen, die Artefakte sind im Kontext verfügbar.
          </div>
        )}
        
        {/* Quick Actions */}
        <div className="mb-3 flex flex-wrap gap-2">
          {/* Multi-Document Quick Actions (show when ANY source is selected) */}
          {documentSource && (
            <>
              <button
                onClick={async () => {
                  if (!_documentId || !documentSource) return;
                  setIsAnalyzingDocument(true);
                  try {
                    // Create virtual file for existing documents and artifacts
                    let file: File;
                    
                    if (documentSource.type === 'upload') {
                      file = documentSource.file;
                    } else if (documentSource.type === 'existing') {
                      // Fetch the existing document content
                      const doc = await api.getDocument(documentSource.documentId);
                      const blob = new Blob([doc.content], { type: 'text/markdown' });
                      file = new File([blob], `${doc.title}.md`, { type: 'text/markdown' });
                    } else if (documentSource.type === 'artifact') {
                      // Fetch the artifact content
                      const artifacts = await api.getArtifacts(documentSource.documentId);
                      const artifact = artifacts.find((a: any) => a.id === documentSource.artifactId);
                      if (!artifact) {
                        throw new Error('Artifact not found');
                      }
                      const blob = new Blob([artifact.content], { type: 'text/markdown' });
                      file = new File([blob], `${artifact.title}.md`, { type: 'text/markdown' });
                    } else {
                      throw new Error('Unknown source type');
                    }
                    
                    const result = await api.suggestChanges({
                      file,
                      documentId: _documentId,
                    });
                    
                    console.log('[AIAssistant] Received suggestions result:', result);
                    console.log('[AIAssistant] Suggestions count:', result.suggestions?.length);
                    
                    setSuggestionsData(result);
                    
                    // Check if document was chunked
                    const chunkInfo = result.chunked 
                      ? ` (Dokument wurde in ${result.chunkCount} Teile aufgeteilt für die Analyse)`
                      : '';
                    
                    setMessages(prev => [...prev, {
                      role: 'assistant',
                      content: `📋 Ich habe ${result.suggestions?.length || 0} Änderungsvorschläge basierend auf "${documentSource.name}" erstellt${chunkInfo}.`,
                      backend: 'mcp',
                      timestamp: Date.now(),
                    }]);
                  } catch (error: any) {
                    console.error('Document analysis error:', error);
                    
                    let errorMessage = 'Unbekannter Fehler beim Analysieren';
                    
                    if (error.response?.status === 400) {
                      errorMessage = error.response.data?.message || 'Dokument zu groß oder ungültiges Format';
                    } else if (error.response?.status === 504) {
                      errorMessage = 'Timeout: Die Analyse dauert zu lange. Das Dokument ist möglicherweise zu komplex.';
                    } else if (error.response?.status === 503) {
                      errorMessage = 'KI-Service vorübergehend nicht verfügbar. Bitte versuche es in einigen Minuten erneut.';
                    } else if (error.message) {
                      errorMessage = error.message;
                    }
                    
                    setMessages(prev => [...prev, {
                      role: 'assistant',
                      content: `❌ **Fehler beim Analysieren**\n\n${errorMessage}\n\n💡 **Tipp:** Bei sehr großen Dokumenten (>100.000 Zeichen) wird automatisch eine chunk-basierte Analyse verwendet. Falls Probleme auftreten:\n- Versuche es in einigen Minuten erneut\n- Teile sehr große Dokumente in logische Abschnitte\n- Kontaktiere den Support bei anhaltenden Problemen`,
                      backend: 'mcp',
                      timestamp: Date.now(),
                    }]);
                  } finally {
                    setIsAnalyzingDocument(false);
                  }
                }}
                className="text-xs px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={chatMutation.isPending || isAnalyzingDocument}
                title={documentSource.type === 'artifact' 
                  ? 'Vergleicht das aktuelle Dokument mit dem Artefakt und schlägt Änderungen vor' 
                  : 'Analysiert das Dokument und schlägt Verbesserungen vor'}
              >
                {isAnalyzingDocument ? (
                  <>
                    <span className="inline-block animate-spin mr-1">⏳</span>
                    Analysiere...
                  </>
                ) : documentSource.type === 'artifact' ? (
                  '🔍 Mit Artefakt vergleichen'
                ) : (
                  '🔍 Dokument analysieren'
                )}
              </button>
              <button
                onClick={() => {
                  setInput(`Welche Abschnitte meines Dokuments sollte ich basierend auf "${documentSource.name}" überarbeiten?`);
                }}
                className="text-xs px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded transition-colors"
                disabled={chatMutation.isPending || isAnalyzingDocument}
              >
                💡 Empfehlungen geben
              </button>
            </>
          )}
          
          {/* Standard Mermaid Actions */}
          <button
            onClick={() => {
              const context = selectedText ? 'des ausgewählten Texts' : 'dieses Dokuments';
              setInput(`Erstelle ein Mermaid-Diagramm, das die Hauptkonzepte ${context} visualisiert`);
              setCurrentIntent('structuring');
            }}
            className="text-xs px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
            disabled={chatMutation.isPending}
            title={selectedText ? 'Diagramm aus Selektion erstellen' : 'Diagramm aus gesamtem Dokument erstellen'}
          >
            🎨 Diagramm {selectedText ? '(Selektion)' : ''}
          </button>
          <button
            onClick={() => {
              const context = selectedText ? 'aus dem ausgewählten Text' : 'aus diesem Dokument';
              setInput(`Erstelle ein Flowchart, das den Prozess/Ablauf ${context} darstellt`);
              setCurrentIntent('structuring');
            }}
            className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
            disabled={chatMutation.isPending}
            title={selectedText ? 'Flowchart aus Selektion' : 'Flowchart aus Dokument'}
          >
            📊 Flowchart {selectedText ? '(Selektion)' : ''}
          </button>
          <button
            onClick={() => {
              const context = selectedText ? 'aus dem ausgewählten Bereich' : 'aus diesem Dokument';
              setInput(`Erstelle eine Mindmap der wichtigsten Themen und ihrer Zusammenhänge ${context}`);
              setCurrentIntent('structuring');
            }}
            className="text-xs px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white rounded transition-colors"
            disabled={chatMutation.isPending}
            title={selectedText ? 'Mindmap aus Selektion' : 'Mindmap aus Dokument'}
          >
            🧠 Mindmap {selectedText ? '(Selektion)' : ''}
          </button>
        </div>
        
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Stelle eine Frage oder gib eine Anweisung..."
            className="flex-1 bg-gray-700 text-white rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
            disabled={chatMutation.isPending}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending}
            className="btn-primary px-4"
          >
            {chatMutation.isPending ? '⏳' : '➤'}
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-400">
          💡 Shift+Enter für neue Zeile, Enter zum Senden
        </div>
      </div>

      {/* Save as Artifact Modal */}
      {saveArtifactContent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-96 border border-gray-700">
            <h3 className="text-white text-lg font-semibold mb-4">📦 Artefakt speichern</h3>
            
            <div className="mb-4">
              <label className="block text-gray-300 text-sm mb-2">Titel</label>
              <input
                type="text"
                value={artifactTitle}
                onChange={(e) => setArtifactTitle(e.target.value)}
                placeholder="z.B. Zusammenfassung Kapitel 1"
                className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                autoFocus
              />
            </div>

            <div className="mb-4">
              <label className="block text-gray-300 text-sm mb-2">Inhalt (Vorschau)</label>
              <div className="bg-gray-900 rounded p-3 max-h-32 overflow-y-auto text-gray-300 text-sm whitespace-pre-wrap">
                {saveArtifactContent.slice(0, 200)}
                {saveArtifactContent.length > 200 && '...'}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={handleCancelSaveArtifact}
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
              >
                Abbrechen
              </button>
              <button
                onClick={handleConfirmSaveArtifact}
                disabled={!artifactTitle.trim() || createArtifactMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createArtifactMutation.isPending ? 'Speichere...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

