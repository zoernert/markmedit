import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, type MCPServerInfo } from '../lib/api';

export function EDIFACTTools() {
  const [edifactMessage, setEdifactMessage] = useState('');
  const [activeOperation, setActiveOperation] = useState<'analyze' | 'explain' | 'validate' | 'chat' | null>(null);
  const [result, setResult] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string; serverName?: string; tool?: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [selectedServerId, setSelectedServerId] = useState<string>('auto');
  const [lastResponseMeta, setLastResponseMeta] = useState<{ serverName: string; serverDescription?: string; tool: string } | null>(null);

  const { data: serversData } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: api.getMcpServers,
  });

  const servers = useMemo<MCPServerInfo[]>(() => serversData?.servers ?? [], [serversData]);
  const autoSelect = selectedServerId === 'auto';
  const resolvedServerId = autoSelect ? undefined : selectedServerId;
  const edifactServers = useMemo(() => {
    return servers.filter(server => {
      if (server.defaultTools?.edifactAnalyze || server.defaultTools?.edifactExplain) {
        return true;
      }
      return server.capabilities?.some(cap => cap.toLowerCase().includes('edifact'));
    });
  }, [servers]);
  const activeServer = useMemo(() => edifactServers.find(server => server.id === resolvedServerId), [edifactServers, resolvedServerId]);

  useEffect(() => {
    if (!autoSelect && !activeServer && edifactServers.length > 0) {
      setSelectedServerId(edifactServers[0].id);
    }
  }, [autoSelect, activeServer, edifactServers]);

  const extractResponseText = (payload: any): string => {
    if (!payload) return 'Keine Antwort erhalten.';
    if (typeof payload === 'string') return payload;
    return payload.message ?? JSON.stringify(payload, null, 2);
  };

  const analyzeMutation = useMutation({
    mutationFn: () => api.edifactAnalyze({
      message: edifactMessage,
      serverId: resolvedServerId,
      autoSelect,
    }),
    onSuccess: (data) => {
      setResult(data.result);
      setLastResponseMeta({
        serverName: data.serverName,
        serverDescription: data.serverDescription,
        tool: data.tool,
      });
      setActiveOperation('analyze');
    },
  });

  const explainMutation = useMutation({
    mutationFn: () => api.edifactExplain({
      message: edifactMessage,
      serverId: resolvedServerId,
      autoSelect,
    }),
    onSuccess: (data) => {
      setResult(data.result);
      setLastResponseMeta({
        serverName: data.serverName,
        serverDescription: data.serverDescription,
        tool: data.tool,
      });
      setActiveOperation('explain');
    },
  });

  const validateMutation = useMutation({
    mutationFn: () => api.edifactValidate({
      message: edifactMessage,
      serverId: resolvedServerId,
      autoSelect,
    }),
    onSuccess: (data) => {
      setResult(data.result);
      setLastResponseMeta({
        serverName: data.serverName,
        serverDescription: data.serverDescription,
        tool: data.tool,
      });
      setActiveOperation('validate');
    },
  });

  const chatMutation = useMutation({
    mutationFn: (message: string) =>
      api.edifactChat({
        message,
        edifactMessage,
        history: chatMessages.map(({ role, content }) => ({ role, content })),
        serverId: resolvedServerId,
        autoSelect,
      }),
    onSuccess: (data, message) => {
      const payload = data.result as any;
      setChatMessages(prev => [
        ...prev,
        { role: 'user', content: message },
        { role: 'assistant', content: extractResponseText(payload), serverName: data.serverName, tool: data.tool },
      ]);
      setLastResponseMeta({
        serverName: data.serverName,
        serverDescription: data.serverDescription,
        tool: data.tool,
      });
      setChatInput('');
    },
  });

  const handleChat = () => {
    if (chatInput.trim()) {
      chatMutation.mutate(chatInput);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <h2 className="text-xl font-semibold text-white">EDIFACT Tools</h2>
        <p className="text-sm text-gray-400 mt-1">
          Analysiere, validiere und verstehe EDIFACT-Nachrichten
        </p>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Server Auswahl</label>
            <select
              value={selectedServerId}
              onChange={(e) => setSelectedServerId(e.target.value)}
              className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1"
            >
              <option value="auto">Automatisch auswählen</option>
              {edifactServers.map(server => (
                <option key={server.id} value={server.id}>
                  {server.name}
                </option>
              ))}
            </select>
          </div>
          {(activeServer || autoSelect || lastResponseMeta) && (
            <div className="text-xs text-gray-300 bg-gray-700 rounded px-2 py-2">
              {autoSelect && !activeServer ? (
                <>
                  <div>Der passende Server wird automatisch anhand der Anfrage gewählt.</div>
                  {lastResponseMeta && (
                    <div className="mt-1 text-gray-400">
                      Zuletzt genutzt: {lastResponseMeta.serverName} • Tool: {lastResponseMeta.tool}
                    </div>
                  )}
                </>
              ) : activeServer ? (
                <>
                  <div className="font-semibold text-gray-100">{activeServer.name}</div>
                  <div>{activeServer.description}</div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Input */}
          <div className="card">
            <h3 className="font-semibold mb-3 text-white">EDIFACT Nachricht</h3>
            <textarea
              value={edifactMessage}
              onChange={(e) => setEdifactMessage(e.target.value)}
              className="w-full h-48 p-3 bg-gray-700 text-white font-mono text-sm rounded-lg resize-none"
              placeholder="UNH+1+UTILMD:D:11A:UN:2.4e++...&#10;BGM+E01+...&#10;..."
            />
            
            <div className="grid grid-cols-4 gap-2 mt-4">
              <button
                onClick={() => analyzeMutation.mutate()}
                disabled={!edifactMessage || analyzeMutation.isPending}
                className="btn-primary text-sm"
              >
                📊 Analysieren
              </button>
              <button
                onClick={() => explainMutation.mutate()}
                disabled={!edifactMessage || explainMutation.isPending}
                className="btn-primary text-sm"
              >
                💬 Erklären
              </button>
              <button
                onClick={() => validateMutation.mutate()}
                disabled={!edifactMessage || validateMutation.isPending}
                className="btn-primary text-sm"
              >
                ✅ Validieren
              </button>
              <button
                onClick={() => setActiveOperation('chat')}
                disabled={!edifactMessage}
                className="btn-primary text-sm"
              >
                💭 Chat
              </button>
            </div>
          </div>

          {/* Results */}
          {activeOperation && activeOperation !== 'chat' && result && (
            <div className="card">
              <h3 className="font-semibold mb-3 text-white">
                {activeOperation === 'analyze' && '📊 Analyse'}
                {activeOperation === 'explain' && '💬 Erklärung'}
                {activeOperation === 'validate' && '✅ Validierung'}
              </h3>
              
              {lastResponseMeta && (
                <p className="text-xs text-gray-400 mb-2">
                  Quelle: {lastResponseMeta.serverName} • Tool: {lastResponseMeta.tool}
                </p>
              )}
              <div className="bg-gray-700 p-4 rounded-lg">
                <pre className="whitespace-pre-wrap text-sm text-gray-200">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Chat */}
          {activeOperation === 'chat' && (
            <div className="card">
              <h3 className="font-semibold mb-3 text-white">💭 EDIFACT Chat</h3>
              
              <div className="bg-gray-700 rounded-lg p-4 h-96 overflow-auto mb-4">
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`mb-3 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
                  >
                    <div
                      className={`inline-block p-3 rounded-lg ${
                        msg.role === 'user'
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-600 text-gray-100'
                      }`}
                    >
                      <div className="text-xs opacity-75 mb-1">
                        {msg.role === 'user' ? 'Du' : msg.serverName ? `${msg.serverName} (${msg.tool})` : 'MCP-Assistent'}
                      </div>
                      <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex space-x-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleChat()}
                  placeholder="Frage zur EDIFACT-Nachricht..."
                  className="flex-1 bg-gray-700 text-white rounded px-3 py-2 text-sm"
                />
                <button
                  onClick={handleChat}
                  disabled={chatMutation.isPending}
                  className="btn-primary text-sm px-4"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
