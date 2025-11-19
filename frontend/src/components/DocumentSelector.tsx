import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export type DocumentSource = 
  | { type: 'upload'; file: File; name: string; size: number }
  | { type: 'existing'; documentId: string; name: string; preview: string }
  | { type: 'artifact'; artifactId: string; documentId: string; name: string; preview: string };

interface DocumentSelectorProps {
  currentDocumentId: string;
  onSourceSelect: (source: DocumentSource) => void;
  onRemove: () => void;
  selectedSource: DocumentSource | null;
  disabled?: boolean;
}

export function DocumentSelector({ 
  currentDocumentId,
  onSourceSelect, 
  onRemove, 
  selectedSource, 
  disabled 
}: DocumentSelectorProps) {
  const [mode, setMode] = useState<'documents' | 'artifact'>('documents');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing documents (exclude current)
  const { data: documents = [] } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api.getDocuments(),
    select: (docs: any) => docs.documents.filter((d: any) => d.id !== currentDocumentId),
  });

  // Load artifacts from current document
  const { data: artifacts = [] } = useQuery({
    queryKey: ['artifacts', currentDocumentId],
    queryFn: () => api.getArtifacts(currentDocumentId),
  });

  // File Upload Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && mode === 'documents') {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled || mode !== 'documents') return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFile = (file: File) => {
    // Validate file type
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];

    const allowedExtensions = ['.txt', '.md', '.markdown', '.pdf', '.doc', '.docx'];
    const hasValidExtension = allowedExtensions.some(ext => 
      file.name.toLowerCase().endsWith(ext)
    );

    if (!allowedTypes.includes(file.type) && !hasValidExtension) {
      alert('Nicht unterstütztes Dateiformat. Erlaubt: TXT, MD, PDF, DOC, DOCX');
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      alert('Datei zu groß. Maximum: 10MB');
      return;
    }

    onSourceSelect({
      type: 'upload',
      file,
      name: file.name,
      size: file.size,
    });
  };

  const handleExistingDocumentSelect = (doc: any) => {
    onSourceSelect({
      type: 'existing',
      documentId: doc.id,
      name: doc.title,
      preview: doc.content.substring(0, 200) + '...',
    });
  };

  const handleArtifactSelect = (artifact: any) => {
    onSourceSelect({
      type: 'artifact',
      artifactId: artifact.id,
      documentId: currentDocumentId,
      name: artifact.title,
      preview: artifact.content.substring(0, 200) + '...',
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getSourceIcon = (source: DocumentSource): string => {
    if (source.type === 'upload') return '📄';
    if (source.type === 'existing') return '📋';
    if (source.type === 'artifact') return '📦';
    return '📄';
  };

  const getSourceLabel = (source: DocumentSource): string => {
    if (source.type === 'upload') return 'Hochgeladene Datei';
    if (source.type === 'existing') return 'Bestehendes Dokument';
    if (source.type === 'artifact') return 'Artefakt';
    return '';
  };

  return (
    <div className="mb-3">
      {/* Mode Tabs */}
      {!selectedSource && (
        <div className="flex gap-1 mb-2 bg-gray-800 p-1 rounded-lg">
          <button
            onClick={() => setMode('documents')}
            className={`flex-1 px-3 py-2 text-sm rounded transition-colors ${
              mode === 'documents'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            📋 Dokumente ({(documents as any[]).length})
          </button>
          <button
            onClick={() => setMode('artifact')}
            className={`flex-1 px-3 py-2 text-sm rounded transition-colors ${
              mode === 'artifact'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            📦 Artefakte ({artifacts.length})
          </button>
        </div>
      )}

      {/* Selected Source Display */}
      {selectedSource ? (
        <div className="flex items-center gap-2 p-3 bg-gray-700 rounded-lg border border-gray-600">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">{getSourceIcon(selectedSource)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 mb-0.5">
                  {getSourceLabel(selectedSource)}
                </p>
                <p className="text-sm text-white font-medium truncate">
                  {selectedSource.name}
                </p>
                {selectedSource.type === 'upload' && (
                  <p className="text-xs text-gray-400">
                    {formatFileSize(selectedSource.size)}
                  </p>
                )}
                {(selectedSource.type === 'existing' || selectedSource.type === 'artifact') && (
                  <p className="text-xs text-gray-400 line-clamp-1">
                    {selectedSource.preview}
                  </p>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onRemove}
            disabled={disabled}
            className="px-3 py-1 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
          >
            ✕ Entfernen
          </button>
        </div>
      ) : (
        <>
          {/* Documents Mode: Upload + Existing Documents Combined */}
          {mode === 'documents' && (
            <div className="space-y-3">
              {/* Upload Area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
                  relative border-2 border-dashed rounded-lg p-4 text-center transition-all cursor-pointer
                  ${isDragging 
                    ? 'border-blue-500 bg-blue-500/10' 
                    : 'border-gray-600 hover:border-gray-500 bg-gray-800/50'
                  }
                  ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                onClick={() => !disabled && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileInput}
                  accept=".txt,.md,.markdown,.pdf,.doc,.docx,text/plain,text/markdown,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  disabled={disabled}
                />
                
                <div className="flex items-center justify-center gap-3">
                  <div className="text-3xl">
                    {isDragging ? '📥' : '�'}
                  </div>
                  <div className="text-left">
                    <p className="text-sm text-gray-300 font-medium">
                      {isDragging 
                        ? 'Datei hier ablegen...' 
                        : 'Neues Dokument hochladen'
                      }
                    </p>
                    <p className="text-xs text-gray-500">
                      TXT, MD, PDF, DOC, DOCX • Max. 10MB
                    </p>
                  </div>
                </div>
              </div>

              {/* Existing Documents List */}
              {(documents as any[]).length > 0 && (
                <div>
                  <h4 className="text-xs text-gray-400 uppercase tracking-wide mb-2 px-1">
                    Oder wähle bestehendes Dokument:
                  </h4>
                  <div className="border border-gray-600 rounded-lg bg-gray-800/50 max-h-48 overflow-y-auto">
                    <div className="divide-y divide-gray-700">
                      {(documents as any[]).map((doc: any) => (
                        <button
                          key={doc.id}
                          onClick={() => handleExistingDocumentSelect(doc)}
                          disabled={disabled}
                          className="w-full p-3 text-left hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-lg mt-0.5">📋</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white font-medium truncate">
                                {doc.title}
                              </p>
                              <p className="text-xs text-gray-400 mt-1 line-clamp-1">
                                {doc.content.substring(0, 80)}...
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                {new Date(doc.updatedAt).toLocaleDateString('de-DE')}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Artifacts Mode */}
          {mode === 'artifact' && (
            <div className="border border-gray-600 rounded-lg bg-gray-800/50 max-h-64 overflow-y-auto">
              {artifacts.length === 0 ? (
                <div className="p-6 text-center text-gray-400">
                  <p className="text-sm">Keine Artefakte vorhanden</p>
                  <p className="text-xs mt-1">Erstelle Notizen oder speichere KI-Antworten als Artefakte</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-700">
                  {artifacts.map((artifact: any) => (
                    <button
                      key={artifact.id}
                      onClick={() => handleArtifactSelect(artifact)}
                      disabled={disabled}
                      className="w-full p-3 text-left hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg mt-0.5">📦</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium truncate">
                            {artifact.title}
                          </p>
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                            {artifact.content.substring(0, 100)}...
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(artifact.createdAt).toLocaleDateString('de-DE')}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
