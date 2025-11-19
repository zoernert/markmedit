import { useState, useRef } from 'react';

interface DocumentUploadProps {
  onFileSelect: (file: File) => void;
  onRemove: () => void;
  selectedFile: File | null;
  disabled?: boolean;
}

export function DocumentUpload({ onFileSelect, onRemove, selectedFile, disabled }: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
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

    if (disabled) return;

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

    onFileSelect(file);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="mb-3">
      {selectedFile ? (
        <div className="flex items-center gap-2 p-3 bg-gray-700 rounded-lg border border-gray-600">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">📄</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-gray-400">
                  {formatFileSize(selectedFile.size)}
                </p>
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
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer
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
          
          <div className="flex flex-col items-center gap-2">
            <div className="text-4xl">
              {isDragging ? '📥' : '📄'}
            </div>
            <div>
              <p className="text-sm text-gray-300 font-medium mb-1">
                {isDragging 
                  ? 'Datei hier ablegen...' 
                  : 'Dokument hochladen (optional)'
                }
              </p>
              <p className="text-xs text-gray-500">
                TXT, MD, PDF, DOC, DOCX • Max. 10MB
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
