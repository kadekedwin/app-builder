import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from '../types';

import { API_KEY } from '../services/ai-service';

export default function Home() {
  const [apps, setApps] = useState<App[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchApps = () => {
      // @ts-ignore
      window.ipcRenderer.invoke('get-apps').then((result) => {
        setApps(result);
      });
    };

    fetchApps();

    // Poll every 3 seconds to check for status updates
    const interval = setInterval(fetchApps, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleRunApp = async (appId: number) => {
    // @ts-ignore
    const success = await window.ipcRenderer.invoke('run-app', appId);
    if (!success) {
      alert('Failed to run app. The app files might be missing or corrupted. Please try regenerating the app.');
    }
  };

  const handleRegenerate = async (app: App) => {
    const confirm = window.confirm('Are you sure you want to regenerate this app? This will overwrite existing files.');
    if (!confirm) return;

    // @ts-ignore
    await window.ipcRenderer.invoke('regenerate-app', app, API_KEY);
    // State update will happen via polling
  };

  return (
    <div className="container">
      <header className="header">
        <h1>My Apps</h1>
        <button className="btn-primary" onClick={() => navigate('/create')}>
          + Create New App
        </button>
      </header>

      {apps.length === 0 ? (
        <div className="empty-state">
          <p>You haven't created any apps yet.</p>
          <button className="btn-secondary" onClick={() => navigate('/create')}>
            Start Building
          </button>
        </div>
      ) : (
        <div className="app-grid">
          {apps.map((app) => (
            <div key={app.id} className="app-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <h3>{app.name}</h3>
                {app.status === 'generating' && (
                  <span style={{ 
                    background: '#e0f2fe', 
                    color: '#0284c7', 
                    padding: '0.2rem 0.6rem', 
                    borderRadius: '1rem',
                    fontSize: '0.8rem',
                    fontWeight: 500
                  }}>
                    Generating...
                  </span>
                )}
                {app.status === 'error' && (
                  <span style={{ 
                    background: '#fee2e2', 
                    color: '#dc2626', 
                    padding: '0.2rem 0.6rem', 
                    borderRadius: '1rem',
                    fontSize: '0.8rem',
                    fontWeight: 500
                  }}>
                    Failed
                  </span>
                )}
              </div>
              
              <p>{app.description}</p>
              <div className="app-meta">
                <span>Created: {new Date(app.created_at).toLocaleDateString()}</span>
              </div>
              <div className="app-actions" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                {app.status === 'generating' ? (
                   <button 
                    className="btn-secondary" 
                    style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem', opacity: 0.7, cursor: 'not-allowed' }}
                    disabled
                  >
                    Creating App...
                  </button>
                ) : app.status === 'error' ? (
                  <button 
                    className="btn-secondary" 
                    style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem', borderColor: '#dc2626', color: '#dc2626' }}
                    onClick={() => handleRegenerate(app)}
                  >
                    ↻ Regenerate
                  </button>
                ) : (
                  <>
                    <button 
                      className="btn-primary" 
                      style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}
                      onClick={() => handleRunApp(app.id)}
                    >
                      ▶ Run App
                    </button>
                    <button 
                      className="btn-secondary" 
                      style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}
                      onClick={() => handleRegenerate(app)}
                      title="Regenerate"
                    >
                      ↻
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
