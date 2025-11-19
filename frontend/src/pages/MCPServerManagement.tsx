import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type MCPServerInfo, type MCPServerCreatePayload } from '../lib/api';

export function MCPServerManagement() {
  const queryClient = useQueryClient();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServerInfo | null>(null);

  const { data: serversData, isLoading } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: api.getMcpServers,
  });

  const servers = serversData?.servers ?? [];

  const createMutation = useMutation({
    mutationFn: api.createMcpServer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
      setIsAddModalOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => api.updateMcpServer(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
      setEditingServer(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteMcpServer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: api.setDefaultMcpServer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
    },
  });

  const handleDelete = (id: string) => {
    if (confirm('MCP-Server wirklich löschen?')) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-white">
        Lade MCP-Server...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">MCP Server Verwaltung</h1>
            <p className="text-gray-400">
              Konfiguriere Model Context Protocol Server für erweiterte KI-Funktionen
            </p>
          </div>
          <button onClick={() => setIsAddModalOpen(true)} className="btn-primary">
            ➕ Neuer MCP-Server
          </button>
        </div>

        <div className="space-y-4 pb-8">{/* Added pb-8 for bottom padding */}
        {servers.map((server) => (
          <div
            key={server.id}
            className="bg-gray-800 rounded-lg border border-gray-700 p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-semibold text-white">{server.name}</h3>
                  {server.isDefault && (
                    <span className="px-2 py-1 text-xs bg-primary-600 text-white rounded-full">
                      Standard
                    </span>
                  )}
                  {!server.enabled && (
                    <span className="px-2 py-1 text-xs bg-gray-600 text-gray-300 rounded-full">
                      Deaktiviert
                    </span>
                  )}
                </div>
                <p className="text-gray-400 text-sm mb-2">{server.description}</p>
                <p className="text-gray-500 text-xs font-mono">{server.url}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingServer(server)}
                  className="btn-secondary text-sm"
                >
                  ✏️ Bearbeiten
                </button>
                {!server.isDefault && (
                  <button
                    onClick={() => setDefaultMutation.mutate(server.id)}
                    className="btn-secondary text-sm"
                  >
                    ⭐ Als Standard
                  </button>
                )}
                <button
                  onClick={() => handleDelete(server.id)}
                  className="btn-error text-sm"
                >
                  🗑️ Löschen
                </button>
              </div>
            </div>

            {/* Tool Discovery Status */}
            {server.toolError && (
              <div className="mb-3 p-3 bg-yellow-900/40 border border-yellow-700 rounded text-sm text-yellow-200">
                ⚠️ Tool-Erkennung fehlgeschlagen: {server.toolError}
              </div>
            )}

            {/* Discovered Tools */}
            {server.tools && server.tools.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-300 mb-2">
                  🔧 Erkannte Tools ({server.tools.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {server.tools.map((tool) => (
                    <div
                      key={tool.name}
                      className="px-3 py-1 bg-gray-900 border border-gray-600 rounded text-sm"
                      title={tool.description}
                    >
                      <span className="text-white font-mono">{tool.name}</span>
                      {tool.description && (
                        <span className="text-gray-400 ml-2 text-xs">
                          - {tool.description}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Default Tools Configuration */}
            {server.defaultTools && Object.keys(server.defaultTools).length > 0 && (
              <div className="mt-3">
                <h4 className="text-sm font-semibold text-gray-300 mb-2">
                  🎯 Standard-Tool-Mappings
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(server.defaultTools).map(([key, value]) => (
                    <div key={key} className="text-gray-400">
                      <span className="text-gray-500">{key}:</span>{' '}
                      <span className="text-white font-mono">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {servers.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="mb-4">Noch keine MCP-Server konfiguriert</p>
            <button onClick={() => setIsAddModalOpen(true)} className="btn-primary">
              ➕ Ersten Server hinzufügen
            </button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(isAddModalOpen || editingServer) && (
        <MCPServerForm
          server={editingServer}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingServer(null);
          }}
          onSubmit={(data) => {
            if (editingServer) {
              updateMutation.mutate({ id: editingServer.id, payload: data });
            } else {
              createMutation.mutate(data as MCPServerCreatePayload);
            }
          }}
        />
      )}
      </div>
    </div>
  );
}

interface MCPServerFormProps {
  server: MCPServerInfo | null;
  onClose: () => void;
  onSubmit: (data: any) => void;
}

function MCPServerForm({ server, onClose, onSubmit }: MCPServerFormProps) {
  const [formData, setFormData] = useState({
    id: server?.id ?? '',
    name: server?.name ?? '',
    url: server?.url ?? '',
    description: server?.description ?? '',
    enabled: server?.enabled ?? true,
    isDefault: server?.isDefault ?? false,
    defaultTools: JSON.stringify(server?.defaultTools ?? {}, null, 2),
    capabilities: (server?.capabilities ?? []).join(', '),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload: any = {
      name: formData.name,
      url: formData.url,
      description: formData.description,
      enabled: formData.enabled,
      isDefault: formData.isDefault,
      type: 'http' as const,
    };

    if (!server) {
      payload.id = formData.id;
    }

    try {
      const defaultTools = JSON.parse(formData.defaultTools);
      if (Object.keys(defaultTools).length > 0) {
        payload.defaultTools = defaultTools;
      }
    } catch (e) {
      alert('Ungültiges JSON in Default Tools');
      return;
    }

    if (formData.capabilities.trim()) {
      payload.capabilities = formData.capabilities
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
    }

    onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white">
            {server ? 'MCP-Server bearbeiten' : 'Neuer MCP-Server'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!server && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                ID (eindeutig)
              </label>
              <input
                type="text"
                required
                value={formData.id}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                className="w-full bg-gray-900 text-white rounded px-3 py-2 border border-gray-700"
                placeholder="z.B. my-mcp-server"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-gray-900 text-white rounded px-3 py-2 border border-gray-700"
              placeholder="Anzeigename des Servers"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">URL</label>
            <input
              type="url"
              required
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              className="w-full bg-gray-900 text-white rounded px-3 py-2 border border-gray-700"
              placeholder="https://example.com/mcp"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Beschreibung
            </label>
            <textarea
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-gray-900 text-white rounded px-3 py-2 border border-gray-700"
              rows={3}
              placeholder="Was bietet dieser Server?"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Capabilities (kommagetrennt, optional)
            </label>
            <input
              type="text"
              value={formData.capabilities}
              onChange={(e) => setFormData({ ...formData, capabilities: e.target.value })}
              className="w-full bg-gray-900 text-white rounded px-3 py-2 border border-gray-700"
              placeholder="z.B. chat, search, edifact"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Default Tools (JSON, optional)
            </label>
            <textarea
              value={formData.defaultTools}
              onChange={(e) => setFormData({ ...formData, defaultTools: e.target.value })}
              className="w-full bg-gray-900 text-white rounded px-3 py-2 border border-gray-700 font-mono text-sm"
              rows={6}
              placeholder='{"chat": "chat-tool", "search": "search-tool"}'
            />
            <p className="text-xs text-gray-500 mt-1">
              Mapping von Funktionstypen zu tatsächlichen Tool-Namen
            </p>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="rounded"
              />
              <span className="text-gray-300">Server aktiviert</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                className="rounded"
              />
              <span className="text-gray-300">Als Standard-Server setzen</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
            <button type="button" onClick={onClose} className="btn-secondary">
              Abbrechen
            </button>
            <button type="submit" className="btn-primary">
              {server ? 'Speichern' : 'Hinzufügen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
