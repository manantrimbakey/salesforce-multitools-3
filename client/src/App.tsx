import { useState, useEffect } from 'react'
import './App.css'

// VS Code API - will be acquired when running inside the webview
declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: any) => void;
      getState: () => any;
      setState: (state: any) => void;
    };
  }
}

// Get the VS Code API instance
const vscode = (() => {
  try {
    return window.acquireVsCodeApi();
  } catch (error) {
    // When running outside of VS Code webview, provide a mock implementation
    console.warn('Running outside of VS Code webview, using mock API');
    return {
      postMessage: (message: any) => console.log('VS Code message:', message),
      getState: () => ({}),
      setState: (state: any) => console.log('VS Code state:', state),
    };
  }
})();

// Interfaces for file system entries
interface FileSystemEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  // Optional icon class from VS Code codicons
  icon?: string;
}

interface ExtensionData {
  extensionPath?: string;
  workspaceFolder?: string;
  currentDirectory?: string;
  files?: FileSystemEntry[];
}

function App() {
  const [loading, setLoading] = useState(false);
  const [extensionData, setExtensionData] = useState<ExtensionData>({});
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<FileSystemEntry[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{name: string, path: string}>>([]);

  // Listen for messages from the extension
  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;
      console.log('Message received from extension:', message);
      
      switch (message.command) {
        case 'init':
          // Store initialization data
          setExtensionData(message.data || {});
          if (message.data?.workspaceFolder) {
            browseDirectory(message.data.workspaceFolder);
          }
          break;
        case 'fileList':
          setLoading(false);
          if (message.files && Array.isArray(message.files)) {
            setFiles(message.files);
            setCurrentPath(message.currentDirectory || '');
            updateBreadcrumbs(message.currentDirectory || '');
          }
          break;
        default:
          console.log('Unknown command:', message.command);
      }
    };
    
    // Add event listener
    window.addEventListener('message', messageHandler);
    
    // Send ready message to the extension
    vscode.postMessage({ command: 'ready' });
    
    // Clean up event listener
    return () => {
      window.removeEventListener('message', messageHandler);
    };
  }, []);

  // Update breadcrumbs based on current path
  const updateBreadcrumbs = (path: string) => {
    if (!path) {
      setBreadcrumbs([]);
      return;
    }
    
    // Split path into segments
    const segments = path.split(/[/\\]/).filter(Boolean);
    const crumbs = [];
    
    // Start with root or first segment
    let currentPath = '';
    let rootName = extensionData.workspaceFolder ? 'Workspace' : 'Root';
    
    crumbs.push({ name: rootName, path: extensionData.workspaceFolder || '' });
    
    // Add each segment as a breadcrumb
    for (let i = 0; i < segments.length; i++) {
      currentPath += (currentPath ? '/' : '') + segments[i];
      crumbs.push({
        name: segments[i],
        path: currentPath
      });
    }
    
    setBreadcrumbs(crumbs);
  };

  // Browse to a specific directory
  const browseDirectory = (path: string) => {
    setLoading(true);
    vscode.postMessage({
      command: 'browseDirectory',
      path: path
    });
  };

  // Open a file in VS Code
  const openFile = (path: string) => {
    vscode.postMessage({
      command: 'openFile',
      path: path
    });
  };

  // Handler for clicking on a file or directory
  const handleItemClick = (item: FileSystemEntry) => {
    if (item.isDirectory) {
      browseDirectory(item.path);
    } else {
      openFile(item.path);
    }
  };
  
  // Navigate up to parent directory
  const navigateUp = () => {
    if (currentPath && extensionData.workspaceFolder) {
      // Check if we're already at the root
      if (currentPath === extensionData.workspaceFolder) {
        return;
      }
      
      // Get parent path
      const pathParts = currentPath.split(/[/\\]/);
      pathParts.pop(); // Remove last segment
      const parentPath = pathParts.join('/');
      
      browseDirectory(parentPath || extensionData.workspaceFolder);
    }
  };

  // Get appropriate icon for file based on extension
  const getFileIcon = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    
    // Map file extensions to emoji icons
    switch(ext) {
      case 'cls': return '⚡'; // Apex Class
      case 'trigger': return '🔌'; // Apex Trigger
      case 'page': return '🌐'; // Visualforce
      case 'component': return '🧩'; // Component
      case 'app': return '📱'; // Lightning App
      case 'cmp': return '🧩'; // Lightning Component
      case 'js': return '📜'; // JavaScript
      case 'html': return '🌐'; // HTML
      case 'css': return '🎨'; // CSS
      case 'xml': return '📋'; // XML
      case 'json': return '📦'; // JSON
      case 'md': return '📝'; // Markdown
      default: return '📄';
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1>Salesforce File Switcher</h1>
      </header>
      
      <div className="content">
        {/* Breadcrumb navigation */}
        <div className="breadcrumbs">
          {breadcrumbs.map((crumb, index) => (
            <span key={index}>
              {index > 0 && <span className="separator">/</span>}
              <button 
                className="breadcrumb-btn"
                onClick={() => browseDirectory(crumb.path)}
              >
                {crumb.name}
              </button>
            </span>
          ))}
      </div>
        
        {/* Navigation toolbar */}
        <div className="toolbar">
          <button 
            className="toolbar-btn"
            title="Go up one level"
            onClick={navigateUp}
            disabled={!currentPath || currentPath === extensionData.workspaceFolder}
          >
            ⬆️ Up
        </button>
          <span className="current-path">
            {currentPath || 'No directory selected'}
          </span>
        </div>
        
        {/* File list */}
        <div className="file-list">
          {loading ? (
            <div className="loading">Loading files...</div>
          ) : files.length > 0 ? (
            <ul>
              {files.map((item, index) => (
                <li 
                  key={index} 
                  className={`file-item ${item.isDirectory ? 'directory' : 'file'}`}
                  onClick={() => handleItemClick(item)}
                >
                  <span className={`icon ${item.isDirectory ? 'folder-icon' : 'file-icon'}`}>
                    {item.isDirectory ? '📁' : getFileIcon(item.name)}
                  </span>
                  <span className="file-name">{item.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <p>No files found in this directory</p>
            </div>
          )}
        </div>
      </div>
      
      <footer className="footer">
        <p>Salesforce Multitools © 2025</p>
      </footer>
    </div>
  )
}

export default App
