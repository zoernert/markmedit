import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, type MCPServerInfo, type MCPServerResponse } from '../lib/api';

type MCPPanelTab = 'search' | 'chat' | 'edifact';

interface SearchResult {
  text: string;
  score: number;
  sourceCollection?: string;
  metadata?: unknown;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  serverName?: string;
  tool?: string;
}

const LOCAL_STORAGE_KEY = 'markmedit.mcp.enabledServers';
const EDIFACT_TOOL_KEYS = [
  'edifactAnalyze',
  'edifactExplain',
  'edifactValidate',
  'edifactChat',
  'edifactModify',
];

interface DisplayTool {
  key: string;
  name: string;
  description?: string;
}

function serverSupportsEdifact(server: MCPServerInfo): boolean {
  if (server.tools?.some((tool) => tool.name.toLowerCase().includes('edifact'))) {
    return true;
  }

  if (server.capabilities?.some((capability) => capability.toLowerCase().includes('edifact'))) {
    return true;
  }

  const defaultTools = server.defaultTools ?? {};
  return Object.keys(defaultTools).some((key) => EDIFACT_TOOL_KEYS.includes(key));
}

function getDisplayTools(server: MCPServerInfo): DisplayTool[] {
  if (server.tools?.length) {
    return server.tools.map((tool) => ({
      key: tool.name,
      name: tool.name,
      description: tool.description,
    }));
  }

  const defaultTools = server.defaultTools ?? {};
  return Object.entries(defaultTools).map(([key, value]) => ({
    key,
    name: value ?? key,
  }));
}

function extractSearchResults(response: MCPServerResponse): SearchResult[] {
  const payload = response.result as unknown;

  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload as SearchResult[];
  }

  if (typeof payload === 'object') {
    const typed = payload as Record<string, unknown>;
    if (Array.isArray(typed.results)) {
      return typed.results as SearchResult[];
    }
    if (Array.isArray(typed.items)) {
      return typed.items as SearchResult[];
    }
  }

  return [];
}

function extractChatText(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    const typed = payload as Record<string, unknown>;
    const candidate = typed.response ?? typed.answer ?? typed.message;
    if (typeof candidate === 'string') {
      return candidate;
    }
    return JSON.stringify(payload, null, 2);
  }
  return String(payload ?? '');
}

