import React, { useState, useEffect } from 'react';
import { permissionsApi, type DocumentPermissions } from '../lib/permissions-api';
import { useAuth } from '../contexts/AuthContext';

interface DocumentPermissionsModalProps {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const DocumentPermissionsModal: React.FC<DocumentPermissionsModalProps> = ({
  documentId,
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<DocumentPermissions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPermission, setNewUserPermission] = useState<'read' | 'write' | 'admin'>('read');
  const [newGroupPermission, setNewGroupPermission] = useState<'read' | 'write' | 'admin'>('read');
  const [selectedGroup, setSelectedGroup] = useState<string>('_LOGGED_IN');
  const [shareId, setShareId] = useState<string | null>(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadPermissions();
    }
  }, [isOpen, documentId]);

  const loadPermissions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await permissionsApi.getDocumentPermissions(documentId);
      setPermissions(data);

      // Check share status (new system)
      const shareStatus = await permissionsApi.getShareStatus(documentId);
      setShareEnabled(shareStatus.shareEnabled);
      setShareId(shareStatus.shareId);
    } catch (err) {
      setError('Failed to load permissions');
      console.error('Error loading permissions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUserPermission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail) return;

    try {
      setLoading(true);
      // Note: In a real implementation, you'd need to look up the user ID by email
      // For now, we'll assume the email is the user ID (this should be changed)
      await permissionsApi.setUserPermission(documentId, newUserEmail, newUserPermission);
      setNewUserEmail('');
      await loadPermissions();
    } catch (err) {
      setError('Failed to add user permission');
      console.error('Error adding user permission:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGroupPermission = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);
      await permissionsApi.setGroupPermission(documentId, selectedGroup, newGroupPermission);
      await loadPermissions();
    } catch (err) {
      setError('Failed to add group permission');
      console.error('Error adding group permission:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveUserPermission = async (userId: string) => {
    try {
      setLoading(true);
      await permissionsApi.removeUserPermission(documentId, userId);
      await loadPermissions();
    } catch (err) {
      setError('Failed to remove user permission');
      console.error('Error removing user permission:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveGroupPermission = async (groupId: string) => {
    try {
      setLoading(true);
      await permissionsApi.removeGroupPermission(documentId, groupId);
      await loadPermissions();
    } catch (err) {
      setError('Failed to remove group permission');
      console.error('Error removing group permission:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleShareLink = async () => {
    try {
      setLoading(true);
      if (shareEnabled) {
        await permissionsApi.disableShare(documentId);
        setShareEnabled(false);
        setShareId(null);
      } else {
        const result = await permissionsApi.enableShare(documentId);
        setShareEnabled(true);
        setShareId(result.shareId);
      }
      await loadPermissions();
    } catch (err) {
      setError('Failed to toggle share link');
      console.error('Error toggling share link:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyShareUrl = (format: string) => {
    const baseUrl = `${window.location.origin}/share/${shareId}`;
    let url = baseUrl;
    
    switch (format) {
      case 'html':
        url = `${baseUrl}.html`;
        break;
      case 'rss':
        url = `${baseUrl}.rss`;
        break;
      case 'pdf':
        url = `${baseUrl}.pdf`;
        break;
      case 'docx':
        url = `${baseUrl}.docx`;
        break;
    }
    
    navigator.clipboard.writeText(url);
    setCopiedFormat(format);
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  if (!isOpen) return null;

  const isOwner = user && permissions && user.id === permissions.owner_id;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Document Permissions
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded">
            {error}
          </div>
        )}

        {loading && !permissions ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          </div>
        ) : permissions ? (
          <div className="space-y-6">
            {/* Share Links Section */}
            {isOwner && (
              <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">🔗 Öffentliche Share-Links</h3>
                
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Öffentlichen Zugriff aktivieren (auch für nicht registrierte Nutzer)
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shareEnabled}
                      onChange={handleToggleShareLink}
                      className="sr-only peer"
                      disabled={loading}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-600"></div>
                  </label>
                </div>

                {shareEnabled && shareId && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3 space-y-3">
                    {/* HTML Preview */}
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-semibold">📄 HTML Preview:</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={`${window.location.origin}/share/${shareId}`}
                          readOnly
                          className="flex-1 px-2 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white font-mono"
                        />
                        <button
                          onClick={() => handleCopyShareUrl('preview')}
                          className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded text-xs flex items-center gap-1"
                        >
                          {copiedFormat === 'preview' ? (
                            <>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              ✓
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* HTML Download */}
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-semibold">💾 HTML Download:</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={`${window.location.origin}/share/${shareId}.html`}
                          readOnly
                          className="flex-1 px-2 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white font-mono"
                        />
                        <button
                          onClick={() => handleCopyShareUrl('html')}
                          className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded text-xs flex items-center gap-1"
                        >
                          {copiedFormat === 'html' ? (
                            <>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              ✓
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* RSS Feed */}
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-semibold">📡 RSS Feed (Versionshistorie):</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={`${window.location.origin}/share/${shareId}.rss`}
                          readOnly
                          className="flex-1 px-2 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white font-mono"
                        />
                        <button
                          onClick={() => handleCopyShareUrl('rss')}
                          className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded text-xs flex items-center gap-1"
                        >
                          {copiedFormat === 'rss' ? (
                            <>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              ✓
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* PDF Export */}
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-semibold">📋 PDF Export:</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={`${window.location.origin}/share/${shareId}.pdf`}
                          readOnly
                          className="flex-1 px-2 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white font-mono"
                        />
                        <button
                          onClick={() => handleCopyShareUrl('pdf')}
                          className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded text-xs flex items-center gap-1"
                        >
                          {copiedFormat === 'pdf' ? (
                            <>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              ✓
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* DOCX Export */}
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-semibold">📝 DOCX Export:</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={`${window.location.origin}/share/${shareId}.docx`}
                          readOnly
                          className="flex-1 px-2 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white font-mono"
                        />
                        <button
                          onClick={() => handleCopyShareUrl('docx')}
                          className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded text-xs flex items-center gap-1"
                        >
                          {copiedFormat === 'docx' ? (
                            <>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              ✓
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-2 pt-2 border-t border-green-200 dark:border-green-800">
                      ⚠️ Achtung: Jeder mit diesen Links kann das Dokument lesen (ohne Anmeldung).
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Owner Info */}
            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Owner</h3>
              <div className="flex items-center justify-between">
                <span className="text-gray-700 dark:text-gray-300">
                  {permissions.owner_id}
                  {isOwner && <span className="ml-2 text-sm text-blue-500">(You)</span>}
                </span>
                <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full text-sm">
                  Owner
                </span>
              </div>
            </div>

            {/* User Permissions */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">User Permissions</h3>
              
              {permissions.user_permissions.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {permissions.user_permissions.map((perm) => (
                    <div
                      key={perm.user_id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded"
                    >
                      <span className="text-gray-700 dark:text-gray-300">{perm.username}</span>
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-sm ${
                          perm.permission_level === 'admin'
                            ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                            : perm.permission_level === 'write'
                            ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                            : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                        }`}>
                          {perm.permission_level}
                        </span>
                        {isOwner && (
                          <button
                            onClick={() => handleRemoveUserPermission(perm.user_id)}
                            className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            disabled={loading}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 mb-4">No user permissions set</p>
              )}

              {isOwner && (
                <form onSubmit={handleAddUserPermission} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="User email or ID"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <select
                    value={newUserPermission}
                    onChange={(e) => setNewUserPermission(e.target.value as any)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="read">Read</option>
                    <option value="write">Write</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
                    disabled={loading}
                  >
                    Add
                  </button>
                </form>
              )}
            </div>

            {/* Group Permissions */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Group Permissions</h3>
              
              {permissions.group_permissions.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {permissions.group_permissions.map((perm) => (
                    <div
                      key={perm.group_id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded"
                    >
                      <span className="text-gray-700 dark:text-gray-300">{perm.group_name}</span>
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-sm ${
                          perm.permission_level === 'admin'
                            ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                            : perm.permission_level === 'write'
                            ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                            : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                        }`}>
                          {perm.permission_level}
                        </span>
                        {isOwner && (
                          <button
                            onClick={() => handleRemoveGroupPermission(perm.group_id)}
                            className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            disabled={loading}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 mb-4">No group permissions set</p>
              )}

              {isOwner && (
                <form onSubmit={handleAddGroupPermission} className="flex gap-2">
                  <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="_EVERYONE">Everyone (Public)</option>
                    <option value="_LOGGED_IN">Logged In Users</option>
                  </select>
                  <select
                    value={newGroupPermission}
                    onChange={(e) => setNewGroupPermission(e.target.value as any)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="read">Read</option>
                    <option value="write">Write</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
                    disabled={loading}
                  >
                    Add
                  </button>
                </form>
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
