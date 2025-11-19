import React, { useState } from 'react';
import { MermaidDiagram } from './MermaidDiagram';

interface MermaidPreviewProps {
  code: string;
}

export const MermaidPreview: React.FC<MermaidPreviewProps> = ({ code }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Extract mermaid code from markdown code block
  const extractMermaidCode = (text: string): string => {
    const match = text.match(/```mermaid\s*\n([\s\S]*?)```/);
    return match ? match[1].trim() : text.trim();
  };

  const mermaidCode = extractMermaidCode(code);

  if (!mermaidCode) {
    return null;
  }

  return (
    <div className="mermaid-preview border border-gray-300 rounded-lg overflow-hidden my-4">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b border-gray-300">
        <div className="flex items-center space-x-2">
          <svg
            className="h-5 w-5 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <span className="text-sm font-medium text-gray-700">Mermaid Diagram</span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          {isExpanded ? 'Hide Code' : 'Show Code'}
        </button>
      </div>

      {/* Diagram */}
      <div className="p-4 bg-white">
        <MermaidDiagram chart={mermaidCode} />
      </div>

      {/* Code (collapsible) */}
      {isExpanded && (
        <div className="border-t border-gray-300">
          <pre className="bg-gray-50 p-4 overflow-x-auto">
            <code className="text-sm text-gray-800">{mermaidCode}</code>
          </pre>
        </div>
      )}
    </div>
  );
};
