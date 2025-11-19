import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Editor, { OnMount } from '@monaco-editor/react';
import { api } from '../lib/api';
import type { ConvertToPresentationResponse } from '../lib/api';
import { useState, useEffect, useRef } from 'react';
import { AIAssistant } from '../components/AIAssistant';
import { ArtifactsPanel } from '../components/ArtifactsPanel';
import { TransformToolsPanel } from '../components/TransformToolsPanel';
import { DeepResearchPanel } from '../components/DeepResearchPanel';
import { DocumentSuggestions } from '../components/DocumentSuggestions';
import { VersionHistoryModal } from '../components/VersionHistoryModal';
import { ImageUploadModal } from '../components/ImageUploadModal';
import { TableEditor } from '../components/TableEditor';
import { DocumentPermissionsModal } from '../components/DocumentPermissionsModal';
import ConvertToPresentationModal from '../components/ConvertToPresentationModal';
import PresentationViewer from '../components/PresentationViewer';
import { MarkdownWithMermaid } from '../components/MarkdownWithMermaid';
import { PullRequestPanel } from '../components/PullRequestPanel';
import type * as Monaco from 'monaco-editor';

type ViewMode = 'editor' | 'split' | 'preview';
type RightPanelTab = 'ai' | 'artifacts' | 'transform' | 'research';

/**
 * Parse embedded artifacts from markdown content
 */
function parseEmbeddedArtifacts(content: string) {
  const artifacts: { artifactId: string; startLine: number; endLine: number }[] = [];
  const lines = content.split('\n');
  
  let currentArtifact: { id: string; startLine: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for start marker: <!-- ARTIFACT:id:start -->
    const startMatch = line.match(/<!--\s*ARTIFACT:([^:]+):start\s*-->/);
    if (startMatch) {
      currentArtifact = {
        id: startMatch[1],
        startLine: i + 1 // Monaco is 1-indexed
      };
      continue;
    }

    // Check for end marker: <!-- ARTIFACT:id:end -->
    const endMatch = line.match(/<!--\s*ARTIFACT:([^:]+):end\s*-->/);
    if (endMatch && currentArtifact) {
      artifacts.push({
        artifactId: currentArtifact.id,
        startLine: currentArtifact.startLine,
        endLine: i + 1 // Monaco is 1-indexed
      });
      currentArtifact = null;
    }
  }

  return artifacts;
}

/**
 * Update Monaco decorations for embedded artifacts
 */
let decorationsCollection: Monaco.editor.IEditorDecorationsCollection | null = null;

function updateEmbeddedArtifactDecorations(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco
) {
  const model = editor.getModel();
  if (!model) return;

  const content = model.getValue();
  const embeddedArtifacts = parseEmbeddedArtifacts(content);

  const decorations: Monaco.editor.IModelDeltaDecoration[] = embeddedArtifacts.map(artifact => ({
    range: new monaco.Range(artifact.startLine, 1, artifact.endLine, 1),
    options: {
      isWholeLine: true,
      className: 'embedded-artifact-line',
      glyphMarginClassName: 'embedded-artifact-glyph',
      glyphMarginHoverMessage: { value: `🔗 Embedded Artifact: ${artifact.artifactId}` },
      hoverMessage: { value: `This content is linked to artifact \`${artifact.artifactId}\`.\n\nChanges here will update the artifact, and vice versa.` }
    }
  }));

  // Create or update decorations collection
  if (!decorationsCollection) {
    decorationsCollection = editor.createDecorationsCollection(decorations);
  } else {
    decorationsCollection.set(decorations);
  }
}

