import type { StreamingChatProgress } from '../hooks/useStreamingChat';

interface ChatProgressIndicatorProps {
  progress: StreamingChatProgress;
}

export function ChatProgressIndicator({ progress }: ChatProgressIndicatorProps) {
  if (progress.status === 'idle' || progress.status === 'complete') {
    return null;
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        {/* Spinner */}
        {progress.status === 'processing' || progress.status === 'connecting' ? (
          <div className="flex-shrink-0">
            <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        ) : progress.status === 'error' ? (
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        ) : null}

        <div className="flex-1 min-w-0">
          {/* Status Message */}
          <p className={`text-sm font-medium ${progress.status === 'error' ? 'text-red-800' : 'text-blue-800'}`}>
            {progress.message}
          </p>

          {/* Progress Details */}
          {progress.iteration > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-xs text-blue-600">
                <span>Iteration {progress.iteration}</span>
                {progress.toolCallsTotal > 0 && (
                  <span>{progress.toolCallsTotal} tool call(s)</span>
                )}
              </div>

              {/* Current Tool */}
              {progress.currentTool && (
                <div className="flex items-center gap-2 text-xs text-blue-700">
                  <div className="flex-1 bg-blue-200 rounded-full h-1.5">
                    <div 
                      className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${(progress.currentTool.index / progress.currentTool.total) * 100}%` }}
                    />
                  </div>
                  <span className="whitespace-nowrap">
                    {progress.currentTool.index}/{progress.currentTool.total}
                  </span>
                </div>
              )}

              {/* Retry Info */}
              {progress.retryInfo && (
                <div className="flex items-center gap-1 text-xs text-amber-600">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Retry {progress.retryInfo.count}/{progress.retryInfo.max}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
