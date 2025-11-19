import { } from 'react';

export interface DocumentSuggestion {
  section: string;
  location: string;
  action: 'insert_after' | 'replace' | 'insert_before' | 'new_section';
  reason: string;
  priority: 'high' | 'medium' | 'low';
  preview?: string;
}

interface DocumentSuggestionsData {
  analysis: string;
  suggestions: DocumentSuggestion[];
  uploadedFileName?: string;
  documentTitle?: string;
}

interface DocumentSuggestionsProps {
  data: DocumentSuggestionsData;
  onAccept: (suggestion: DocumentSuggestion, index: number) => void;
  onReject: (index: number) => void;
  onRequestDetails: (suggestion: DocumentSuggestion, index: number) => void;
  onApplyAll?: () => void;
  isApplying?: boolean;
  acceptedIndices: Set<number>;
  rejectedIndices: Set<number>;
}

const ACTION_LABELS: Record<DocumentSuggestion['action'], { label: string; icon: string; color: string }> = {
  insert_after: { label: 'Einfügen nach', icon: '➕', color: 'text-green-400' },
  insert_before: { label: 'Einfügen vor', icon: '⬆️', color: 'text-blue-400' },
  replace: { label: 'Ersetzen', icon: '🔄', color: 'text-yellow-400' },
  new_section: { label: 'Neuer Abschnitt', icon: '✨', color: 'text-purple-400' },
};

const PRIORITY_COLORS: Record<DocumentSuggestion['priority'], string> = {
  high: 'border-red-500/50 bg-red-500/5',
  medium: 'border-yellow-500/50 bg-yellow-500/5',
  low: 'border-blue-500/50 bg-blue-500/5',
};

export function DocumentSuggestions({
  data,
  onAccept,
  onReject,
  onRequestDetails,
  onApplyAll,
  isApplying = false,
  acceptedIndices,
  rejectedIndices,
}: DocumentSuggestionsProps) {
  // Removed unused state - expandedIndex and toggleExpand
  // Can be re-added later for expandable details view

  if (!data.suggestions || data.suggestions.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-gray-300 font-medium mb-2">Keine Änderungen erforderlich</p>
          <p className="text-sm text-gray-500">{data.analysis}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Analysis Summary */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-start gap-3">
          <div className="text-2xl">🔍</div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white mb-1">Analyse</h3>
            <p className="text-sm text-gray-300">{data.analysis}</p>
            {data.uploadedFileName && (
              <p className="text-xs text-gray-500 mt-2">
                📄 Basierend auf: {data.uploadedFileName}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Suggestions List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          {data.suggestions.length} Änderungsvorschläge
        </h3>

        {data.suggestions.map((suggestion, index) => {
          const actionInfo = ACTION_LABELS[suggestion.action];
          const isAccepted = acceptedIndices.has(index);
          const isRejected = rejectedIndices.has(index);

          return (
            <div
              key={index}
              className={`
                bg-gray-800 rounded-lg border-l-4 transition-all
                ${isAccepted ? 'border-green-500 bg-green-500/10' : 
                  isRejected ? 'border-gray-600 bg-gray-700/50 opacity-60' :
                  PRIORITY_COLORS[suggestion.priority]}
              `}
            >
              {/* Header */}
              <div className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  {/* Priority Indicator */}
                  <div className={`
                    w-2 h-2 rounded-full mt-1.5 flex-shrink-0
                    ${suggestion.priority === 'high' ? 'bg-red-500' :
                      suggestion.priority === 'medium' ? 'bg-yellow-500' :
                      'bg-blue-500'}
                  `} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={actionInfo.color}>{actionInfo.icon}</span>
                      <h4 className="text-sm font-semibold text-white">
                        {suggestion.section}
                      </h4>
                      <span className="text-xs text-gray-500">
                        {actionInfo.label}
                      </span>
                    </div>

                    <p className="text-xs text-gray-400 mb-2">
                      📍 {suggestion.location}
                    </p>

                    <p className="text-sm text-gray-300">
                      {suggestion.reason}
                    </p>

                    {suggestion.preview && (
                      <div className="mt-2 p-2 bg-gray-900/50 rounded border border-gray-700">
                        <p className="text-xs text-gray-400 mb-1">Vorschau:</p>
                        <p className="text-xs text-gray-300 italic">
                          {suggestion.preview}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 mt-3">
                  {!isAccepted && !isRejected && (
                    <>
                      <button
                        onClick={() => onAccept(suggestion, index)}
                        className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                      >
                        ✓ Annehmen
                      </button>
                      <button
                        onClick={() => onReject(index)}
                        className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                      >
                        ✗ Ablehnen
                      </button>
                      <button
                        onClick={() => onRequestDetails(suggestion, index)}
                        className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                      >
                        📝 Details anfordern
                      </button>
                    </>
                  )}
                  
                  {isAccepted && (
                    <div className="flex items-center gap-2 text-green-400 text-sm">
                      <span>✓</span>
                      <span>Angenommen - wird beim Speichern angewendet</span>
                    </div>
                  )}

                  {isRejected && (
                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                      <span>✗</span>
                      <span>Abgelehnt</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {acceptedIndices.size > 0 && (
        <div className="bg-green-900/20 border border-green-500/50 rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm text-green-400 mb-1">
                ✓ {acceptedIndices.size} von {data.suggestions.length} Vorschlägen angenommen
              </p>
              <p className="text-xs text-gray-400">
                Klicke auf "Änderungen anwenden" um die Vorschläge ins Dokument zu übernehmen.
              </p>
            </div>
            {onApplyAll && (
              <button
                onClick={onApplyAll}
                disabled={isApplying}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
              >
                {isApplying ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                    <span>Wende an...</span>
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    <span>Änderungen anwenden</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