export function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('ai');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<string[]>([]);
  const [researchSuggestions, setResearchSuggestions] = useState<any[]>([]);
  const [showResearchSuggestions, setShowResearchSuggestions] = useState(false);
  const [acceptedResearchIndices, setAcceptedResearchIndices] = useState<Set<number>>(new Set());
  const [rejectedResearchIndices, setRejectedResearchIndices] = useState<Set<number>>(new Set());
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [showTableEditor, setShowTableEditor] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [presentationResult, setPresentationResult] = useState<ConvertToPresentationResponse | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showPullRequestModal, setShowPullRequestModal] = useState(false);
  const [showPullRequestReview, setShowPullRequestReview] = useState(false);
  const [pullRequestMessage, setPullRequestMessage] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(400); // Default 400px
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [editorReady, setEditorReady] = useState(false); // Track when editor is mounted
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadRef = useRef(true);
  const syncScrollRef = useRef({ isScrolling: false, source: '' });

  
  const { data, isLoading } = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.getDocument(id!),
  });

  // Check for upstream updates if document is imported
  const { data: upstreamData } = useQuery({
    queryKey: ['upstream', id],
    queryFn: () => api.checkUpstreamUpdates(id!),
    enabled: !!data?.document?.is_readonly,
    refetchInterval: 60000, // Check every minute
  });

  // Query pull requests for this document
  const { data: prData } = useQuery({
    queryKey: ['pull-requests', id],
    queryFn: () => api.getPullRequests(id!),
    refetchInterval: 60000, // Check every minute
  });

  const document = data?.document;

  // Set content when document loads (only on initial load, not on auto-save updates)
  useEffect(() => {
    if (document && initialLoadRef.current) {
      setContent(document.content);
      initialLoadRef.current = false;
    }
  }, [document]);

  // Handle sidebar resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 300 && newWidth <= 800) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.document.addEventListener('mousemove', handleMouseMove);
      window.document.addEventListener('mouseup', handleMouseUp);
      window.document.body.style.cursor = 'col-resize';
      window.document.body.style.userSelect = 'none';
    }

    return () => {
      window.document.removeEventListener('mousemove', handleMouseMove);
      window.document.removeEventListener('mouseup', handleMouseUp);
      window.document.body.style.cursor = '';
      window.document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Synchronized scrolling between editor and preview
  useEffect(() => {
    // Only run in split mode with both editor and preview ready
    if (viewMode !== 'split') {
      console.log('⏸️ Scroll sync skipped - not in split mode');
      return;
    }
    
    if (!editorReady || !editorRef.current || !previewRef.current) {
      console.log('⏸️ Scroll sync skipped - waiting for editor/preview', {
        editorReady,
        hasEditor: !!editorRef.current,
        hasPreview: !!previewRef.current
      });
      return;
    }

    const editor = editorRef.current;
    const preview = previewRef.current;
    let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

    console.log('🔄 Setting up scroll sync'); // Debug log

    // Scroll preview when editor scrolls
    const handleEditorScroll = () => {
      if (syncScrollRef.current.isScrolling && syncScrollRef.current.source === 'preview') {
        return; // Prevent feedback loop
      }

      syncScrollRef.current.isScrolling = true;
      syncScrollRef.current.source = 'editor';

      const scrollTop = editor.getScrollTop();
      const scrollHeight = editor.getScrollHeight();
      const clientHeight = editor.getLayoutInfo().height;
      const scrollPercentage = scrollTop / (scrollHeight - clientHeight);

      const previewScrollHeight = preview.scrollHeight;
      const previewClientHeight = preview.clientHeight;
      preview.scrollTop = scrollPercentage * (previewScrollHeight - previewClientHeight);

      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        syncScrollRef.current.isScrolling = false;
      }, 100);
    };

    // Scroll editor when preview scrolls
    const handlePreviewScroll = () => {
      if (syncScrollRef.current.isScrolling && syncScrollRef.current.source === 'editor') {
        return; // Prevent feedback loop
      }

      syncScrollRef.current.isScrolling = true;
      syncScrollRef.current.source = 'preview';

      const scrollTop = preview.scrollTop;
      const scrollHeight = preview.scrollHeight;
      const clientHeight = preview.clientHeight;
      const scrollPercentage = scrollTop / (scrollHeight - clientHeight);

      const editorScrollHeight = editor.getScrollHeight();
      const editorClientHeight = editor.getLayoutInfo().height;
      editor.setScrollTop(scrollPercentage * (editorScrollHeight - editorClientHeight));

      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        syncScrollRef.current.isScrolling = false;
      }, 100);
    };

    const editorScrollDisposable = editor.onDidScrollChange(handleEditorScroll);
    preview.addEventListener('scroll', handlePreviewScroll);

    console.log('✅ Scroll sync active'); // Debug log

    return () => {
      console.log('🔴 Cleaning up scroll sync'); // Debug log
      editorScrollDisposable.dispose();
      preview.removeEventListener('scroll', handlePreviewScroll);
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, [viewMode, editorReady]); // Re-run when viewMode changes OR when editor becomes ready

  // Reset save status after 2 seconds
  useEffect(() => {
    if (saveStatus === 'saved' || saveStatus === 'error') {
      const timer = setTimeout(() => setSaveStatus('idle'), 2000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus]);

  // Auto-save after 2 seconds of inactivity
  useEffect(() => {
    if (!document || content === document.content) {
      return; // No changes to save
    }

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Set new timer
    autoSaveTimerRef.current = setTimeout(() => {
      setSaveStatus('saving');
      updateMutation.mutate(content);
    }, 2000);

    // Cleanup
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [content, document]);
  
  const updateMutation = useMutation({
    mutationFn: (newContent: string) => api.updateDocument(id!, { content: newContent }),
    onSuccess: (data) => {
      // Update query cache WITHOUT triggering a re-fetch
      // This preserves cursor position and prevents jumping to end
      queryClient.setQueryData(['document', id], data);
      setSaveStatus('saved');
    },
    onError: () => {
      setSaveStatus('error');
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => api.syncWithUpstream(id!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['document', id] });
      queryClient.invalidateQueries({ queryKey: ['upstream', id] });
      setContent(data.document.content);
      alert('✅ Dokument erfolgreich mit dem Original synchronisiert!');
    },
    onError: () => {
      alert('❌ Fehler beim Synchronisieren mit dem Original.');
    },
  });

  const forkMutation = useMutation({
    mutationFn: () => api.forkDocument(id!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      window.location.href = `/documents/${data.document.id}`;
    },
    onError: () => {
      alert('❌ Fehler beim Erstellen des Forks.');
    },
  });

  const pullRequestMutation = useMutation({
    mutationFn: (message: string) => api.createPullRequest(id!, message),
    onSuccess: () => {
      setShowPullRequestModal(false);
      setPullRequestMessage('');
      alert('✅ Pull Request erfolgreich erstellt!');
    },
    onError: () => {
      alert('❌ Fehler beim Erstellen des Pull Requests.');
    },
  });

  // Monaco Editor mount handler
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    setEditorReady(true); // Trigger scroll sync setup
    
    // Update embedded artifact decorations when content changes
    editor.onDidChangeModelContent(() => {
      updateEmbeddedArtifactDecorations(editor, monaco);
    });
    
    // Initial decoration update
    updateEmbeddedArtifactDecorations(editor, monaco);
    
    // Register custom folding provider for Markdown headings
    monaco.languages.registerFoldingRangeProvider('markdown', {
      provideFoldingRanges: (model) => {
        const ranges: Monaco.languages.FoldingRange[] = [];
        const lines = model.getLinesContent();
        const headingStack: { level: number; startLine: number }[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const headingMatch = line.match(/^(#{1,6})\s/);
          
          if (headingMatch) {
            const level = headingMatch[1].length;
            
            // Close all headings with equal or higher level
            while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
              const heading = headingStack.pop()!;
              if (i - heading.startLine > 1) {
                ranges.push({
                  start: heading.startLine + 1,
                  end: i,
                  kind: monaco.languages.FoldingRangeKind.Region,
                });
              }
            }
            
            // Add current heading to stack
            headingStack.push({ level, startLine: i + 1 }); // +1 for 1-based line numbers
          }
        }
        
        // Close remaining headings at end of document
        while (headingStack.length > 0) {
          const heading = headingStack.pop()!;
          if (lines.length - heading.startLine > 0) {
            ranges.push({
              start: heading.startLine + 1,
              end: lines.length + 1,
              kind: monaco.languages.FoldingRangeKind.Region,
            });
          }
        }
        
        return ranges;
      },
    });
    
    // Track selection changes
    editor.onDidChangeCursorSelection(() => {
      const selection = editor.getSelection();
      const model = editor.getModel();
      if (selection && model) {
        const text = model.getValueInRange(selection);
        setSelectedText(text);
      }
    });
  };

  // Insert text at cursor position
  const insertTextAtCursor = (text: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    const selection = editor.getSelection();
    if (selection) {
      editor.executeEdits('ai-insert', [{
        range: selection,
        text: text,
        forceMoveMarkers: true,
      }]);
      editor.focus();
    }
  };

  // Insert Mermaid diagram template
  const insertMermaidTemplate = () => {
    const template = `\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
\`\`\`
`;
    insertTextAtCursor(template);
  };
  
  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-white">Lade Dokument...</div>;
  }

  if (!document) {
    return <div className="flex items-center justify-center h-full text-white">Dokument nicht gefunden</div>;
  }

  const getSaveStatusText = () => {
    switch (saveStatus) {
      case 'saving': return '💾 Speichere...';
      case 'saved': return '✅ Gespeichert';
      case 'error': return '❌ Fehler beim Speichern';
      default: return '';
    }
  };
  
  return (
    <div className="h-full flex">
      {/* Editor/Preview Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-gray-800 border-b border-gray-700 p-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">{document.title}</h2>
            
            {/* Import/Fork Badges */}
            {document.is_readonly && (
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-blue-900 text-blue-200 text-xs rounded border border-blue-700">
                  📥 Importiert
                </span>
                {upstreamData?.hasUpdates && (
                  <button
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                    className="px-2 py-0.5 bg-yellow-900 text-yellow-200 text-xs rounded border border-yellow-700 hover:bg-yellow-800 transition-colors"
                    title="Neue Version verfügbar - Klicken zum Synchronisieren"
                  >
                    🔄 Updates verfügbar
                  </button>
                )}
              </div>
            )}
            {document.source_url && !document.is_readonly && (
              <span className="px-2 py-0.5 bg-purple-900 text-purple-200 text-xs rounded border border-purple-700">
                🍴 Fork
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Auto-Save Status */}
            {saveStatus !== 'idle' && (
              <span className={`text-xs px-2 py-1 rounded ${
                saveStatus === 'saving' ? 'text-blue-400' :
                saveStatus === 'saved' ? 'text-green-400' :
                'text-red-400'
              }`}>
                {getSaveStatusText()}
              </span>
            )}

            {/* View Mode Selector */}
            <div className="flex bg-gray-700 rounded p-0.5">
              <button
                onClick={() => setViewMode('editor')}
                className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
                  viewMode === 'editor' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white'
                }`}
                title="Nur Editor"
              >
                📝
              </button>
              <button
                onClick={() => setViewMode('split')}
                className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
                  viewMode === 'split' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white'
                }`}
                title="Split-Ansicht"
              >
                ⚡
              </button>
              <button
                onClick={() => setViewMode('preview')}
                className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
                  viewMode === 'preview' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white'
                }`}
                title="Nur Vorschau"
              >
                👁️
              </button>
            </div>

            {/* Actions Dropdown Menu */}
            <div className="relative">
              <button
                onClick={() => setShowActionsMenu(!showActionsMenu)}
                className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 text-xs flex items-center gap-1"
                title="Aktionen"
              >
                ⚙️ Aktionen
                <span className="text-xs">{showActionsMenu ? '▲' : '▼'}</span>
              </button>
              
              {showActionsMenu && (
                <>
                  {/* Backdrop to close menu */}
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowActionsMenu(false)}
                  />
                  
                  {/* Dropdown Menu */}
                  <div className="absolute right-0 mt-1 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20">
                    <button
                      onClick={() => {
                        setShowPermissions(true);
                        setShowActionsMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-2 rounded-t-lg"
                    >
                      <span>🔗</span>
                      <span>Teilen / Berechtigungen</span>
                    </button>
                    
                    <button
                      onClick={() => {
                        setShowImageUpload(true);
                        setShowActionsMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-2"
                    >
                      <span>🖼️</span>
                      <span>Bild hochladen</span>
                    </button>
                    
                    <button
                      onClick={() => {
                        insertMermaidTemplate();
                        setShowActionsMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-2"
                    >
                      <span>📊</span>
                      <span>Diagramm einfügen</span>
                    </button>
                    
                    <button
                      onClick={() => {
                        setShowTableEditor(true);
                        setShowActionsMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-2"
                    >
                      <span>📋</span>
                      <span>Tabelle einfügen</span>
                    </button>
                    
                    <button
                      onClick={() => {
                        setShowConvertModal(true);
                        setShowActionsMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-2"
                    >
                      <span>🎬</span>
                      <span>Als Präsentation</span>
                    </button>
                    
                    <button
                      onClick={() => {
                        setShowVersionHistory(true);
                        setShowActionsMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-2"
                    >
                      <span>📜</span>
                      <span>Versions-Historie</span>
                    </button>

                    {/* Collaboration Actions */}
                    {document.is_readonly && (
                      <>
                        <div className="border-t border-gray-700 my-1"></div>
                        <button
                          onClick={() => {
                            forkMutation.mutate();
                            setShowActionsMenu(false);
                          }}
                          disabled={forkMutation.isPending}
                          className="w-full px-4 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-2"
                        >
                          <span>🍴</span>
                          <span>Fork erstellen (bearbeitbar)</span>
                        </button>
                        {upstreamData?.hasUpdates && (
                          <button
                            onClick={() => {
                              syncMutation.mutate();
                              setShowActionsMenu(false);
                            }}
                            disabled={syncMutation.isPending}
                            className="w-full px-4 py-2 text-left text-sm text-yellow-300 hover:bg-gray-700 flex items-center gap-2"
                          >
                            <span>�</span>
                            <span>Mit Original synchronisieren</span>
                          </button>
                        )}
                      </>
                    )}
                    
                    {document.source_url && !document.is_readonly && (
                      <>
                        <div className="border-t border-gray-700 my-1"></div>
                        <button
                          onClick={() => {
                            setShowPullRequestModal(true);
                            setShowActionsMenu(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-2"
                        >
                          <span>📤</span>
                          <span>Änderungen vorschlagen (PR)</span>
                        </button>
                      </>
                    )}
                    
                    {!document.is_readonly && !document.source_url && (
                      <>
                        <div className="border-t border-gray-700 my-1"></div>
                        <button
                          onClick={() => {
                            setShowPullRequestReview(true);
                            setShowActionsMenu(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-2"
                        >
                          <span>📥</span>
                          <span>Pull Requests{prData?.pullRequests?.filter((pr: any) => pr.status === 'pending').length ? ` (${prData.pullRequests.filter((pr: any) => pr.status === 'pending').length})` : ''}</span>
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Editor */}
          {(viewMode === 'editor' || viewMode === 'split') && (
            <div className={viewMode === 'split' ? 'w-1/2 border-r border-gray-700' : 'flex-1'}>
              <Editor
                height="100%"
                defaultLanguage="markdown"
                theme="vs-dark"
                value={content}
                onChange={(value) => setContent(value || '')}
                onMount={handleEditorMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  wordWrap: 'on',
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  // Enable folding for markdown headings
                  folding: true,
                  showFoldingControls: 'always', // Always show fold icons
                  foldingStrategy: 'auto', // Use auto strategy to allow custom provider
                  foldingHighlight: true,
                  unfoldOnClickAfterEndOfLine: true,
                }}
              />
            </div>
          )}

          {/* Preview */}
          {(viewMode === 'preview' || viewMode === 'split') && (
            <div className={`${viewMode === 'split' ? 'w-1/2' : 'flex-1'} overflow-hidden`}>
              <div ref={previewRef} className="h-full overflow-auto bg-white p-8">
                <div className="max-w-full prose prose-lg">
                  <MarkdownWithMermaid content={content} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* AI Panel - Always visible in editor mode */}
      {viewMode === 'editor' && (
        <>
          {/* Collapsed sidebar button */}
          {sidebarCollapsed && (
            <div className="fixed right-0 top-1/2 -translate-y-1/2 z-10">
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="bg-gray-800 border border-gray-700 rounded-l-lg p-2 hover:bg-gray-700 transition-colors"
                title="Sidebar öffnen"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>
          )}

          {/* Resizable sidebar */}
          {!sidebarCollapsed && (
            <div 
              className="bg-gray-800 border-l border-gray-700 flex flex-col relative"
              style={{ width: `${sidebarWidth}px`, minWidth: '300px', maxWidth: '800px' }}
            >
              {/* Resize handle */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 transition-colors group"
                onMouseDown={() => setIsResizing(true)}
              >
                <div className="absolute left-0 top-0 bottom-0 w-1 group-hover:bg-blue-500" />
              </div>

              {/* Tab Header */}
              <div className="flex border-b border-gray-700">
                <button
                  onClick={() => setRightPanelTab('ai')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    rightPanelTab === 'ai'
                      ? 'bg-gray-900 text-white border-b-2 border-blue-500'
                      : 'text-gray-400 hover:text-white hover:bg-gray-750'
                  }`}
                >
                  🤖 KI
                </button>
                <button
                  onClick={() => setRightPanelTab('artifacts')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    rightPanelTab === 'artifacts'
                      ? 'bg-gray-900 text-white border-b-2 border-blue-500'
                      : 'text-gray-400 hover:text-white hover:bg-gray-750'
                  }`}
                >
                  📦 Artefakte
                </button>
                <button
                  onClick={() => setRightPanelTab('research')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    rightPanelTab === 'research'
                      ? 'bg-gray-900 text-white border-b-2 border-blue-500'
                      : 'text-gray-400 hover:text-white hover:bg-gray-750'
                  }`}
                >
                  🔬 Research
                </button>
                <button
                  onClick={() => setRightPanelTab('transform')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    rightPanelTab === 'transform'
                      ? 'bg-gray-900 text-white border-b-2 border-blue-500'
                      : 'text-gray-400 hover:text-white hover:bg-gray-750'
                  }`}
                >
                  ✨ Transform
                </button>
                
                {/* Collapse button */}
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                  title="Sidebar einklappen"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-hidden">
                {rightPanelTab === 'ai' && (
                  <AIAssistant
                    documentId={id || ''}
                    selectedText={selectedText}
                    documentContent={content}
                    onInsert={insertTextAtCursor}
                    onUpdateDocument={setContent}
                    selectedArtifactIds={selectedArtifactIds}
                  />
                )}
                {rightPanelTab === 'artifacts' && (
                  <ArtifactsPanel
                    documentId={id || ''}
                    onUseInContext={setSelectedArtifactIds}
                  />
                )}
                {rightPanelTab === 'research' && (
                  <DeepResearchPanel
                    documentId={id || ''}
                    documentContent={content}
                    selectedText={selectedText}
                    onSuggestionsGenerated={(suggestions) => {
                      setResearchSuggestions(suggestions);
                      setShowResearchSuggestions(true);
                    }}
                  />
                )}
                {rightPanelTab === 'transform' && (
                  <TransformToolsPanel
                    documentId={id || ''}
                    documentContent={content}
                    onInsertContent={insertTextAtCursor}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Version History Modal */}
      {showVersionHistory && (
        <VersionHistoryModal
          documentId={id || ''}
          onClose={() => setShowVersionHistory(false)}
        />
      )}

      {/* Image Upload Modal */}
      {showImageUpload && id && (
        <ImageUploadModal
          documentId={id}
          isOpen={showImageUpload}
          onClose={() => setShowImageUpload(false)}
          onImageInserted={(imageUrl) => {
            const editor = editorRef.current;
            if (editor) {
              const selection = editor.getSelection();
              const markdown = `![Bildbeschreibung](${imageUrl})`;
              if (selection) {
                editor.executeEdits('insert-image', [{
                  range: selection,
                  text: markdown,
                }]);
              }
            }
          }}
        />
      )}

      {/* Table Editor Modal */}
      {showTableEditor && (
        <TableEditor
          isOpen={showTableEditor}
          onClose={() => setShowTableEditor(false)}
          onInsert={(markdown) => {
            insertTextAtCursor(markdown);
            setShowTableEditor(false);
          }}
        />
      )}

      {/* Research Suggestions Modal */}
      {showResearchSuggestions && researchSuggestions.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-white">
                🔬 Deep Research Ergebnisse
              </h3>
              <button
                onClick={() => setShowResearchSuggestions(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(80vh-60px)]">
              <DocumentSuggestions
                data={{
                  analysis: 'Deep Research Ergebnisse basierend auf Web-Suche und MCP-Abfragen',
                  suggestions: researchSuggestions,
                  uploadedFileName: 'Deep Research',
                }}
                onAccept={(_suggestion, index) => {
                  setAcceptedResearchIndices(prev => new Set(prev).add(index));
                }}
                onReject={(index) => {
                  setRejectedResearchIndices(prev => new Set(prev).add(index));
                }}
                onRequestDetails={(suggestion, index) => {
                  console.log('Request details:', suggestion, index);
                }}
                onApplyAll={async () => {
                  try {
                    const result = await api.integrateSuggestions({
                      documentId: id || '',
                      acceptedSuggestions: Array.from(acceptedResearchIndices),
                      suggestionsData: { suggestions: researchSuggestions },
                    });

                    if (result.updatedContent) {
                      setContent(result.updatedContent);
                    }

                    queryClient.invalidateQueries({ queryKey: ['document', id] });
                    setShowResearchSuggestions(false);
                    setAcceptedResearchIndices(new Set());
                    setRejectedResearchIndices(new Set());
                  } catch (error) {
                    console.error('Failed to apply suggestions:', error);
                  }
                }}
                isApplying={false}
                acceptedIndices={acceptedResearchIndices}
                rejectedIndices={rejectedResearchIndices}
              />
            </div>
          </div>
        </div>
      )}

      {/* Convert to Presentation Modal */}
      {showConvertModal && document && (
        <ConvertToPresentationModal
          isOpen={showConvertModal}
          onClose={() => setShowConvertModal(false)}
          documentContent={content}
          documentId={id || ''}
          documentTitle={document.title}
          onConversionComplete={(result) => {
            setPresentationResult(result);
            queryClient.invalidateQueries({ queryKey: ['artifacts', id] });
          }}
        />
      )}

      {/* Presentation Viewer */}
      {presentationResult && (
        <PresentationViewer
          isOpen={!!presentationResult}
          onClose={() => setPresentationResult(null)}
          htmlContent={presentationResult.html}
          title={`Präsentation: ${document?.title || 'Unbenannt'}`}
        />
      )}

      {/* Document Permissions Modal */}
      {showPermissions && (
        <DocumentPermissionsModal
          isOpen={showPermissions}
          onClose={() => setShowPermissions(false)}
          documentId={id || ''}
        />
      )}

      {/* Pull Request Modal */}
      {showPullRequestModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowPullRequestModal(false)}
        >
          <div 
            className="bg-gray-800 rounded-lg p-6 max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-xl font-bold text-white">
                Änderungen vorschlagen
              </h2>
              <button
                onClick={() => setShowPullRequestModal(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <p className="text-sm text-gray-400 mb-4">
              Schlage deine Änderungen dem Original-Dokument vor. Der Autor kann sie dann überprüfen und akzeptieren.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Beschreibung der Änderungen
              </label>
              <textarea
                value={pullRequestMessage}
                onChange={(e) => setPullRequestMessage(e.target.value)}
                placeholder="z.B. Rechtschreibfehler korrigiert, neue Abschnitte hinzugefügt..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowPullRequestModal(false)}
                className="btn-secondary"
              >
                Abbrechen
              </button>
              <button
                onClick={() => pullRequestMutation.mutate(pullRequestMessage)}
                disabled={!pullRequestMessage.trim() || pullRequestMutation.isPending}
                className="btn-primary"
              >
                {pullRequestMutation.isPending ? 'Wird erstellt...' : '📤 Pull Request erstellen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pull Request Review Panel */}
      <PullRequestPanel
        documentId={id!}
        isOpen={showPullRequestReview}
        onClose={() => setShowPullRequestReview(false)}
      />
    </div>
  );
}
