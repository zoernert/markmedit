import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';

type ViewMode = 'grid' | 'list';
type FilterType = 'all' | 'table' | 'diagram' | 'presentation' | 'note' | 'other';

export function ArtifactLibrary() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArtifact, setSelectedArtifact] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['artifacts', 'all'],
    queryFn: () => api.getAllArtifacts(),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ documentId, artifactId }: { documentId: string; artifactId: string }) =>
      api.deleteArtifact(documentId, artifactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts', 'all'] });
      setSelectedArtifact(null);
      alert('✅ Artifact gelöscht');
    },
  });

  const artifacts = data?.artifacts || [];

  // Filter artifacts
  const filteredArtifacts = artifacts.filter((artifact: any) => {
    // Search filter
    if (searchQuery && !artifact.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !artifact.content.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    // Type filter
    if (filterType !== 'all') {
      const content = artifact.content.toLowerCase();
      const title = artifact.title.toLowerCase();
      
      switch (filterType) {
        case 'table':
          if (!content.includes('<table') && !content.includes('|---|')) return false;
          break;
        case 'diagram':
          if (!content.includes('mermaid') && !content.includes('graph')) return false;
          break;
        case 'presentation':
          if (!title.includes('präsentation') && !content.includes('reveal.js')) return false;
          break;
        case 'note':
          if (content.includes('<table') || content.includes('mermaid') || content.includes('reveal.js')) return false;
          break;
      }
    }

    return true;
  });

  const getArtifactIcon = (artifact: any) => {
    const content = artifact.content.toLowerCase();
    const title = artifact.title.toLowerCase();
    
    if (content.includes('<table') || content.includes('|---|')) return '📊';
    if (content.includes('mermaid') || content.includes('graph')) return '📈';
    if (title.includes('präsentation') || content.includes('reveal.js')) return '🎬';
    return '📝';
  };

  const getArtifactType = (artifact: any) => {
    const content = artifact.content.toLowerCase();
    const title = artifact.title.toLowerCase();
    
    if (content.includes('<table') || content.includes('|---|')) return 'Tabelle';
    if (content.includes('mermaid') || content.includes('graph')) return 'Diagramm';
    if (title.includes('präsentation') || content.includes('reveal.js')) return 'Präsentation';
    return 'Notiz';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-white">
        Lade Artifact-Bibliothek...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">📚 Artifact-Bibliothek</h1>
            <p className="text-sm text-gray-400 mt-1">
              {filteredArtifacts.length} von {artifacts.length} Artifacts
            </p>
          </div>

          {/* View Mode Toggle */}
          <div className="flex gap-2 bg-gray-900 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 rounded text-sm ${
                viewMode === 'grid'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Grid-Ansicht"
            >
              ▦
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 rounded text-sm ${
                viewMode === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Listen-Ansicht"
            >
              ☰
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Suche nach Titel oder Inhalt..."
            className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FilterType)}
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Alle Typen</option>
            <option value="table">📊 Tabellen</option>
            <option value="diagram">📈 Diagramme</option>
            <option value="presentation">🎬 Präsentationen</option>
            <option value="note">📝 Notizen</option>
            <option value="other">📄 Andere</option>
          </select>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredArtifacts.length === 0 ? (
          <div className="text-center text-gray-400 mt-12">
            <div className="text-6xl mb-4">📭</div>
            <p className="text-lg mb-2">
              {searchQuery || filterType !== 'all' 
                ? 'Keine Artifacts gefunden'
                : 'Noch keine Artifacts in der Bibliothek'}
            </p>
            <p className="text-sm">
              {searchQuery || filterType !== 'all'
                ? 'Versuche eine andere Suche oder Filter'
                : 'Erstelle Artifacts in deinen Dokumenten über den KI-Assistenten'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredArtifacts.map((artifact: any) => (
              <div
                key={artifact.id}
                className="bg-gray-800 rounded-lg border border-gray-700 hover:border-blue-500 transition-colors p-4 cursor-pointer"
                onClick={() => setSelectedArtifact(artifact)}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-3xl">{getArtifactIcon(artifact)}</span>
                  <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
                    {getArtifactType(artifact)}
                  </span>
                </div>
                <h3 className="text-white font-medium mb-2 line-clamp-2">{artifact.title}</h3>
                <p className="text-sm text-gray-400 line-clamp-3 mb-3">{artifact.content}</p>
                <div className="text-xs text-gray-500 border-t border-gray-700 pt-2">
                  <div className="mb-1">📄 {artifact.documentTitle || 'Unbekanntes Dokument'}</div>
                  <div>{new Date(artifact.createdAt).toLocaleDateString('de-DE')}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List View */
          <div className="space-y-2">
            {filteredArtifacts.map((artifact: any) => (
              <div
                key={artifact.id}
                className="bg-gray-800 rounded-lg border border-gray-700 hover:border-blue-500 transition-colors p-4 cursor-pointer"
                onClick={() => setSelectedArtifact(artifact)}
              >
                <div className="flex items-start gap-4">
                  <span className="text-3xl">{getArtifactIcon(artifact)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="text-white font-medium truncate">{artifact.title}</h3>
                      <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded ml-2">
                        {getArtifactType(artifact)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 line-clamp-2 mb-2">{artifact.content}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>📄 {artifact.documentTitle || 'Unbekanntes Dokument'}</span>
                      <span>•</span>
                      <span>{new Date(artifact.createdAt).toLocaleDateString('de-DE')}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Artifact Detail Modal */}
      {selectedArtifact && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedArtifact(null)}
        >
          <div
            className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between p-6 border-b border-gray-700">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">{getArtifactIcon(selectedArtifact)}</span>
                  <div>
                    <h2 className="text-xl font-bold text-white">{selectedArtifact.title}</h2>
                    <p className="text-sm text-gray-400">
                      {getArtifactType(selectedArtifact)} • {selectedArtifact.documentTitle}
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedArtifact(null)}
                className="text-gray-400 hover:text-white text-3xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-6">
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
                  {selectedArtifact.content}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-700 p-4 bg-gray-900">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  Erstellt: {new Date(selectedArtifact.createdAt).toLocaleString('de-DE')}
                  {selectedArtifact.updatedAt && selectedArtifact.updatedAt !== selectedArtifact.createdAt && (
                    <> • Aktualisiert: {new Date(selectedArtifact.updatedAt).toLocaleString('de-DE')}</>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      navigate(`/documents/${selectedArtifact.documentId}`);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    📄 Zum Dokument
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Möchten Sie dieses Artifact wirklich löschen?')) {
                        deleteMutation.mutate({
                          documentId: selectedArtifact.documentId,
                          artifactId: selectedArtifact.id,
                        });
                      }
                    }}
                    className="px-4 py-2 bg-red-900 text-red-200 rounded hover:bg-red-800"
                  >
                    🗑️ Löschen
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
