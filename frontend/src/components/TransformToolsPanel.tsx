import React, { useState } from 'react';
import { api } from '../lib/api';

interface TransformToolsPanelProps {
  documentId: string;
  documentContent: string;
  onInsertContent?: (content: string) => void;
}

type TransformationType =
  | 'summary'
  | 'outline'
  | 'questions'
  | 'key-points'
  | 'expand'
  | 'simplify'
  | 'academic'
  | 'podcast-script';

type CitationStyle = 'apa' | 'mla' | 'chicago';

export const TransformToolsPanel: React.FC<TransformToolsPanelProps> = ({
  documentId,
  documentContent,
  onInsertContent,
}) => {
  const [activeTab, setActiveTab] = useState<'transform' | 'podcast' | 'citations' | 'questions'>('transform');
  const [transformationType, setTransformationType] = useState<TransformationType>('summary');
  const [targetAudience, setTargetAudience] = useState('');
  const [numHosts, setNumHosts] = useState(2);
  const [citationStyle, setCitationStyle] = useState<CitationStyle>('apa');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');

  const handleTransform = async () => {
    setLoading(true);
    setError('');
    setResult('');

    try {
      const response = await api.transformDocument(
        documentId,
        transformationType,
        targetAudience || undefined
      );

      setResult(response.output);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Fehler bei der Transformation');
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePodcast = async () => {
    setLoading(true);
    setError('');
    setResult('');

    try {
      const response = await api.generatePodcastScript(documentContent, numHosts);

      setResult(response.script);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Fehler bei der Podcast-Generierung');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCitations = async () => {
    setLoading(true);
    setError('');
    setResult('');

    try {
      const response = await api.generateCitations(documentContent, citationStyle);

      const formatted = response.citations
        .map((c: any) => `${c.citation}\n${c.context}`)
        .join('\n\n');
      setResult(formatted);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Fehler bei der Zitationsgenerierung');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQuestions = async () => {
    setLoading(true);
    setError('');
    setResult('');

    try {
      const response = await api.transformDocument(documentId, 'questions');
      setResult(response.output);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Fehler bei der Fragengenerierung');
    } finally {
      setLoading(false);
    }
  };

  const handleInsertResult = () => {
    if (result && onInsertContent) {
      onInsertContent(result);
    }
  };

  const handleCopyResult = () => {
    navigator.clipboard.writeText(result);
  };

  return (
    <div className="flex flex-col h-full bg-gray-800 border-l border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white">Transform Tools</h2>
        <p className="text-sm text-gray-400 mt-1">
          Content transformieren und neu anordnen
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'transform'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
          onClick={() => setActiveTab('transform')}
        >
          Transformieren
        </button>
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'podcast'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
          onClick={() => setActiveTab('podcast')}
        >
          Podcast
        </button>
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'citations'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
          onClick={() => setActiveTab('citations')}
        >
          Zitate
        </button>
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'questions'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
          onClick={() => setActiveTab('questions')}
        >
          Fragen
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Transform Tab */}
        {activeTab === 'transform' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Transformationstyp
              </label>
              <select
                value={transformationType}
                onChange={(e) => setTransformationType(e.target.value as TransformationType)}
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="summary">Zusammenfassung</option>
                <option value="outline">Gliederung</option>
                <option value="questions">Fragen generieren</option>
                <option value="key-points">Kernpunkte</option>
                <option value="expand">Text erweitern</option>
                <option value="simplify">Vereinfachen</option>
                <option value="academic">Akademisch umformulieren</option>
                <option value="podcast-script">Podcast-Skript</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Zielgruppe (optional)
              </label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="z.B. Studenten, Experten, Allgemeinpublikum"
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
              />
            </div>

            <button
              onClick={handleTransform}
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {loading ? 'Verarbeite...' : 'Transformieren'}
            </button>
          </div>
        )}

        {/* Podcast Tab */}
        {activeTab === 'podcast' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Anzahl Moderatoren
              </label>
              <input
                type="number"
                min="1"
                max="5"
                value={numHosts}
                onChange={(e) => setNumHosts(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={handleGeneratePodcast}
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {loading ? 'Generiere...' : 'Podcast-Skript generieren'}
            </button>
          </div>
        )}

        {/* Citations Tab */}
        {activeTab === 'citations' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Zitationsstil
              </label>
              <select
                value={citationStyle}
                onChange={(e) => setCitationStyle(e.target.value as CitationStyle)}
                className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="apa">APA</option>
                <option value="mla">MLA</option>
                <option value="chicago">Chicago</option>
              </select>
            </div>

            <button
              onClick={handleGenerateCitations}
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {loading ? 'Generiere...' : 'Zitate extrahieren'}
            </button>
          </div>
        )}

        {/* Questions Tab */}
        {activeTab === 'questions' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Generiere relevante Forschungsfragen basierend auf dem Dokumentinhalt.
            </p>

            <button
              onClick={handleGenerateQuestions}
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {loading ? 'Generiere...' : 'Fragen generieren'}
            </button>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-900 bg-opacity-30 border border-red-700 rounded-md">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Result Display */}
        {result && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-gray-300">Ergebnis:</h3>
              <div className="space-x-2">
                <button
                  onClick={handleCopyResult}
                  className="px-3 py-1 text-sm text-gray-300 bg-gray-700 rounded hover:bg-gray-600"
                >
                  Kopieren
                </button>
                {onInsertContent && (
                  <button
                    onClick={handleInsertResult}
                    className="px-3 py-1 text-sm text-blue-300 bg-blue-900 bg-opacity-40 rounded hover:bg-blue-800 hover:bg-opacity-50"
                  >
                    Einfügen
                  </button>
                )}
              </div>
            </div>
            <div className="p-3 bg-gray-900 border border-gray-700 rounded-md">
              <pre className="text-sm text-gray-200 whitespace-pre-wrap">{result}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
