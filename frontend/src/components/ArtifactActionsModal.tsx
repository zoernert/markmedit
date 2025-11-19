import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface DocumentInfo {
  id: string;
  title: string;
}

interface ArtifactActionsModalProps {
  artifactId: string;
  artifactTitle: string;
  currentDocumentId: string;
  onCopyMove: (targetDocumentId: string, move: boolean) => void;
  onConvert: (newDocTitle: string) => void;
  onClose: () => void;
  isProcessing?: boolean;
}

export function ArtifactActionsModal({ 
  artifactTitle, 
  currentDocumentId, 
  onCopyMove, 
  onConvert, 
  onClose, 
  isProcessing 
}: ArtifactActionsModalProps) {
  const [activeTab, setActiveTab] = useState<'copy' | 'convert'>('copy');
  const [targetDocId, setTargetDocId] = useState('');
  const [moveInsteadOfCopy, setMoveInsteadOfCopy] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState(artifactTitle);

  const { data: documentsData } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api.getDocuments(),
  });

  // Backend returns { documents: [...] }
  const documents = (documentsData as any)?.documents || [];
  const availableDocuments = documents.filter((doc: DocumentInfo) => doc.id !== currentDocumentId);

  const handleCopyMove = () => {
    if (targetDocId) {
      onCopyMove(targetDocId, moveInsteadOfCopy);
    }
  };

  const handleConvert = () => {
    if (newDocTitle.trim()) {
      onConvert(newDocTitle.trim());
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Artifakt-Aktionen</h3>
          <button
            onClick={onClose}
            className="px-3 py-2 text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('copy')}
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              activeTab === 'copy'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            📁 Kopieren/Verschieben
          </button>
          <button
            onClick={() => setActiveTab('convert')}
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              activeTab === 'convert'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            📄 Als Dokument speichern
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'copy' ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-400 mb-3">
                  Artifakt "<span className="text-white font-medium">{artifactTitle}</span>" zu einem anderen Dokument kopieren oder verschieben
                </p>
                
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Ziel-Dokument auswählen
                </label>
                <select
                  value={targetDocId}
                  onChange={(e) => setTargetDocId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Bitte wählen --</option>
                  {availableDocuments.map((doc: DocumentInfo) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3 p-3 bg-gray-700/50 rounded">
                <input
                  type="checkbox"
                  id="moveInsteadOfCopy"
                  checked={moveInsteadOfCopy}
                  onChange={(e) => setMoveInsteadOfCopy(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="moveInsteadOfCopy" className="text-sm text-gray-300 cursor-pointer">
                  <span className="font-medium">Verschieben</span> statt kopieren
                  <span className="block text-xs text-gray-400 mt-1">
                    {moveInsteadOfCopy 
                      ? '⚠️ Artifakt wird aus dem aktuellen Dokument entfernt' 
                      : 'ℹ️ Artifakt bleibt im aktuellen Dokument erhalten'}
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleCopyMove}
                  disabled={!targetDocId || isProcessing}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  {isProcessing ? 'Verarbeite...' : (moveInsteadOfCopy ? '➜ Verschieben' : '📋 Kopieren')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-400 mb-3">
                  Erstelle ein neues Dokument aus dem Artifakt "<span className="text-white font-medium">{artifactTitle}</span>"
                </p>
                
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Titel des neuen Dokuments
                </label>
                <input
                  type="text"
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Dokumenttitel eingeben"
                  autoFocus
                />
              </div>

              <div className="p-3 bg-blue-900/20 border border-blue-700/30 rounded">
                <p className="text-sm text-blue-300">
                  ℹ️ Der Inhalt des Artifakts wird als neues Dokument gespeichert. Das Original-Artifakt bleibt erhalten.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleConvert}
                  disabled={!newDocTitle.trim() || isProcessing}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  {isProcessing ? 'Erstelle...' : '📄 Dokument erstellen'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
