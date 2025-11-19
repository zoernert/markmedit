import { useState, useEffect } from 'react';
import { Artifact } from '../lib/api';

interface ArtifactEditorModalProps {
  artifact: Artifact;
  onSave: (title: string, content: string) => void;
  onClose: () => void;
  isSaving?: boolean;
}

export function ArtifactEditorModal({ artifact, onSave, onClose, isSaving }: ArtifactEditorModalProps) {
  const [title, setTitle] = useState(artifact.title);
  const [content, setContent] = useState(artifact.content);

  useEffect(() => {
    setTitle(artifact.title);
    setContent(artifact.content);
  }, [artifact]);

  const handleSave = () => {
    onSave(title, content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div 
        className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex-1 mr-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded text-lg font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Artifakt-Titel"
              autoFocus
            />
          </div>
          <button
            onClick={onClose}
            className="px-3 py-2 text-gray-400 hover:text-white"
            title="Schließen (ESC)"
          >
            ✕
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden p-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full px-4 py-3 bg-gray-900 text-white rounded font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Artifakt-Inhalt"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-700 bg-gray-800/50">
          <div className="text-sm text-gray-400">
            <span className="mr-4">Zeilen: {content.split('\n').length}</span>
            <span className="mr-4">Zeichen: {content.length}</span>
            <span className="text-xs opacity-70">Strg/Cmd+S zum Speichern</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Speichere...' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
