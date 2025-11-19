import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ConvertToPresentationResponse } from '../lib/api';
import { ArtifactEditorModal } from './ArtifactEditorModal';
import { ArtifactActionsModal } from './ArtifactActionsModal';
import ConvertToPresentationModal from './ConvertToPresentationModal';
import PresentationViewer from './PresentationViewer';

interface ArtifactsPanelProps {
  documentId: string;
  onUseInContext: (artifactIds: string[]) => void;
}

export function ArtifactsPanel({ documentId, onUseInContext }: ArtifactsPanelProps) {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'document' | 'library'>('document');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showActionsModal, setShowActionsModal] = useState<string | null>(null);
  const [convertingArtifactId, setConvertingArtifactId] = useState<string | null>(null);
  const [presentationResult, setPresentationResult] = useState<ConvertToPresentationResponse | null>(null);
  const [viewingPresentationId, setViewingPresentationId] = useState<string | null>(null);
  const [creatingNote, setCreatingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  // Query for document-specific artifacts
  const { data: documentArtifacts = [], isLoading: isLoadingDocument } = useQuery({
    queryKey: ['artifacts', documentId],
    queryFn: () => api.getArtifacts(documentId),
    enabled: viewMode === 'document',
  });

  // Query for all artifacts (library)
  const { data: allArtifactsData, isLoading: isLoadingLibrary } = useQuery({
    queryKey: ['artifacts', 'all'],
    queryFn: () => api.getAllArtifacts(),
    enabled: viewMode === 'library',
  });

  const artifacts = viewMode === 'document' ? documentArtifacts : (allArtifactsData?.artifacts || []);
  const isLoading = viewMode === 'document' ? isLoadingDocument : isLoadingLibrary;

  const updateMutation = useMutation({
    mutationFn: ({ id, title, content }: { id: string; title: string; content: string }) =>
      api.updateArtifact(documentId, id, { title, content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts', documentId] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteArtifact(documentId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts', documentId] });
    },
  });

  const copyMoveMutation = useMutation({
    mutationFn: ({ artifactId, targetDocId, move }: { artifactId: string; targetDocId: string; move: boolean }) =>
      api.copyArtifact(documentId, artifactId, { targetDocumentId: targetDocId, moveInsteadOfCopy: move }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['artifacts', documentId] });
      queryClient.invalidateQueries({ queryKey: ['artifacts', data.artifact.documentId] });
      queryClient.invalidateQueries({ queryKey: ['artifacts', 'all'] });
      setShowActionsModal(null);
    },
  });

  // Add artifact from library to current document
  const addToDocumentMutation = useMutation({
    mutationFn: ({ artifactId, sourceDocId }: { artifactId: string; sourceDocId: string }) =>
      api.copyArtifact(sourceDocId, artifactId, { targetDocumentId: documentId, moveInsteadOfCopy: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts', documentId] });
      alert('✅ Artifact zum Dokument hinzugefügt!');
    },
    onError: () => {
      alert('❌ Fehler beim Hinzufügen des Artifacts.');
    },
  });

  const convertMutation = useMutation({
    mutationFn: ({ artifactId, title }: { artifactId: string; title: string }) =>
      api.convertArtifactToDocument(documentId, artifactId, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setShowActionsModal(null);
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: ({ title, content }: { title: string; content: string }) =>
      api.createArtifact(documentId, {
        title,
        content,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts', documentId] });
      setCreatingNote(false);
      setNoteTitle('');
      setNoteContent('');
    },
  });

  const embedArtifactMutation = useMutation({
    mutationFn: (artifactId: string) =>
      api.embedArtifact(documentId, artifactId, 'end'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      alert('✅ Artifact eingebettet! Das Artifact ist jetzt bidirektional mit dem Dokument verknüpft.');
    },
    onError: () => {
      alert('❌ Fehler beim Einbetten des Artifacts.');
    },
  });

  const handleEmbedArtifact = (artifactId: string) => {
    if (confirm('🔗 Artifact in Dokument einbetten?\n\nDas Artifact wird am Ende des Dokuments eingefügt und bidirektional verknüpft:\n• Änderungen im Dokument → Artifact wird aktualisiert\n• Änderungen am Artifact → Alle verknüpften Dokumente werden aktualisiert')) {
      embedArtifactMutation.mutate(artifactId);
    }
  };

  const handleToggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleUseSelected = () => {
    onUseInContext(Array.from(selectedIds));
  };

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  if (isLoading) {
    return <div className="p-4 text-gray-400">Lade Artifakte...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with Tabs */}
      <div className="p-4 border-b border-gray-700">
        {/* Tab Switcher */}
        <div className="flex gap-2 mb-3 bg-gray-900 rounded-lg p-1">
          <button
            onClick={() => {
              setViewMode('document');
              setSelectedIds(new Set());
            }}
            className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
              viewMode === 'document'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            📄 Dieses Dokument
          </button>
          <button
            onClick={() => {
              setViewMode('library');
              setSelectedIds(new Set());
            }}
            className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
              viewMode === 'library'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            📚 Bibliothek
          </button>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-white">
            {viewMode === 'document' ? '📦 Artifakte' : '📚 Alle Artifakte'}
          </h3>
          <div className="flex items-center gap-2">
            {viewMode === 'document' && (
              <button
                onClick={() => setCreatingNote(true)}
                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                title="Neue Notiz für Research Batch erstellen"
              >
                ➕ Notiz
              </button>
            )}
            <span className="text-sm text-gray-400">{artifacts.length}</span>
          </div>
        </div>
        {viewMode === 'document' && selectedIds.size > 0 && (
          <button
            onClick={handleUseSelected}
            className="w-full px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            ✓ {selectedIds.size} als Kontext verwenden
          </button>
        )}
        {viewMode === 'library' && (
          <p className="text-xs text-gray-400 mt-1">
            Klicke auf ➕, um ein Artifact zu diesem Dokument hinzuzufügen
          </p>
        )}
      </div>

      {/* Artifacts List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Create Note Form - only in document mode */}
        {viewMode === 'document' && creatingNote && (
          <div className="bg-green-900 border-2 border-green-600 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-white font-semibold">📝 Neue Notiz erstellen</h4>
              <button
                onClick={() => {
                  setCreatingNote(false);
                  setNoteTitle('');
                  setNoteContent('');
                }}
                className="text-gray-300 hover:text-white"
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Notiz-Titel (z.B. 'Recherche-Idee: Batteriespeicher')"
              className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-green-500 focus:outline-none"
              autoFocus
            />
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Notiz-Inhalt (z.B. 'Untersuche aktuelle Regelungen für Heimspeicher in Deutschland')"
              className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-green-500 focus:outline-none resize-none"
              rows={4}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (noteTitle.trim() && noteContent.trim()) {
                    createNoteMutation.mutate({ title: noteTitle.trim(), content: noteContent.trim() });
                  }
                }}
                disabled={!noteTitle.trim() || !noteContent.trim() || createNoteMutation.isPending}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                {createNoteMutation.isPending ? '💾 Speichere...' : '✓ Notiz speichern'}
              </button>
              <button
                onClick={() => {
                  setCreatingNote(false);
                  setNoteTitle('');
                  setNoteContent('');
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
              >
                Abbrechen
              </button>
            </div>
            <p className="text-xs text-gray-300">
              💡 Tipp: Erstelle mehrere Notizen mit Recherche-Ideen und nutze sie dann im Research Tab mit "Batch Research"
            </p>
          </div>
        )}

        {artifacts.length === 0 ? (
          <div className="text-center text-gray-400 mt-8">
            <p className="mb-2">Noch keine Artifakte</p>
            <p className="text-xs">Speichere KI-Antworten als Artifakte oder erstelle Notizen für Deep Research</p>
          </div>
        ) : (
          artifacts.map((artifact: any) => (
            <div
              key={artifact.id}
              className="bg-gray-700 rounded-lg p-3 space-y-2"
            >
              <div className="flex items-start gap-2">
                {viewMode === 'document' && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(artifact.id)}
                    onChange={() => handleToggleSelection(artifact.id)}
                    className="mt-1"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-medium truncate">{artifact.title}</h4>
                  {viewMode === 'library' && artifact.documentTitle && (
                    <p className="text-xs text-gray-400">
                      📄 Aus: {artifact.documentTitle}
                    </p>
                  )}
                  <p className="text-sm text-gray-300 mt-1 line-clamp-3 whitespace-pre-wrap">
                    {artifact.content}
                  </p>
                  <div className="text-xs text-gray-400 mt-2">
                    {new Date(artifact.createdAt).toLocaleString('de-DE')}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-gray-600">
                {viewMode === 'library' ? (
                  <>
                    {/* Library mode: Add to current document */}
                    <button
                      onClick={() => {
                        if (artifact.documentId === documentId) {
                          alert('ℹ️ Dieses Artifact ist bereits in diesem Dokument.');
                        } else {
                          addToDocumentMutation.mutate({ 
                            artifactId: artifact.id, 
                            sourceDocId: artifact.documentId 
                          });
                        }
                      }}
                      disabled={addToDocumentMutation.isPending || artifact.documentId === documentId}
                      className={`px-2 py-1 rounded text-xs ${
                        artifact.documentId === documentId
                          ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                          : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                      title={artifact.documentId === documentId ? 'Bereits in diesem Dokument' : 'Zu diesem Dokument hinzufügen'}
                    >
                      {artifact.documentId === documentId ? '✓ Im Dokument' : '➕ Hinzufügen'}
                    </button>
                    <button
                      onClick={() => setEditingId(artifact.id)}
                      className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                      title="Im großen Editor ansehen"
                    >
                      👁️ Ansehen
                    </button>
                  </>
                ) : (
                  <>
                    {/* Document mode: Full edit capabilities */}
                    <button
                      onClick={() => setEditingId(artifact.id)}
                      className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                      title="Im großen Editor öffnen"
                    >
                      📝 Editor
                    </button>
                    <button
                      onClick={() => handleEmbedArtifact(artifact.id)}
                      className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                      title="In Dokument einbetten (bidirektional verknüpft)"
                    >
                      🔗 Einbetten
                    </button>
                    <button
                      onClick={() => setShowActionsModal(artifact.id)}
                      className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"
                      title="Kopieren/Verschieben oder als Dokument speichern"
                    >
                      ⚡ Aktionen
                    </button>
                  </>
                )}
                {/* Check if artifact is already a presentation */}
                {artifact.title.toLowerCase().includes('präsentation') && artifact.content.includes('reveal.js') ? (
                  <button
                    onClick={() => setViewingPresentationId(artifact.id)}
                    className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                    title="Präsentation ansehen"
                  >
                    ▶️ Ansehen
                  </button>
                ) : (
                  <button
                    onClick={() => setConvertingArtifactId(artifact.id)}
                    className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                    title="Als Präsentation konvertieren"
                  >
                    📊 Präsentation
                  </button>
                )}
                <button
                  onClick={() => copyToClipboard(artifact.content)}
                  className="px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-500"
                >
                  📋 Kopieren
                </button>
                <button
                  onClick={() => {
                    if (confirm('Artifakt löschen?')) {
                      deleteMutation.mutate(artifact.id);
                    }
                  }}
                  className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 ml-auto"
                >
                  🗑️ Löschen
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Editor Modal */}
      {editingId && artifacts.find(a => a.id === editingId) && (
        <ArtifactEditorModal
          artifact={artifacts.find(a => a.id === editingId)!}
          onSave={(title, content) => {
            updateMutation.mutate({ id: editingId, title, content });
          }}
          onClose={() => setEditingId(null)}
          isSaving={updateMutation.isPending}
        />
      )}

      {/* Actions Modal */}
      {showActionsModal && artifacts.find(a => a.id === showActionsModal) && (
        <ArtifactActionsModal
          artifactId={showActionsModal}
          artifactTitle={artifacts.find(a => a.id === showActionsModal)!.title}
          currentDocumentId={documentId}
          onCopyMove={(targetDocId, move) => {
            copyMoveMutation.mutate({ artifactId: showActionsModal, targetDocId, move });
          }}
          onConvert={(title) => {
            convertMutation.mutate({ artifactId: showActionsModal, title });
          }}
          onClose={() => setShowActionsModal(null)}
          isProcessing={copyMoveMutation.isPending || convertMutation.isPending}
        />
      )}

      {/* Convert to Presentation Modal */}
      {convertingArtifactId && artifacts.find(a => a.id === convertingArtifactId) && (
        <ConvertToPresentationModal
          isOpen={!!convertingArtifactId}
          onClose={() => setConvertingArtifactId(null)}
          documentContent={artifacts.find(a => a.id === convertingArtifactId)!.content}
          documentId={documentId}
          documentTitle={artifacts.find(a => a.id === convertingArtifactId)!.title}
          onConversionComplete={(result) => {
            setPresentationResult(result);
            setConvertingArtifactId(null);
            queryClient.invalidateQueries({ queryKey: ['artifacts', documentId] });
          }}
        />
      )}

      {/* Presentation Viewer for newly created presentations */}
      {presentationResult && (
        <PresentationViewer
          isOpen={!!presentationResult}
          onClose={() => setPresentationResult(null)}
          htmlContent={presentationResult.html}
          title={`Präsentation: ${presentationResult.presentation.title}`}
        />
      )}

      {/* Presentation Viewer for existing presentation artifacts */}
      {viewingPresentationId && artifacts.find(a => a.id === viewingPresentationId) && (
        <PresentationViewer
          isOpen={!!viewingPresentationId}
          onClose={() => setViewingPresentationId(null)}
          htmlContent={artifacts.find(a => a.id === viewingPresentationId)!.content}
          title={artifacts.find(a => a.id === viewingPresentationId)!.title}
        />
      )}
    </div>
  );
}
