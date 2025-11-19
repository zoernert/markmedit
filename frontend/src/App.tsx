import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { DocumentList } from './pages/DocumentList';
import { DocumentEditor } from './pages/DocumentEditor';
import { ArtifactLibrary } from './pages/ArtifactLibrary';
import { MCPServerManagement } from './pages/MCPServerManagement';
import { LoginPage } from './pages/Login';
import { RegisterPage } from './pages/Register';
import { PublicDocument } from './pages/PublicDocument';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/public/:id" element={<PublicDocument />} />
          <Route path="/*" element={<Layout />}>
            <Route index element={<Navigate to="/documents" replace />} />
            <Route path="documents" element={<DocumentList />} />
            <Route path="documents/:id" element={<DocumentEditor />} />
            <Route path="artifacts" element={<ArtifactLibrary />} />
            <Route path="mcp-servers" element={<MCPServerManagement />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
