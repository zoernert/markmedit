import React, { useState } from 'react';
import { api } from '../lib/api';
import type { ConvertToPresentationParams, ConvertToPresentationResponse } from '../lib/api';

// Simple SVG icons
const PresentationIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10m-5-18v18m8-14H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const SparklesIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const LoaderIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

interface ConvertToPresentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentContent: string;
  documentId: string;
  documentTitle: string;
  onConversionComplete?: (result: ConvertToPresentationResponse) => void;
}

const ConvertToPresentationModal: React.FC<ConvertToPresentationModalProps> = ({
  isOpen,
  onClose,
  documentContent,
  documentId,
  documentTitle,
  onConversionComplete,
}) => {
  const [userPrompt, setUserPrompt] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark' | 'corporate' | 'modern'>('modern');
  const [maxSlidesPerSection, setMaxSlidesPerSection] = useState(4);
  const [includeImages, setIncludeImages] = useState(true);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConvert = async () => {
    setIsConverting(true);
    setError(null);

    try {
      const params: ConvertToPresentationParams = {
        content: documentContent,
        userPrompt: userPrompt.trim() || undefined,
        maxSlidesPerSection,
        includeImages,
        theme,
      };

      const result = await api.convertToPresentation(params);
      
      // Save as artifact
      const artifactTitle = `Präsentation: ${documentTitle}`;
      await api.createArtifact(documentId, {
        title: artifactTitle,
        content: result.html,
      });

      if (onConversionComplete) {
        onConversionComplete(result);
      }

      onClose();
    } catch (err: any) {
      console.error('Conversion error:', err);
      setError(err.response?.data?.error || 'Fehler bei der Konvertierung');
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PresentationIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Dokument in Präsentation umwandeln
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            disabled={isConverting}
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* User Prompt */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <SparklesIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              Spezielle Anweisungen (optional)
            </label>
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="z.B. 'Fokus auf technische Details' oder 'Executive Summary Stil' oder 'Für externe Präsentation'"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none"
              rows={3}
              disabled={isConverting}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Die KI wird Ihr Dokument intelligent strukturieren. Sie können hier zusätzliche Hinweise geben.
            </p>
          </div>

          {/* Theme Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Design-Theme
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'modern', label: 'Modern', colors: ['#2563eb', '#3b82f6', '#60a5fa'] },
                { value: 'light', label: 'Hell', colors: ['#3b82f6', '#93c5fd', '#dbeafe'] },
                { value: 'dark', label: 'Dunkel', colors: ['#1e293b', '#334155', '#475569'] },
                { value: 'corporate', label: 'Corporate', colors: ['#1e40af', '#3b82f6', '#93c5fd'] },
              ].map((themeOption) => (
                <button
                  key={themeOption.value}
                  onClick={() => setTheme(themeOption.value as any)}
                  disabled={isConverting}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    theme === themeOption.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-4 h-4 rounded-full ${theme === themeOption.value ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {themeOption.label}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {themeOption.colors.map((color, idx) => (
                      <div
                        key={idx}
                        className="h-6 flex-1 rounded"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Max Slides Per Section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Max. Folien pro Abschnitt: <span className="text-blue-600 dark:text-blue-400 font-semibold">{maxSlidesPerSection}</span>
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={maxSlidesPerSection}
              onChange={(e) => setMaxSlidesPerSection(Number(e.target.value))}
              disabled={isConverting}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>Kompakt (1)</span>
              <span>Detailliert (10)</span>
            </div>
          </div>

          {/* Include Images Toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Visuelle Elemente vorschlagen
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                KI schlägt Icons, Diagramme und Fotos für Folien vor
              </p>
            </div>
            <button
              onClick={() => setIncludeImages(!includeImages)}
              disabled={isConverting}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                includeImages ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  includeImages ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Info Box */}
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>Info:</strong> Die KI analysiert Ihr Dokument und erstellt eine strukturierte Präsentation mit:
            </p>
            <ul className="mt-2 text-xs text-blue-700 dark:text-blue-400 space-y-1 ml-4">
              <li>• Titelfolie und Agenda</li>
              <li>• Max. 7 Stichpunkte pro Folie</li>
              <li>• Sprechernotizen für Details</li>
              <li>• Abschlussfolie mit Zusammenfassung</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 p-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isConverting}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            onClick={handleConvert}
            disabled={isConverting || !documentContent.trim()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isConverting ? (
              <>
                <LoaderIcon className="w-4 h-4 animate-spin" />
                Konvertiere...
              </>
            ) : (
              <>
                <PresentationIcon className="w-4 h-4" />
                Präsentation erstellen
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConvertToPresentationModal;
