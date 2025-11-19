import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState } from 'react';

interface PullRequest {
  id: string;
  source_document_id: string;
  target_document_id: string;
  fork_title: string;
  fork_slug: string;
  pull_request_message: string;
  pull_request_diff: string;
  status: 'pending' | 'merged' | 'rejected';
  created_at: number;
}

interface PullRequestPanelProps {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function PullRequestPanel({ documentId, isOpen, onClose }: PullRequestPanelProps) {
  const queryClient = useQueryClient();
  const [selectedPR, setSelectedPR] = useState<PullRequest | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['pull-requests', documentId],
    queryFn: () => api.getPullRequests(documentId),
    enabled: isOpen,
  });

  const acceptMutation = useMutation({
    mutationFn: (prId: string) => api.acceptPullRequest(prId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pull-requests', documentId] });
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      setSelectedPR(null);
      setShowDiff(false);
      alert('✅ Pull Request erfolgreich akzeptiert und übernommen!');
    },
    onError: () => {
      alert('❌ Fehler beim Akzeptieren des Pull Requests.');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (prId: string) => api.rejectPullRequest(prId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pull-requests', documentId] });
      setSelectedPR(null);
      setShowDiff(false);
      alert('Pull Request abgelehnt.');
    },
    onError: () => {
      alert('❌ Fehler beim Ablehnen des Pull Requests.');
    },
  });

  if (!isOpen) return null;

  const pullRequests = data?.pullRequests || [];
  const pendingPRs = pullRequests.filter((pr: PullRequest) => pr.status === 'pending');

  const getDiff = (pr: PullRequest) => {
    try {
      const diff = JSON.parse(pr.pull_request_diff);
      return diff;
    } catch {
      return null;
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white">
              Pull Requests
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {pendingPRs.length} {pendingPRs.length === 1 ? 'Vorschlag' : 'Vorschläge'} ausstehend
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-3xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="text-center text-gray-400 py-8">
              Lade Pull Requests...
            </div>
          ) : pendingPRs.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <div className="text-6xl mb-4">📭</div>
              <p className="text-lg">Keine ausstehenden Pull Requests</p>
              <p className="text-sm mt-2">Änderungsvorschläge von Forks werden hier angezeigt.</p>
            </div>
          ) : showDiff && selectedPR ? (
            /* Diff View */
            <div className="space-y-4">
              <button
                onClick={() => {
                  setShowDiff(false);
                  setSelectedPR(null);
                }}
                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                ← Zurück zur Liste
              </button>

              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-2">
                  {selectedPR.fork_title}
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                  {selectedPR.pull_request_message}
                </p>
                <p className="text-xs text-gray-500">
                  Erstellt am {new Date(selectedPR.created_at).toLocaleString('de-DE')}
                </p>
              </div>

              {/* Diff Display */}
              {(() => {
                const diff = getDiff(selectedPR);
                if (!diff) {
                  return (
                    <div className="text-gray-400">
                      Diff konnte nicht geladen werden.
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-2 gap-4">
                    {/* Original */}
                    <div className="bg-gray-900 rounded-lg p-4 border border-red-900">
                      <h4 className="text-sm font-semibold text-red-400 mb-3">
                        ❌ Aktueller Stand (Original)
                      </h4>
                      <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono max-h-96 overflow-auto">
                        {diff.source}
                      </pre>
                    </div>

                    {/* Proposed Changes */}
                    <div className="bg-gray-900 rounded-lg p-4 border border-green-900">
                      <h4 className="text-sm font-semibold text-green-400 mb-3">
                        ✅ Vorgeschlagene Änderungen (Fork)
                      </h4>
                      <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono max-h-96 overflow-auto">
                        {diff.fork}
                      </pre>
                    </div>
                  </div>
                );
              })()}

              {/* Actions */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-700">
                <button
                  onClick={() => rejectMutation.mutate(selectedPR.id)}
                  disabled={rejectMutation.isPending}
                  className="px-4 py-2 bg-red-900 text-red-200 rounded hover:bg-red-800 transition-colors"
                >
                  {rejectMutation.isPending ? 'Wird abgelehnt...' : '❌ Ablehnen'}
                </button>
                <button
                  onClick={() => {
                    if (confirm('Möchten Sie diese Änderungen wirklich übernehmen? Dies wird Ihr Dokument aktualisieren.')) {
                      acceptMutation.mutate(selectedPR.id);
                    }
                  }}
                  disabled={acceptMutation.isPending}
                  className="px-4 py-2 bg-green-900 text-green-200 rounded hover:bg-green-800 transition-colors"
                >
                  {acceptMutation.isPending ? 'Wird übernommen...' : '✅ Akzeptieren & Übernehmen'}
                </button>
              </div>
            </div>
          ) : (
            /* List View */
            <div className="space-y-3">
              {pendingPRs.map((pr: PullRequest) => (
                <div
                  key={pr.id}
                  className="bg-gray-900 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-1">
                        {pr.fork_title}
                      </h3>
                      <p className="text-sm text-gray-300 mb-2">
                        {pr.pull_request_message}
                      </p>
                      <p className="text-xs text-gray-500">
                        Erstellt am {new Date(pr.created_at).toLocaleString('de-DE')}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedPR(pr);
                        setShowDiff(true);
                      }}
                      className="ml-4 px-4 py-2 bg-blue-900 text-blue-200 rounded hover:bg-blue-800 transition-colors text-sm whitespace-nowrap"
                    >
                      👁️ Änderungen ansehen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!showDiff && pendingPRs.length > 0 && (
          <div className="border-t border-gray-700 p-4 bg-gray-900">
            <p className="text-xs text-gray-500 text-center">
              💡 Tipp: Überprüfen Sie die vorgeschlagenen Änderungen sorgfältig, bevor Sie sie akzeptieren.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
