import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MarkdownWithMermaid } from '../components/MarkdownWithMermaid';

export function PublicDocument() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-document', id],
    queryFn: async () => {
      const response = await fetch(`/api/public/documents/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Dokument nicht gefunden');
        } else if (response.status === 403) {
          throw new Error('Dieses Dokument ist nicht öffentlich verfügbar');
        }
        throw new Error('Fehler beim Laden des Dokuments');
      }
      return response.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="text-gray-900">Lade Dokument...</div>
      </div>
    );
  }

  if (error || !data?.document) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">
            {error instanceof Error ? error.message : 'Dokument nicht gefunden'}
          </h2>
          <p className="text-gray-600 mb-6">
            Dieses Dokument ist möglicherweise nicht öffentlich verfügbar oder wurde gelöscht.
          </p>
          <a
            href="https://markmedit.corrently.io"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            Zur Startseite
          </a>
        </div>
      </div>
    );
  }

  const document = data.document;

  return (
    <div className="flex h-screen bg-white">
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4 shadow-sm">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{document.title}</h1>
              <p className="text-sm text-gray-600 mt-1">
                📖 Öffentliches Dokument • Nur-Lesen-Modus
              </p>
            </div>
            <a
              href="https://markmedit.corrently.io"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
            >
              Mit MarkMEdit bearbeiten
            </a>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-50">
          <div className="max-w-5xl mx-auto p-8">
            <div className="prose prose-slate prose-lg max-w-none bg-white rounded-lg shadow-sm p-8">
              <MarkdownWithMermaid content={document.content} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="max-w-5xl mx-auto text-center text-sm text-gray-600">
            Erstellt mit{' '}
            <a
              href="https://markmedit.corrently.io"
              className="text-blue-600 hover:text-blue-700"
            >
              MarkMEdit
            </a>{' '}
            • Kostenloser KI-gestützter Markdown-Editor
          </div>
        </div>
      </div>
    </div>
  );
}
