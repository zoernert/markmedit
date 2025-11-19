import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useState, useRef } from 'react';

type SortField = 'title' | 'updated_at' | 'created_at' | 'version';
type SortOrder = 'asc' | 'desc';
type ViewMode = 'grid' | 'list';
type DocumentFilter = 'all' | 'shared' | 'archived';

interface Document {
  id: string;
  title: string;
  content: string;
  created_at: string | number;
  updated_at: string | number;
  version?: number;
  owner_id?: string;
  accessed_at?: string | number;
  share_id?: string;
  shared_by_email?: string;
  background_color?: string;
  is_pinned?: boolean;
  is_archived?: boolean;
  archived_at?: number;
}

export function DocumentList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [filter, setFilter] = useState<DocumentFilter>('all');
  const [customizingDoc, setCustomizingDoc] = useState<Document | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const importFileInputRef = useRef<HTMLInputElement>(null);
  
  const { data, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api.getDocuments(),
  });

  const { data: sharedData, isLoading: sharedLoading } = useQuery({
    queryKey: ['shared-documents'],
    queryFn: () => api.getSharedDocuments(),
    enabled: filter === 'shared',
  });

  const { data: archivedData, isLoading: archivedLoading } = useQuery({
    queryKey: ['documents-archived'],
    queryFn: () => api.getDocuments({ include_archived: true }),
    enabled: filter === 'archived',
  });

  const createMutation = useMutation({
    mutationFn: () => api.createDocument({
      title: 'Neues Dokument',
      content: '# Neues Dokument\n\nBeginne hier mit deinem Inhalt...',
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      navigate(`/documents/${data.document.id}`);
    },
  });

  const handleCreateDocument = () => {
    createMutation.mutate();
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      return api.uploadFile(file);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      navigate(`/documents/${data.document.id}`);
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
    // Reset input so same file can be uploaded again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const customizeMutation = useMutation({
    mutationFn: ({ id, customization }: { id: string; customization: { background_color?: string | null; is_pinned?: boolean } }) =>
      api.customizeDocument(id, customization),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['shared-documents'] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.archiveDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['documents-archived'] });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => api.unarchiveDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['documents-archived'] });
    },
  });

  const handleTogglePin = (doc: Document, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    customizeMutation.mutate({
      id: doc.id,
      customization: { is_pinned: !doc.is_pinned },
    });
  };

  const handleColorChange = (doc: Document, color: string | null) => {
    customizeMutation.mutate({
      id: doc.id,
      customization: { background_color: color },
    });
    setCustomizingDoc(null);
  };

  const handleArchive = (doc: Document, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`📦 Dokument "${extractTitle(doc.content)}" archivieren?\n\nDas Dokument wird aus der Übersicht entfernt, kann aber jederzeit wiederhergestellt werden.`)) {
      archiveMutation.mutate(doc.id);
    }
  };

  const handleUnarchive = (doc: Document, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    unarchiveMutation.mutate(doc.id);
  };

  const importMutation = useMutation({
    mutationFn: async ({ content, sourceUrl }: { content: string; sourceUrl?: string }) => {
      const response = await fetch('/api/documents/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, sourceUrl }),
      });
      if (!response.ok) throw new Error('Import failed');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setShowImportModal(false);
      setImportUrl('');
      navigate(`/documents/${data.document.id}`);
    },
  });

  const handleImportFromUrl = async () => {
    if (!importUrl) return;
    
    try {
      const response = await fetch(importUrl);
      if (!response.ok) throw new Error('Failed to fetch document');
      const content = await response.text();
      importMutation.mutate({ content, sourceUrl: importUrl });
    } catch (error) {
      alert('Fehler beim Laden des Dokuments von der URL');
    }
  };

  const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.md')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        importMutation.mutate({ content });
      };
      reader.readAsText(file);
    }
    if (importFileInputRef.current) {
      importFileInputRef.current.value = '';
    }
  };

  const extractTitle = (content: string): string => {
    const headingMatch = content.match(/^#+ (.+)$/m);
    if (headingMatch) {
      return headingMatch[1].trim();
    }
    const firstLine = content.split('\n').find(line => line.trim());
    return firstLine?.replace(/^#+\s*/, '').substring(0, 100) || 'Unbenannt';
  };

  const extractPreview = (content: string): string => {
    return content
      .replace(/^#+\s+/gm, '')
      .replace(/[*_~`]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
      .split('\n')
      .filter(line => line.trim())
      .join(' ')
      .substring(0, 200);
  };

  const sortedDocuments = data?.documents ? [...data.documents].sort((a: Document, b: Document) => {
    // Pinned documents always come first
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    
    let aVal: any;
    let bVal: any;

    switch (sortField) {
      case 'title':
        aVal = extractTitle(a.content).toLowerCase();
        bVal = extractTitle(b.content).toLowerCase();
        break;
      case 'created_at':
        aVal = Number(a.created_at);
        bVal = Number(b.created_at);
        break;
      case 'version':
        aVal = a.version || 0;
        bVal = b.version || 0;
        break;
      case 'updated_at':
      default:
        aVal = Number(a.updated_at);
        bVal = Number(b.updated_at);
        break;
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  }) : [];

  const sortedSharedDocuments = sharedData?.documents ? [...sharedData.documents].sort((a: Document, b: Document) => {
    const aVal = Number(a.accessed_at || 0);
    const bVal = Number(b.accessed_at || 0);
    return bVal - aVal; // Most recent first
  }) : [];

  const sortedArchivedDocuments = archivedData?.documents 
    ? [...archivedData.documents].filter(d => d.is_archived).sort((a: Document, b: Document) => {
        const aVal = Number(a.archived_at || 0);
        const bVal = Number(b.archived_at || 0);
        return bVal - aVal; // Most recently archived first
      })
    : [];

  const displayDocuments = filter === 'archived' 
    ? sortedArchivedDocuments 
    : filter === 'shared' 
      ? sortedSharedDocuments 
      : sortedDocuments;
  const displayLoading = filter === 'archived' 
    ? archivedLoading 
    : filter === 'shared' 
      ? sharedLoading 
      : isLoading;
  
  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Dokumente</h2>
          <div className="flex gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".txt,.md,.pdf,.doc,.docx"
              className="hidden"
            />
            <button 
              onClick={handleUploadClick}
              disabled={uploadMutation.isPending}
              className="btn-secondary"
              title="Datei hochladen (TXT, MD, PDF, DOCX)"
            >
              {uploadMutation.isPending ? '📤 ...' : '📤 Datei hochladen'}
            </button>
            <button 
              onClick={() => setShowImportModal(true)}
              className="btn-secondary"
              title="Dokument von URL oder Datei importieren"
            >
              ⬇️ Importieren
            </button>
            <button 
              onClick={handleCreateDocument}
              disabled={createMutation.isPending}
              className="btn-primary"
            >
              {createMutation.isPending ? '...' : '+ Neues Dokument'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              filter === 'all' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            📄 Aktive Dokumente
          </button>
          <button
            onClick={() => setFilter('shared')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              filter === 'shared' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            🔗 Geteilte Dokumente
          </button>
          <button
            onClick={() => setFilter('archived')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              filter === 'archived' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            📦 Archiv
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">
              {displayDocuments.length} Dokument{displayDocuments.length !== 1 ? 'e' : ''}
            </span>
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Sortieren:</span>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
                className="bg-gray-700 text-white text-sm py-1 px-3 rounded border border-gray-600 focus:border-blue-500 focus:outline-none hover:bg-gray-600 transition-colors"
              >
                <option value="updated_at">Letzte Änderung</option>
                <option value="created_at">Erstelldatum</option>
                <option value="title">Titel</option>
                <option value="version">Version</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="text-gray-400 hover:text-white"
                title={sortOrder === 'asc' ? 'Aufsteigend' : 'Absteigend'}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-gray-700 rounded p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1 rounded text-sm ${
                viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Kacheln
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded text-sm ${
                viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Liste
            </button>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-6">
        {displayLoading ? (
          <div className="text-center text-gray-400 mt-8">Lade Dokumente...</div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayDocuments.map((doc: Document) => (
              <div key={doc.id} className="relative group">
                <Link
                  to={`/documents/${doc.id}`}
                  className="card hover:shadow-lg transition-all cursor-pointer block h-full"
                  style={{
                    backgroundColor: doc.background_color || undefined,
                    borderColor: doc.background_color ? doc.background_color : undefined,
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-lg text-white flex-1">
                      {doc.is_pinned && <span className="mr-2">📌</span>}
                      {extractTitle(doc.content)}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-400 line-clamp-3 mb-4">
                    {extractPreview(doc.content)}
                  </p>
                  <div className="mt-auto space-y-1 text-xs text-gray-500">
                    {filter === 'shared' && doc.shared_by_email && (
                      <div className="flex items-center gap-1 text-blue-400">
                        <span>🔗</span>
                        <span>Geteilt von: {doc.shared_by_email}</span>
                      </div>
                    )}
                    {filter === 'shared' && doc.accessed_at ? (
                      <div>Aufgerufen: {new Date(Number(doc.accessed_at)).toLocaleDateString('de-DE')}</div>
                    ) : (
                      <div>Bearbeitet: {new Date(Number(doc.updated_at)).toLocaleDateString('de-DE')}</div>
                    )}
                    {doc.version && <div>Version: {doc.version}</div>}
                  </div>
                </Link>
                
                {/* Action buttons - only visible on hover */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button
                    onClick={(e) => handleTogglePin(doc, e)}
                    className={`p-2 rounded transition-colors ${
                      doc.is_pinned 
                        ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                        : 'bg-gray-700 hover:bg-gray-600 text-white'
                    }`}
                    title={doc.is_pinned ? 'Abpinnen' : 'Anpinnen'}
                  >
                    📌
                  </button>
                  
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCustomizingDoc(doc);
                    }}
                    className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded"
                    title="Farbe ändern"
                  >
                    🎨
                  </button>

                  {filter === 'archived' ? (
                    <button
                      onClick={(e) => handleUnarchive(doc, e)}
                      className="bg-green-600 hover:bg-green-700 text-white p-2 rounded"
                      title="Wiederherstellen"
                    >
                      ♻️
                    </button>
                  ) : (
                    <button
                      onClick={(e) => handleArchive(doc, e)}
                      className="bg-orange-600 hover:bg-orange-700 text-white p-2 rounded"
                      title="Archivieren"
                    >
                      📦
                    </button>
                  )}
                  
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedDoc(doc);
                    }}
                    className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded"
                    title="Details anzeigen"
                  >
                    ℹ️
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {displayDocuments.map((doc: Document) => (
              <div key={doc.id} className="card hover:shadow-lg transition-shadow flex items-center justify-between">
                <Link
                  to={`/documents/${doc.id}`}
                  className="flex-1 flex items-center gap-4"
                >
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">
                      {extractTitle(doc.content)}
                    </h3>
                    <p className="text-sm text-gray-400 line-clamp-1">
                      {extractPreview(doc.content)}
                    </p>
                  </div>
                  <div className="text-sm text-gray-500 text-right whitespace-nowrap">
                    {filter === 'shared' && doc.accessed_at ? (
                      <div>Aufgerufen: {new Date(Number(doc.accessed_at)).toLocaleDateString('de-DE')}</div>
                    ) : (
                      <div>{new Date(Number(doc.updated_at)).toLocaleDateString('de-DE')}</div>
                    )}
                    {doc.version && <div className="text-xs">v{doc.version}</div>}
                    {filter === 'shared' && doc.shared_by_email && (
                      <div className="text-xs text-blue-400">🔗 {doc.shared_by_email}</div>
                    )}
                  </div>
                </Link>
                <div className="flex gap-2 ml-4">
                  {filter === 'archived' ? (
                    <button
                      onClick={(e) => handleUnarchive(doc, e)}
                      className="text-green-400 hover:text-green-300 p-2"
                      title="Wiederherstellen"
                    >
                      ♻️
                    </button>
                  ) : (
                    <button
                      onClick={(e) => handleArchive(doc, e)}
                      className="text-orange-400 hover:text-orange-300 p-2"
                      title="Archivieren"
                    >
                      📦
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedDoc(doc)}
                    className="text-gray-400 hover:text-white p-2"
                    title="Details anzeigen"
                  >
                    ℹ️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {!displayLoading && displayDocuments.length === 0 && (
          <div className="text-center text-gray-400 mt-8">
            {filter === 'archived' ? (
              <>
                <p>📦 Keine archivierten Dokumente</p>
                <p className="text-sm mt-2">Archivierte Dokumente erscheinen hier und können wiederhergestellt werden.</p>
              </>
            ) : filter === 'shared' ? (
              <>
                <p>Keine geteilten Dokumente aufgerufen</p>
                <p className="text-sm mt-2">Dokumente, die über Share-Links aufgerufen werden, erscheinen hier.</p>
              </>
            ) : (
              <>
                <p>Keine Dokumente vorhanden</p>
                <p className="text-sm mt-2">Erstelle dein erstes Dokument!</p>
              </>
            )}
          </div>
        )}
      </div>

      {selectedDoc && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedDoc(null)}
        >
          <div 
            className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-2xl font-bold text-white">
                {extractTitle(selectedDoc.content)}
              </h2>
              <button
                onClick={() => setSelectedDoc(null)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-400">Erstellt</div>
                  <div className="text-white">
                    {new Date(Number(selectedDoc.created_at)).toLocaleString('de-DE', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Letzte Änderung</div>
                  <div className="text-white">
                    {new Date(Number(selectedDoc.updated_at)).toLocaleString('de-DE', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
                {selectedDoc.version && (
                  <div>
                    <div className="text-sm text-gray-400">Version</div>
                    <div className="text-white">{selectedDoc.version}</div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-gray-400">Dokument-ID</div>
                  <div className="text-white text-xs font-mono">{selectedDoc.id}</div>
                </div>
              </div>

              <div>
                <div className="text-sm text-gray-400 mb-2">Vorschau</div>
                <div className="bg-gray-900 rounded p-4 max-h-60 overflow-auto">
                  <p className="text-gray-300 whitespace-pre-wrap">
                    {extractPreview(selectedDoc.content)}...
                  </p>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="btn-secondary"
                >
                  Schließen
                </button>
                <Link
                  to={`/documents/${selectedDoc.id}`}
                  className="btn-primary"
                  onClick={() => setSelectedDoc(null)}
                >
                  Dokument öffnen
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Color picker modal */}
      {customizingDoc && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setCustomizingDoc(null)}
        >
          <div 
            className="bg-gray-800 rounded-lg p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-xl font-bold text-white">
                Kachelfarbe ändern
              </h2>
              <button
                onClick={() => setCustomizingDoc(null)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-400 mb-3">
                Wähle eine Farbe für: <span className="text-white font-semibold">{extractTitle(customizingDoc.content)}</span>
              </p>
              
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[
                  { name: 'Standard', color: null },
                  { name: 'Rot', color: '#7f1d1d' },
                  { name: 'Orange', color: '#7c2d12' },
                  { name: 'Gelb', color: '#713f12' },
                  { name: 'Grün', color: '#14532d' },
                  { name: 'Blau', color: '#1e3a8a' },
                  { name: 'Indigo', color: '#312e81' },
                  { name: 'Lila', color: '#581c87' },
                  { name: 'Pink', color: '#831843' },
                  { name: 'Grau', color: '#374151' },
                  { name: 'Dunkelgrau', color: '#1f2937' },
                  { name: 'Schwarz', color: '#0f172a' },
                ].map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => handleColorChange(customizingDoc, preset.color)}
                    className="h-12 rounded border-2 hover:border-white transition-colors flex items-center justify-center text-xs text-white font-medium"
                    style={{
                      backgroundColor: preset.color || '#1f2937',
                      borderColor: customizingDoc.background_color === preset.color ? '#fff' : '#4b5563',
                    }}
                    title={preset.name}
                  >
                    {preset.color === null && '✕'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setCustomizingDoc(null)}
                className="btn-secondary"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import modal */}
      {showImportModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowImportModal(false)}
        >
          <div 
            className="bg-gray-800 rounded-lg p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-xl font-bold text-white">
                Dokument importieren
              </h2>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-400 mb-4">
                Importiere ein Dokument von einer Share-URL oder lade eine .md-Datei hoch.
                Das Dokument wird als schreibgeschützt importiert und kann mit dem Original synchronisiert werden.
              </p>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Von URL importieren
                </label>
                <input
                  type="url"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://markmedit.example.com/share/xyz.md"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleImportFromUrl}
                  disabled={!importUrl || importMutation.isPending}
                  className="mt-2 w-full btn-primary"
                >
                  {importMutation.isPending ? 'Importiere...' : 'Von URL importieren'}
                </button>
              </div>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-gray-800 text-gray-400">oder</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Datei hochladen
                </label>
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".md"
                  onChange={handleImportFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => importFileInputRef.current?.click()}
                  disabled={importMutation.isPending}
                  className="w-full btn-secondary"
                >
                  📁 .md Datei auswählen
                </button>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowImportModal(false)}
                className="btn-secondary"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
