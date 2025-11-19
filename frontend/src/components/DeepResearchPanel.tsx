import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface DeepResearchPanelProps {
  documentId: string;
  documentContent: string;
  selectedText?: string;
  onSuggestionsGenerated: (suggestions: any[], sources: any) => void;
}

type EnrichmentGoal = 'expand' | 'update' | 'fact-check' | 'add-sources';

export const DeepResearchPanel: React.FC<DeepResearchPanelProps> = ({
  documentId,
  documentContent,
  selectedText,
  onSuggestionsGenerated,
}) => {
  const [activeTab, setActiveTab] = useState<'research' | 'batch' | 'enrich'>('research');
  const [query, setQuery] = useState('');
  const [useSelectedText, setUseSelectedText] = useState(true);
  const [webSearch, setWebSearch] = useState(true);
  const [mcpServers, setMcpServers] = useState<string[]>([]);
  const [maxSources, setMaxSources] = useState(10);
  const [enrichmentGoal, setEnrichmentGoal] = useState<EnrichmentGoal>('expand');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [progress, setProgress] = useState<string>('');
  const [sources, setSources] = useState<any>(null);
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<Set<string>>(new Set());
  const [batchQuery, setBatchQuery] = useState('');

  // Load artifacts for batch research
  const { data: artifacts = [] } = useQuery({
    queryKey: ['artifacts', documentId],
    queryFn: () => api.getArtifacts(documentId),
  });

  const handleMcpToggle = (server: string) => {
    setMcpServers(prev => 
      prev.includes(server) 
        ? prev.filter(s => s !== server)
        : [...prev, server]
    );
  };

  const handleDeepResearch = async () => {
    setLoading(true);
    setError('');
    setProgress('Starte Deep Research...');
    setSources(null);

    try {
      const researchQuery = useSelectedText && selectedText ? selectedText : query;
      
      if (!researchQuery.trim() && !selectedText) {
        setError('Bitte gib eine Suchanfrage ein oder markiere Text im Dokument');
        setLoading(false);
        return;
      }

      setProgress('Web-Suche läuft...');
      
      const result = await api.deepResearch({
        documentId,
        query: query || undefined,
        selectedText: useSelectedText ? selectedText : undefined,
        searchScope: {
          web: webSearch,
          mcp: mcpServers,
        },
        maxSources,
      });

      setProgress('AI-Synthese abgeschlossen');
      setSources(result.sources);
      
      if (result.suggestions && result.suggestions.length > 0) {
        onSuggestionsGenerated(result.suggestions, result.sources);
        setProgress(`✓ ${result.suggestions.length} Vorschläge generiert`);
      } else {
        setProgress('Keine Vorschläge generiert');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Fehler bei der Deep Research');
      setProgress('');
    } finally {
      setLoading(false);
    }
  };

  const handleEnrichSection = async () => {
    if (!selectedText) {
      setError('Bitte markiere einen Text-Abschnitt im Dokument');
      return;
    }

    setLoading(true);
    setError('');
    setProgress('Analysiere Sektion...');
    setSources(null);

    try {
      // Extract context (simplified - in production would be more sophisticated)
      const selectedIndex = documentContent.indexOf(selectedText);
      const beforeContext = documentContent.substring(Math.max(0, selectedIndex - 500), selectedIndex);
      const afterContext = documentContent.substring(
        selectedIndex + selectedText.length,
        Math.min(documentContent.length, selectedIndex + selectedText.length + 500)
      );

      setProgress('Recherchiere zu markiertem Abschnitt...');

      const result = await api.enrichSection({
        documentId,
        selectedText,
        beforeContext,
        afterContext,
        enrichmentGoal,
        searchScope: {
          web: webSearch,
          mcp: mcpServers,
        },
      });

      setProgress('Anreicherung abgeschlossen');
      setSources(result.sources);

      if (result.suggestions && result.suggestions.length > 0) {
        onSuggestionsGenerated(result.suggestions, result.sources);
        setProgress(`✓ Vorschlag für Sektion generiert`);
      } else {
        setProgress('Keine Verbesserungen gefunden');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Fehler bei der Sektion-Anreicherung');
      setProgress('');
    } finally {
      setLoading(false);
    }
  };

  const handleResearchBatch = async () => {
    if (selectedArtifactIds.size === 0) {
      setError('Bitte wähle mindestens eine Notiz aus');
      return;
    }

    setLoading(true);
    setError('');
    setProgress('Analysiere Notizen...');
    setSources(null);

    try {
      setProgress('Extrahiere Themen aus Notizen...');

      const result = await api.researchBatch({
        documentId,
        artifactIds: Array.from(selectedArtifactIds),
        researchQuery: batchQuery || undefined,
        searchScope: {
          web: webSearch,
          mcp: mcpServers,
        },
      });

      setProgress('Research Batch abgeschlossen');
      setSources(result.sources);

      if (result.suggestions && result.suggestions.length > 0) {
        onSuggestionsGenerated(result.suggestions, result.sources);
        setProgress(`✓ ${result.suggestions.length} Vorschläge aus ${result.artifactsAnalyzed} Notizen`);
      } else {
        setProgress('Keine Vorschläge generiert');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Fehler beim Research Batch');
      setProgress('');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleArtifact = (id: string) => {
    const newSelected = new Set(selectedArtifactIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedArtifactIds(newSelected);
  };

  return (
    <div className="flex flex-col h-full bg-gray-800 border-l border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white">🔬 Deep Research</h2>
        <p className="text-sm text-gray-400 mt-1">
          Web-Suche + MCP-Expertise für Living Documents
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'research'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
          onClick={() => setActiveTab('research')}
        >
          Research
        </button>
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'enrich'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
          onClick={() => setActiveTab('enrich')}
        >
          Enrich
        </button>
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'batch'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
          onClick={() => setActiveTab('batch')}
        >
          Batch
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Deep Research Tab */}
        {activeTab === 'research' && (
          <div className="space-y-4">
            {/* Query Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Forschungsfrage
              </label>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="z.B. Aktuelle Entwicklungen bei Energiespeichern 2025"
                rows={3}
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
              />
            </div>

            {/* Use Selected Text */}
            {selectedText && (
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="useSelectedText"
                  checked={useSelectedText}
                  onChange={(e) => setUseSelectedText(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="useSelectedText" className="text-sm text-gray-300">
                  Markierten Text verwenden ({selectedText.substring(0, 50)}...)
                </label>
              </div>
            )}

            {/* Search Scope */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Recherche-Quellen
              </label>
              
              <div className="space-y-2">
                {/* Web Search */}
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="webSearch"
                    checked={webSearch}
                    onChange={(e) => setWebSearch(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="webSearch" className="text-sm text-gray-300">
                    🌐 Web-Suche (Tavily)
                  </label>
                </div>

                {/* MCP Servers */}
                <div className="ml-6 space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="mcp-willi-mako"
                      checked={mcpServers.includes('willi-mako')}
                      onChange={() => handleMcpToggle('willi-mako')}
                      className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="mcp-willi-mako" className="text-sm text-gray-300">
                      ⚡ Willi-Mako (Energiemarkt)
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="mcp-powabase"
                      checked={mcpServers.includes('powabase')}
                      onChange={() => handleMcpToggle('powabase')}
                      className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="mcp-powabase" className="text-sm text-gray-300">
                      📊 Powabase (MaStR)
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Max Sources */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Max. Quellen: {maxSources}
              </label>
              <input
                type="range"
                min="5"
                max="20"
                value={maxSources}
                onChange={(e) => setMaxSources(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>5</span>
                <span>20</span>
              </div>
            </div>

            {/* Action Button */}
            <button
              onClick={handleDeepResearch}
              disabled={loading || (!webSearch && mcpServers.length === 0)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {loading ? '🔍 Recherchiere...' : '🔬 Deep Research starten'}
            </button>
          </div>
        )}

        {/* Enrich Section Tab */}
        {activeTab === 'enrich' && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-900 bg-opacity-30 border border-blue-700 rounded-md">
              <p className="text-sm text-blue-300">
                💡 Markiere einen Abschnitt im Dokument, um ihn gezielt mit aktuellen Informationen anzureichern.
              </p>
            </div>

            {selectedText && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Markierter Text:
                </label>
                <div className="p-3 bg-gray-900 border border-gray-700 rounded-md">
                  <p className="text-sm text-gray-200 line-clamp-3">
                    {selectedText}
                  </p>
                </div>
              </div>
            )}

            {/* Enrichment Goal */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Anreicherungs-Ziel
              </label>
              <select
                value={enrichmentGoal}
                onChange={(e) => setEnrichmentGoal(e.target.value as EnrichmentGoal)}
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="expand">📝 Text erweitern</option>
                <option value="update">🔄 Aktualisieren</option>
                <option value="fact-check">✓ Fakten überprüfen</option>
                <option value="add-sources">📚 Quellen hinzufügen</option>
              </select>
            </div>

            {/* Search Scope (same as research) */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Recherche-Quellen
              </label>
              
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="webSearch-enrich"
                    checked={webSearch}
                    onChange={(e) => setWebSearch(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="webSearch-enrich" className="text-sm text-gray-300">
                    🌐 Web-Suche
                  </label>
                </div>

                <div className="ml-6 space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="mcp-willi-mako-enrich"
                      checked={mcpServers.includes('willi-mako')}
                      onChange={() => handleMcpToggle('willi-mako')}
                      className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="mcp-willi-mako-enrich" className="text-sm text-gray-300">
                      ⚡ Willi-Mako
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="mcp-powabase-enrich"
                      checked={mcpServers.includes('powabase')}
                      onChange={() => handleMcpToggle('powabase')}
                      className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="mcp-powabase-enrich" className="text-sm text-gray-300">
                      📊 Powabase
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleEnrichSection}
              disabled={loading || !selectedText || (!webSearch && mcpServers.length === 0)}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {loading ? '✨ Reichere an...' : '✨ Sektion anreichern'}
            </button>
          </div>
        )}

        {/* Batch Tab */}
        {activeTab === 'batch' && (
          <div className="space-y-4">
            <div className="p-3 bg-purple-900 bg-opacity-30 border border-purple-700 rounded-md">
              <p className="text-sm text-purple-300">
                📚 Research Batch: Wähle Notizen aus und starte einen kombinierten Deep Research basierend auf deinen gesammelten Ideen.
              </p>
            </div>

            {/* Optional Batch Query */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Zusätzliche Forschungsfrage (optional)
              </label>
              <textarea
                value={batchQuery}
                onChange={(e) => setBatchQuery(e.target.value)}
                placeholder="z.B. Regulatorische Aspekte berücksichtigen"
                rows={2}
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-gray-400"
              />
            </div>

            {/* Artifact Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Notizen auswählen ({selectedArtifactIds.size} ausgewählt)
              </label>
              <div className="max-h-64 overflow-y-auto space-y-2 border border-gray-700 rounded-md p-2 bg-gray-900">
                {artifacts.length === 0 ? (
                  <div className="text-center text-gray-400 text-sm py-4">
                    <p>Noch keine Notizen vorhanden</p>
                    <p className="text-xs mt-1">Erstelle Notizen im Artefakte-Panel</p>
                  </div>
                ) : (
                  artifacts.map((artifact: any) => (
                    <div
                      key={artifact.id}
                      className="flex items-start gap-2 p-2 bg-gray-800 rounded hover:bg-gray-750"
                    >
                      <input
                        type="checkbox"
                        checked={selectedArtifactIds.has(artifact.id)}
                        onChange={() => handleToggleArtifact(artifact.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm text-white font-medium truncate">
                          {artifact.title}
                        </h4>
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                          {artifact.content}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Search Scope */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Recherche-Quellen
              </label>
              
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="webSearch-batch"
                    checked={webSearch}
                    onChange={(e) => setWebSearch(e.target.checked)}
                    className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="webSearch-batch" className="text-sm text-gray-300">
                    🌐 Web-Suche (Tavily)
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="mcp-willi-mako-batch"
                    checked={mcpServers.includes('willi-mako')}
                    onChange={() => handleMcpToggle('willi-mako')}
                    className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="mcp-willi-mako-batch" className="text-sm text-gray-300">
                    ⚡ Willi-Mako (Energiemarkt-Expertise)
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="mcp-powabase-batch"
                    checked={mcpServers.includes('powabase')}
                    onChange={() => handleMcpToggle('powabase')}
                    className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="mcp-powabase-batch" className="text-sm text-gray-300">
                    📊 Powabase (Marktstammdatenregister)
                  </label>
                </div>
              </div>
            </div>

            {/* Start Button */}
            <button
              onClick={handleResearchBatch}
              disabled={loading || selectedArtifactIds.size === 0 || (!webSearch && mcpServers.length === 0)}
              className="w-full py-2 px-4 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {loading ? '📚 Recherchiere Batch...' : `🔬 Research Batch starten (${selectedArtifactIds.size} Notizen)`}
            </button>
          </div>
        )}

        {/* Progress Display */}
        {progress && (
          <div className="p-3 bg-gray-900 border border-gray-700 rounded-md">
            <p className="text-sm text-gray-300">{progress}</p>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-900 bg-opacity-30 border border-red-700 rounded-md">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Sources Display */}
        {sources && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-300">
              📚 Gefundene Quellen
            </h3>
            
            {sources.web && sources.web.length > 0 && (
              <div className="p-3 bg-gray-900 border border-gray-700 rounded-md">
                <h4 className="text-xs font-medium text-gray-400 mb-2">
                  Web-Quellen ({sources.web.length})
                </h4>
                <div className="space-y-2">
                  {sources.web.slice(0, 3).map((source: any, idx: number) => (
                    <div key={idx} className="text-xs">
                      <a 
                        href={source.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline"
                      >
                        {source.title}
                      </a>
                      <p className="text-gray-500 mt-1 line-clamp-2">
                        {source.snippet}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sources.mcp && sources.mcp.length > 0 && (
              <div className="p-3 bg-gray-900 border border-gray-700 rounded-md">
                <h4 className="text-xs font-medium text-gray-400 mb-2">
                  MCP-Quellen ({sources.mcp.length})
                </h4>
                <div className="space-y-2">
                  {sources.mcp.map((source: any, idx: number) => (
                    <div key={idx} className="text-xs">
                      <span className="text-purple-400">⚡ {source.server}</span>
                      <p className="text-gray-500 mt-1 line-clamp-2">
                        {source.summary}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
