import { Outlet, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAuthenticated, loading } = useAuth();
  
  const isActive = (path: string) => {
    const active = location.pathname === path;
    return active ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-gray-700';
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Show loading state
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-2xl font-bold text-white">MarkMEdit</h1>
          <p className="text-xs text-gray-400 mt-1">KI-gestützter Knowledge Worker</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <Link
            to="/documents"
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${isActive('/documents')}`}
          >
            <span>📚</span>
            <span>Dokumente</span>
          </Link>

          <Link
            to="/artifacts"
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${isActive('/artifacts')}`}
          >
            <span>📦</span>
            <span>Artifakte</span>
          </Link>

          <Link
            to="/mcp-servers"
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${isActive('/mcp-servers')}`}
          >
            <span>⚙️</span>
            <span>MCP Server</span>
          </Link>
        </nav>
        
        <div className="p-4 border-t border-gray-700">
          <div className="mb-3 text-sm text-gray-400">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>Online</span>
            </div>
            <div className="text-xs">
              Gemini 2.5 Flash • MCP Hub
            </div>
          </div>
          
          {/* User info and logout */}
          <div className="pt-3 border-t border-gray-600">
            <div className="text-sm text-gray-300 mb-2">
              👤 {user?.username || user?.email}
            </div>
            <button
              onClick={handleLogout}
              className="w-full px-3 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              Abmelden
            </button>
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
