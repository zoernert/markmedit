import { useState, useCallback, useRef } from 'react';

export interface StreamingChatProgress {
  status: 'idle' | 'connecting' | 'processing' | 'complete' | 'error';
  message: string;
  iteration: number;
  toolCallsTotal: number;
  currentTool?: {
    name: string;
    index: number;
    total: number;
  };
  retryInfo?: {
    count: number;
    max: number;
  };
}

export interface StreamingChatResult {
  response: string;
  history: any[];
  toolCallsMade: number;
  partialResult?: boolean;
}

interface UseStreamingChatOptions {
  onProgress?: (progress: StreamingChatProgress) => void;
  onComplete?: (result: StreamingChatResult) => void;
  onError?: (error: string) => void;
}

export function useStreamingChat(options: UseStreamingChatOptions = {}) {
  const [progress, setProgress] = useState<StreamingChatProgress>({
    status: 'idle',
    message: '',
    iteration: 0,
    toolCallsTotal: 0,
  });

  const [result, setResult] = useState<StreamingChatResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const updateProgress = useCallback((updates: Partial<StreamingChatProgress>) => {
    setProgress(prev => {
      const newProgress = { ...prev, ...updates };
      options.onProgress?.(newProgress);
      return newProgress;
    });
  }, [options]);

  const sendMessage = useCallback(async (params: {
    message: string;
    documentContext?: string;
    artifactContext?: string;
    history?: any[];
  }) => {
    // Cancel any existing request
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Reset state
    setResult(null);
    setError(null);
    updateProgress({
      status: 'connecting',
      message: 'Connecting to server...',
      iteration: 0,
      toolCallsTotal: 0,
    });

    try {
      abortControllerRef.current = new AbortController();

      // Make POST request to initiate SSE stream
      const API_URL = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${API_URL}/ai-enhanced/chat-with-mcp-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      // Process SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEventType = '';

      updateProgress({
        status: 'processing',
        message: 'Processing request...',
      });

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.substring(7).trim();
            continue;
          }

          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.substring(6));

            switch (currentEventType) {
              case 'status':
                updateProgress({
                  status: 'processing',
                  message: data.message,
                  iteration: data.iteration || 0,
                });
                break;

              case 'iteration':
                updateProgress({
                  iteration: data.iteration,
                  toolCallsTotal: data.toolCount,
                  message: `Iteration ${data.iteration}: ${data.toolCount} tool(s)`,
                });
                break;

              case 'tool-start':
                updateProgress({
                  message: `Running: ${data.toolName}`,
                  currentTool: {
                    name: data.toolName,
                    index: data.toolIndex,
                    total: data.toolTotal,
                  },
                });
                break;

              case 'tool-complete':
                updateProgress({
                  message: `Completed: ${data.toolName}`,
                });
                break;

              case 'tool-error':
                updateProgress({
                  message: `Error in ${data.toolName}: ${data.error}`,
                });
                break;

              case 'retry':
                updateProgress({
                  message: `Retrying (${data.retryCount}/${data.maxRetries})...`,
                  retryInfo: {
                    count: data.retryCount,
                    max: data.maxRetries,
                  },
                });
                break;

              case 'warning':
                updateProgress({
                  message: `Warning: ${data.message}`,
                });
                break;

              case 'done':
                const finalResult: StreamingChatResult = {
                  response: data.response,
                  history: data.history,
                  toolCallsMade: data.toolCallsMade,
                  partialResult: data.partialResult,
                };
                setResult(finalResult);
                updateProgress({
                  status: 'complete',
                  message: 'Complete!',
                  toolCallsTotal: data.toolCallsMade,
                });
                options.onComplete?.(finalResult);
                break;

              case 'error':
                const errorMsg = data.message || 'Unknown error';
                setError(errorMsg);
                updateProgress({
                  status: 'error',
                  message: errorMsg,
                });
                options.onError?.(errorMsg);
                break;
            }
          }
        }
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
        updateProgress({
          status: 'idle',
          message: 'Request cancelled',
        });
      } else {
        const errorMsg = err.message || String(err);
        setError(errorMsg);
        updateProgress({
          status: 'error',
          message: errorMsg,
        });
        options.onError?.(errorMsg);
      }
    }
  }, [updateProgress, options]);

  const cancel = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    updateProgress({
      status: 'idle',
      message: 'Cancelled',
    });
  }, [updateProgress]);

  return {
    sendMessage,
    cancel,
    progress,
    result,
    error,
    isProcessing: progress.status === 'processing' || progress.status === 'connecting',
  };
}
