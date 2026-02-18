import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from '../types';
import { Search, Plus, Rocket, ChefHat, CheckCircle2, Play } from 'lucide-react';

export default function Home() {
  const [apps, setApps] = useState<App[]>([]);
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

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

  const handleRunApp = async (e: React.MouseEvent, appId: number) => {
    e.stopPropagation(); // Prevent card click
    // @ts-ignore
    const success = await window.ipcRenderer.invoke('run-app', appId);
    if (!success) {
      alert('Failed to run app. The app files might be missing or corrupted. Please try regenerating the app.');
    }
  };

  const filteredApps = apps.filter(app => 
    app.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    app.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const cookingCount = apps.filter(a => a.status === 'generating').length;
  const activeCount = apps.filter(a => a.status === 'ready').length;

  return (
    <div className="container">
      <header className="header">
        <h1>App Library</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
             <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
             <input 
              type="text" 
              placeholder="Search apps..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '2.5rem', width: '300px' }}
             />
          </div>
          <button className="btn-primary" onClick={() => navigate('/create')}>
            <Plus size={18} /> Create New App
          </button>
        </div>
      </header>

      {/* Stats Row */}
      <div className="stats-grid">
         <div className="stat-card">
            <div className="stat-icon" style={{ background: '#E0F2FE', color: '#0284C7' }}>
              <Rocket size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>TOTAL APPS</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{apps.length}</div>
            </div>
         </div>
         <div className="stat-card">
            <div className="stat-icon" style={{ background: '#FFF7ED', color: '#C2410C' }}>
              <ChefHat size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>COOKING</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{cookingCount}</div>
            </div>
         </div>
         <div className="stat-card">
            <div className="stat-icon" style={{ background: '#DCFCE7', color: '#166534' }}>
              <CheckCircle2 size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>ACTIVE</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{activeCount}</div>
            </div>
         </div>
      </div>

      {filteredApps.length === 0 ? (
        <div className="empty-state" style={{ textAlign: 'center', padding: '4rem', background: 'white', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
          <div style={{ background: '#F1F5F9', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
            <Rocket size={32} color="#64748B" />
          </div>
          <h3>No Apps Found</h3>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
            {searchTerm ? `No apps matching "${searchTerm}"` : "You haven't created any apps yet."}
          </p>
          <button className="btn-primary" onClick={() => navigate('/create')}>
            Start Building
          </button>
        </div>
      ) : (
        <div className="app-grid">
          {filteredApps.map((app) => (
            <div key={app.id} className="app-card" onClick={() => navigate(`/app/${app.id}`)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                <div style={{ background: '#F1F5F9', padding: '0.5rem', borderRadius: '8px' }}>
                   {app.status === 'generating' ? <ChefHat size={20} color="#F59E0B" /> : <Rocket size={20} color="#2563EB" />}
                </div>
                {app.status === 'generating' && (
                  <span className="badge badge-warning">Cooking...</span>
                )}
              </div>
              
              <h3>{app.name}</h3>
              <p>{app.description}</p>
              
              <div style={{ marginTop: 'auto' }}>
                 {app.status === 'generating' ? (
                   <div style={{ width: '100%', height: '4px', background: '#E2E8F0', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: '65%', height: '100%', background: '#F59E0B' }}></div>
                   </div>
                 ) : app.status === 'error' ? (
                    <div style={{ color: '#EF4444', fontSize: '0.85rem', fontWeight: 500 }}>
                       Generation Failed
                    </div>
                 ) : (
                    <button 
                      className="btn-primary" 
                      style={{ width: '100%', padding: '0.5rem' }}
                      onClick={(e) => handleRunApp(e, app.id)}
                    >
                      <Play size={16} /> Run App
                    </button>
                 )}
                 <div className="app-meta" style={{ marginTop: '1rem', borderTop: 'none', paddingTop: 0 }}>
                    <span>{new Date(app.created_at).toLocaleDateString()}</span>
                    {app.status === 'generating' && <span style={{ float: 'right', fontSize: '0.75rem', color: '#F59E0B' }}>65% COMPLETE</span>}
                 </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
