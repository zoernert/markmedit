import React, { useState } from 'react';

interface TableEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (markdown: string) => void;
  initialMarkdown?: string;
}

interface Cell {
  content: string;
}

export const TableEditor: React.FC<TableEditorProps> = ({
  isOpen,
  onClose,
  onInsert,
  initialMarkdown,
}) => {
  const [rows, setRows] = useState<Cell[][]>(() => {
    if (initialMarkdown) {
      return parseMarkdownTable(initialMarkdown);
    }
    // Default 3x3 table
    return Array(3).fill(null).map(() => 
      Array(3).fill(null).map(() => ({ content: '' }))
    );
  });

  const [hasHeader, setHasHeader] = useState(true);

  if (!isOpen) return null;

  const parseMarkdownTable = (markdown: string): Cell[][] => {
    const lines = markdown.trim().split('\n').filter(line => line.trim());
    const cells: Cell[][] = [];
    
    for (const line of lines) {
      // Skip separator line
      if (line.match(/^\|[\s-:|]+\|$/)) continue;
      
      const rowCells = line
        .split('|')
        .slice(1, -1) // Remove empty first and last elements
        .map(cell => ({ content: cell.trim() }));
      
      if (rowCells.length > 0) {
        cells.push(rowCells);
      }
    }
    
    return cells.length > 0 ? cells : [[{ content: '' }]];
  };

  const generateMarkdown = (): string => {
    if (rows.length === 0) return '';

    const maxCols = Math.max(...rows.map(row => row.length));
    let markdown = '';

    // Add rows
    rows.forEach((row, rowIndex) => {
      const cells = row.map(cell => cell.content || ' ');
      // Pad row if needed
      while (cells.length < maxCols) {
        cells.push(' ');
      }
      markdown += `| ${cells.join(' | ')} |\n`;

      // Add separator after header
      if (rowIndex === 0 && hasHeader) {
        markdown += `| ${Array(maxCols).fill('---').join(' | ')} |\n`;
      }
    });

    return markdown;
  };

  const addRow = () => {
    const cols = rows[0]?.length || 3;
    setRows([...rows, Array(cols).fill(null).map(() => ({ content: '' }))]);
  };

  const addColumn = () => {
    setRows(rows.map(row => [...row, { content: '' }]));
  };

  const removeRow = (index: number) => {
    if (rows.length > 1) {
      setRows(rows.filter((_, i) => i !== index));
    }
  };

  const removeColumn = (colIndex: number) => {
    if (rows[0]?.length > 1) {
      setRows(rows.map(row => row.filter((_, i) => i !== colIndex)));
    }
  };

  const updateCell = (rowIndex: number, colIndex: number, content: string) => {
    const newRows = [...rows];
    newRows[rowIndex][colIndex] = { content };
    setRows(newRows);
  };

  const handleInsert = () => {
    const markdown = generateMarkdown();
    onInsert(markdown);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">Tabellen-Editor</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Controls */}
        <div className="px-6 py-3 border-b border-gray-200 flex gap-3">
          <button
            onClick={addRow}
            className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            + Zeile
          </button>
          <button
            onClick={addColumn}
            className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            + Spalte
          </button>
          <label className="flex items-center gap-2 ml-4">
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(e) => setHasHeader(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Header-Zeile</span>
          </label>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-6">
          <div className="inline-block min-w-full border border-gray-300 rounded">
            {rows.map((row, rowIndex) => (
              <div key={rowIndex} className="flex">
                {row.map((cell, colIndex) => (
                  <div
                    key={colIndex}
                    className={`flex-1 min-w-[120px] ${
                      rowIndex === 0 && hasHeader ? 'bg-gray-50' : ''
                    }`}
                  >
                    <input
                      type="text"
                      value={cell.content}
                      onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                      className={`w-full px-2 py-2 border-r border-b border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                        rowIndex === 0 && hasHeader ? 'font-semibold' : ''
                      }`}
                      placeholder={rowIndex === 0 && hasHeader ? 'Spalte' : 'Zelle'}
                    />
                  </div>
                ))}
                <button
                  onClick={() => removeRow(rowIndex)}
                  className="px-2 text-red-600 hover:bg-red-50"
                  title="Zeile löschen"
                  disabled={rows.length <= 1}
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="flex border-t">
              {rows[0]?.map((_, colIndex) => (
                <div key={colIndex} className="flex-1 min-w-[120px] text-center">
                  <button
                    onClick={() => removeColumn(colIndex)}
                    className="w-full py-1 text-red-600 hover:bg-red-50 text-sm"
                    disabled={rows[0].length <= 1}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Markdown-Vorschau:</h3>
            <pre className="bg-gray-50 p-4 rounded border border-gray-300 text-sm overflow-x-auto">
              {generateMarkdown()}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded"
          >
            Abbrechen
          </button>
          <button
            onClick={handleInsert}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Einfügen
          </button>
        </div>
      </div>
    </div>
  );
};
