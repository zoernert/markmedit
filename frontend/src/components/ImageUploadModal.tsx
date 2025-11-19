import React, { useState } from 'react';
import { ImageUpload } from './ImageUpload';

interface ImageUploadModalProps {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  onImageInserted: (imageUrl: string) => void;
}

export const ImageUploadModal: React.FC<ImageUploadModalProps> = ({
  documentId,
  isOpen,
  onClose,
  onImageInserted,
}) => {
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleImageUploaded = (url: string) => {
    setUploadedUrl(url);
  };

  const handleInsert = () => {
    if (uploadedUrl) {
      onImageInserted(uploadedUrl);
      setUploadedUrl(null);
      onClose();
    }
  };

  const handleClose = () => {
    setUploadedUrl(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Bild hochladen</h2>
            <button
              onClick={handleClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <ImageUpload
            documentId={documentId}
            onImageUploaded={handleImageUploaded}
            className="mb-4"
          />

          {uploadedUrl && (
            <div className="mt-6 space-y-4">
              <div className="border rounded-lg p-4 bg-gray-50">
                <p className="text-sm text-gray-600 mb-2">Vorschau:</p>
                <img
                  src={uploadedUrl}
                  alt="Uploaded preview"
                  className="max-w-full h-auto rounded border"
                  style={{ maxHeight: '300px' }}
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <p className="text-sm text-gray-700 mb-2">Markdown-Syntax:</p>
                <code className="text-xs bg-white px-2 py-1 rounded border block overflow-x-auto">
                  ![Bildbeschreibung]({uploadedUrl})
                </code>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleInsert}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  In Dokument einfügen
                </button>
              </div>
            </div>
          )}

          {!uploadedUrl && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Schließen
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