export function MCPPanel({ documentId: _documentId }: { documentId?: string }) {
  const [activeTab, setActiveTab] = useState<MCPPanelTab>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [collection, setCollection] = useState<'mako' | 'netz' | 'combined'>('combined');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchMeta, setSearchMeta] = useState<{ serverName: string; serverDescription?: string; tool: string } | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<'auto' | string>('auto');
  const [enabledServers, setEnabledServers] = useState<Record<string, boolean>>({});
  const [appliedDefault, setAppliedDefault] = useState(false);

  const { data: serversData } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: api.getMcpServers,
  });

  const servers = useMemo<MCPServerInfo[]>(() => serversData?.servers ?? [], [serversData]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) {
      return;
    }
    try {
      const parsed = JSON.parse(stored) as Record<string, boolean>;
      setEnabledServers(parsed);
    } catch (error) {
      console.warn('Failed to parse stored MCP server preferences', error);
    }
  }, []);

  useEffect(() => {
    setEnabledServers((previous) => {
      const next = { ...previous };
      let changed = false;
      for (const server of servers) {
        if (next[server.id] === undefined) {
          next[server.id] = server.enabled === false ? false : true;
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [servers]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(enabledServers));
  }, [enabledServers]);

  useEffect(() => {
    if (selectedServerId === 'auto') {
      return;
    }
    const target = servers.find((server) => server.id === selectedServerId);
    if (!target) {
      setSelectedServerId('auto');
      return;
    }
    if (target.enabled === false || enabledServers[selectedServerId] === false) {
      setSelectedServerId('auto');
    }
  }, [servers, enabledServers, selectedServerId]);

  useLayoutEffect(() => {
    if (appliedDefault) {
      return;
    }
    if (!servers.length) {
      return;
    }
    const defaultServer = servers.find((server) => server.isDefault && server.enabled !== false);
    if (defaultServer && selectedServerId === 'auto') {
      setSelectedServerId(defaultServer.id);
      setAppliedDefault(true);
    } else if (!defaultServer) {
      setAppliedDefault(true);
    }
  }, [servers, selectedServerId, appliedDefault]);

  const enabledServerList = useMemo(
    () => servers.filter((server) => server.enabled !== false && enabledServers[server.id] !== false),
    [servers, enabledServers],
  );

  const autoSelect = selectedServerId === 'auto';
  const resolvedServerId = autoSelect ? undefined : selectedServerId;
  const allowedServerIds = autoSelect ? enabledServerList.map((server) => server.id) : undefined;

  const activeServer = useMemo(() => {
    if (!resolvedServerId) {
      return null;
    }
    return servers.find((server) => server.id === resolvedServerId) ?? null;
  }, [resolvedServerId, servers]);

  const currentServerDetails = useMemo(() => {
    if (activeServer) {
      return activeServer;
    }
    return enabledServerList[0] ?? null;
  }, [activeServer, enabledServerList]);

  const detailTools = useMemo(
    () => (currentServerDetails ? getDisplayTools(currentServerDetails) : []),
    [currentServerDetails],
  );

  const detailToolError = currentServerDetails?.toolError;

  const hasEdifactSupport = useMemo(
    () => enabledServerList.some((server) => serverSupportsEdifact(server)),
    [enabledServerList],
  );

  useEffect(() => {
    if (!hasEdifactSupport && activeTab === 'edifact') {
      setActiveTab('search');
    }
  }, [hasEdifactSupport, activeTab]);

  const noServersConfigured = servers.length === 0;
  const noEnabledServers = autoSelect && enabledServerList.length === 0;

  const searchMutation = useMutation({
    mutationFn: (query: string) =>
      api.mcpSearch({
        query,
        collection,
        limit: 10,
        serverId: resolvedServerId,
        autoSelect,
        allowedServerIds,
      }),
    onSuccess: (data) => {
      setSearchResults(extractSearchResults(data));
      setSearchMeta({
        serverName: data.serverName,
        serverDescription: data.serverDescription,
        tool: data.tool,
      });
    },
  });

  const chatMutation = useMutation({
    mutationFn: (message: string) =>
      api.mcpChat({
        message,
        history: chatHistory.map(({ role, content }) => ({ role, content })),
        metadata: { collection },
        serverId: resolvedServerId,
        autoSelect,
        allowedServerIds,
      }),
    onSuccess: (data, message) => {
      const assistantReply = extractChatText(data.result);
      setChatHistory((previous) => [
        ...previous,
        { role: 'user', content: message },
        { role: 'assistant', content: assistantReply, serverName: data.serverName, tool: data.tool },
      ]);
      setChatMessage('');
    },
  });

  const handleSearch = () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      return;
    }
    if (noServersConfigured || noEnabledServers) {
      setSearchMeta(null);
      setSearchResults([]);
      return;
    }
    searchMutation.mutate(trimmed);
  };

  const sendChat = () => {
    const trimmed = chatMessage.trim();
    if (!trimmed) {
      return;
    }
    if (noServersConfigured || noEnabledServers) {
      return;
    }
    chatMutation.mutate(trimmed);
  };

  const pendingServerLabel = activeServer?.name ?? searchMeta?.serverName ?? 'MCP-Server';

  const renderServerTools = (server: MCPServerInfo) => {
    const tools = getDisplayTools(server);
    const hasTools = tools.length > 0;
    const hasError = Boolean(server.toolError);

    return (
      <div className="mt-2 space-y-2">
        {hasError && (
          <div className="text-xs text-yellow-200 bg-yellow-900/40 border border-yellow-700 rounded px-2 py-1">
            Tool-Erkennung fehlgeschlagen: {server.toolError}
          </div>
        )}
        {hasTools ? (
          <div className="flex flex-wrap gap-2">
            {tools.map((tool) => (
              <span
                key={`${server.id}-${tool.key}`}
                className="text-xs bg-gray-800 text-gray-200 px-2 py-1 rounded"
                title={tool.description}
              >
                {tool.name}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-500">Keine Tools verfügbar</div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex bg-gray-900">
      <aside className="w-72 border-r border-gray-800 bg-gray-900 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white">MCP Services</h3>
          <p className="text-xs text-gray-400 mt-1">
            Aktiviere oder deaktiviere Dienste und wähle den aktiven Server.
          </p>
        </div>

        <div className="p-3 border-b border-gray-800 space-y-2">
          <button
            onClick={() => setSelectedServerId('auto')}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              autoSelect ? 'bg-primary-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Auto-Auswahl
            <span className="block text-xs text-gray-200 mt-1">
              {enabledServerList.length}/{servers.length} Server aktiv
            </span>
          </button>

          {noServersConfigured && (
            <div className="text-xs text-yellow-200 bg-yellow-900/40 border border-yellow-700 rounded px-3 py-2">
              Kein MCP-Server konfiguriert. Hinterlege Einträge in <code>.env</code> → <code>MCP_SERVERS</code>.
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {servers.map((server) => {
            const isSelected = selectedServerId === server.id;
            const serverDisabled = server.enabled === false;
            const userEnabled = enabledServers[server.id] !== false;
            const isEnabled = !serverDisabled && userEnabled;
            return (
              <div
                key={server.id}
                className={`px-3 py-3 border-b border-gray-800 ${isSelected ? 'bg-gray-800' : 'bg-transparent'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => {
                      if (serverDisabled) {
                        return;
                      }
                      setSelectedServerId(server.id);
                    }}
                    className={`text-left flex-1 ${isEnabled ? 'text-white' : 'text-gray-500'}`}
                  >
                    <div className="font-semibold text-sm">
                      {server.name}
                      {server.isDefault && (
                        <span className="ml-2 text-xs uppercase tracking-wide text-primary-300">Standard</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{server.description}</div>
                  </button>
                  <button
                    onClick={() => {
                      if (serverDisabled) {
                        return;
                      }
                      setEnabledServers((previous) => ({
                        ...previous,
                        [server.id]: !(previous[server.id] !== false),
                      }));
                    }}
                    disabled={serverDisabled}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${
                      serverDisabled
                        ? 'border-gray-700 text-gray-500 cursor-not-allowed opacity-60'
                        : isEnabled
                          ? 'border-green-500 text-green-300 hover:bg-green-600/10'
                          : 'border-gray-600 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {serverDisabled ? 'Deaktiviert' : isEnabled ? 'Aktiv' : 'Inaktiv'}
                  </button>
                </div>
                {serverDisabled && (
                  <div className="mt-2 text-xs text-yellow-200">
                    Dieser Server wurde serverseitig deaktiviert.
                  </div>
                )}
                {renderServerTools(server)}
              </div>
            );
          })}

          {!servers.length && (
            <div className="px-3 py-6 text-xs text-gray-500">
              Sobald Dienste konfiguriert sind, erscheinen sie hier mit ihren Tools.
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col bg-gray-800">
        <div className="border-b border-gray-700 p-4">
          <div>
            <h4 className="text-white font-semibold text-lg">
              {activeServer ? activeServer.name : 'Automatische Auswahl'}
            </h4>
            <p className="text-xs text-gray-400 mt-1 max-w-2xl">
              {activeServer?.description ??
                (currentServerDetails?.description ?? 'Der geeignete Server wird anhand der Anfrage automatisch gewählt.')}
            </p>
            {currentServerDetails && (
              <div className="mt-2 space-y-2">
                {detailToolError && (
                  <div className="text-xs text-yellow-200 bg-yellow-900/40 border border-yellow-700 rounded px-2 py-1">
                    Tool-Erkennung fehlgeschlagen: {detailToolError}
                  </div>
                )}
                {detailTools.length ? (
                  <div className="flex flex-wrap gap-2">
                    {detailTools.map((tool) => (
                      <span
                        key={`${currentServerDetails.id}-${tool.key}`}
                        className="text-xs bg-gray-900 text-gray-200 px-2 py-1 rounded"
                        title={tool.description}
                      >
                        {tool.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-gray-500">Keine Tools erkannt</span>
                )}
              </div>
            )}
          </div>

          <div className="flex space-x-2 mt-4">
            <button
              onClick={() => setActiveTab('search')}
              className={`px-3 py-1 rounded text-sm ${
                activeTab === 'search'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-900 text-gray-300 hover:bg-gray-700'
              }`}
            >
              Suche
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-3 py-1 rounded text-sm ${
                activeTab === 'chat'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-900 text-gray-300 hover:bg-gray-700'
              }`}
            >
              Chat
            </button>
            {hasEdifactSupport && (
              <button
                onClick={() => setActiveTab('edifact')}
                className={`px-3 py-1 rounded text-sm ${
                  activeTab === 'edifact'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-900 text-gray-300 hover:bg-gray-700'
                }`}
              >
                EDIFACT
              </button>
            )}
          </div>

          {activeTab !== 'edifact' && (
            <div className="mt-3">
              <select
                value={collection}
                onChange={(event) => setCollection(event.target.value as 'mako' | 'netz' | 'combined')}
                className="w-64 bg-gray-900 text-white text-sm rounded px-2 py-1"
              >
                <option value="combined">Alle Sammlungen</option>
                <option value="mako">MaKo (Markt)</option>
                <option value="netz">Netz (Regulation)</option>
              </select>
            </div>
          )}

          {noEnabledServers && (
            <div className="mt-3 text-xs text-yellow-200 bg-yellow-900/40 border border-yellow-700 rounded px-3 py-2">
              Aktiviere mindestens einen Server, um Abfragen zu senden.
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {activeTab === 'search' && (
            <div className="space-y-4">
              <div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleSearch();
                    }
                  }}
                  placeholder="Suche nach Energiemarkt-Themen..."
                  className="w-full bg-gray-900 text-white rounded px-3 py-2 text-sm"
                />
                <button
                  onClick={handleSearch}
                  disabled={searchMutation.isPending}
                  className="mt-2 w-full btn-primary text-sm"
                >
                  {searchMutation.isPending ? 'Suche...' : 'Suchen'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2">
                  {searchMeta && (
                    <div className="text-xs text-gray-400">
                      Quelle: {searchMeta.serverName} | Tool: {searchMeta.tool}
                    </div>
                  )}
                  {searchResults.map((result, index) => (
                    <div key={index} className="bg-gray-900 rounded p-3">
                      <div className="text-xs text-gray-400 mb-1">
                        Score: {(result.score * 100).toFixed(1)}%
                        {result.sourceCollection && ` - ${result.sourceCollection}`}
                      </div>
                      <div className="text-sm text-gray-200 whitespace-pre-wrap">{result.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-auto space-y-3 mb-4">
                {chatHistory.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`p-3 rounded ${
                      message.role === 'user' ? 'bg-primary-600 ml-8' : 'bg-gray-900 mr-8'
                    }`}
                  >
                    <div className="text-xs text-gray-300 mb-1">
                      {message.role === 'user'
                        ? 'Du'
                        : message.serverName
                          ? `${message.serverName} (${message.tool})`
                          : 'MCP-Assistent'}
                    </div>
                    <div className="text-sm text-white whitespace-pre-wrap">{message.content}</div>
                  </div>
                ))}
                {chatMutation.isPending && (
                  <div className="bg-gray-900 mr-8 p-3 rounded">
                    <div className="text-xs text-gray-300 mb-1">{pendingServerLabel}</div>
                    <div className="text-sm text-gray-400">Denkt nach...</div>
                  </div>
                )}
              </div>

              <div className="flex space-x-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(event) => setChatMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      sendChat();
                    }
                  }}
                  placeholder="Frage stellen..."
                  className="flex-1 bg-gray-900 text-white rounded px-3 py-2 text-sm"
                />
                <button
                  onClick={sendChat}
                  disabled={chatMutation.isPending}
                  className="btn-primary text-sm px-4"
                >
                  Senden
                </button>
              </div>
            </div>
          )}

          {activeTab === 'edifact' && hasEdifactSupport && (
            <div className="space-y-3">
              <div className="text-sm text-gray-400">
                Wähle einen EDIFACT-fähigen Dienst aus, um Analyse- und Validierungsfunktionen zu nutzen.
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-900 p-3 rounded text-center">
                  <div className="text-sm font-semibold text-gray-200">Analyse</div>
                  <div className="text-xs text-gray-300">Analysieren</div>
                </div>
                <div className="bg-gray-900 p-3 rounded text-center">
                  <div className="text-sm font-semibold text-gray-200">Erklärung</div>
                  <div className="text-xs text-gray-300">Erklären</div>
                </div>
                <div className="bg-gray-900 p-3 rounded text-center">
                  <div className="text-sm font-semibold text-gray-200">Prüfung</div>
                  <div className="text-xs text-gray-300">Validieren</div>
                </div>
                <div className="bg-gray-900 p-3 rounded text-center">
                  <div className="text-sm font-semibold text-gray-200">Bearbeitung</div>
                  <div className="text-xs text-gray-300">Modifizieren</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
