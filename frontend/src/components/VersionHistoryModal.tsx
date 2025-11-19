import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface DocumentVersion {
  id: string;
  version: number;
  title: string;
  changeSummary: string;
  createdAt: number;
  contentLength: number;
}

interface VersionHistoryModalProps {
  documentId: string;
  onClose: () => void;
}

export function VersionHistoryModal({ documentId, onClose }: VersionHistoryModalProps) {
  const queryClient = useQueryClient();
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [viewContent, setViewContent] = useState<string | null>(null);

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['document-versions', documentId],
    queryFn: () => api.getDocumentVersions(documentId),
  });

  const restoreMutation = useMutation({
    mutationFn: (versionId: string) => api.restoreDocumentVersion(documentId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      onClose();
    },
  });

  const handleViewVersion = async (versionId: string) => {
    setSelectedVersion(versionId);
    const versionData = await api.getDocumentVersion(documentId, versionId);
    setViewContent(versionData.content);
  };

  const handleRestore = (version: DocumentVersion) => {
    if (confirm(`Version ${version.version} wiederherstellen?\n\n"${version.changeSummary}"\n\nDie aktuelle Version wird als neue Version gespeichert.`)) {
      restoreMutation.mutate(version.id);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">📜 Versions-Historie</h3>
          <button
            onClick={onClose}
            className="px-3 py-2 text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Versions List */}
          <div className="w-1/3 border-r border-gray-700 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-gray-400">Lade Versionen...</div>
            ) : versions.length === 0 ? (
              <div className="p-4 text-gray-400">Keine Versionen verfügbar</div>
            ) : (
              <div className="divide-y divide-gray-700">
                {versions.map((version: DocumentVersion) => (
                  <div
                    key={version.id}
                    className={`p-4 cursor-pointer hover:bg-gray-700/50 transition ${
                      selectedVersion === version.id ? 'bg-gray-700' : ''
                    }`}
                    onClick={() => handleViewVersion(version.id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-400 font-mono font-bold">
                          v{version.version}
                        </span>
                        {version.version === versions[0].version && (
                          <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                            Aktuell
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(version.createdAt).toLocaleDateString('de-DE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    
                    <h4 className="text-sm text-white font-medium mb-1 truncate">
                      {version.title}
                    </h4>
                    
                    <p className="text-xs text-gray-400 mb-2">
                      {version.changeSummary}
                    </p>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        {(version.contentLength / 1024).toFixed(1)} KB
                      </span>
                      
                      {version.version !== versions[0].version && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestore(version);
                          }}
                          disabled={restoreMutation.isPending}
                          className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600"
                        >
                          ↺ Wiederherstellen
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Content Preview */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {viewContent ? (
              <>
                <div className="p-4 border-b border-gray-700 bg-gray-900/50">
                  <h4 className="text-sm font-medium text-gray-300">Vorschau</h4>
                </div>
                <div className="flex-1 overflow-y-auto p-4 bg-gray-900">
                  <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
                    {viewContent}
                  </pre>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <p className="text-lg mb-2">👈</p>
                  <p>Wähle eine Version zum Anzeigen</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-800/50">
          <div className="flex items-center justify-between text-sm text-gray-400">
            <span>{versions.length} Version{versions.length !== 1 ? 'en' : ''}</span>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
            >
              Schließen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
