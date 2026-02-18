import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App } from '../../shared/types/app';
import { 
  ArrowLeft, 
  RotateCcw, 
  Play, 
  Settings, 
  Trash2, 
  FileText, 
  Users, 
  Target, 
  Calendar, 
  Activity,
  Copy
} from 'lucide-react';
import { appApi } from '../api/app-api';

export default function AppDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState<App | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchApp = () => {
      appApi.getApp(Number(id)).then((result) => {
        setApp(result);
        setLoading(false);
      });
    };

    fetchApp();
    const interval = setInterval(fetchApp, 3000); // Poll for status updates
    return () => clearInterval(interval);
  }, [id]);

  const handleRunApp = async () => {
    if (!app) return;
    const success = await appApi.runApp(app.id);
    if (!success) {
      alert('Failed to run app. The app files might be missing or corrupted. Please try regenerating the app.');
    }
  };

  const handleRegenerate = async () => {
    if (!app) return;
    const confirm = window.confirm('Are you sure you want to regenerate this app? This will overwrite existing files.');
    if (!confirm) return;

    await appApi.regenerateApp(app);
  };

  if (loading) return <div className="container">Loading...</div>;
  if (!app) return <div className="container">App not found</div>;

  return (
    <div className="container">
      {/* Header */}
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn-secondary" onClick={() => navigate('/')} style={{ padding: '0.4rem' }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <h1 style={{ fontSize: '2rem', marginBottom: '0' }}>{app.name}</h1>
              {app.status === 'ready' && <span className="badge badge-success">Active</span>}
              {app.status === 'generating' && <span className="badge badge-warning">Cooking...</span>}
              {app.status === 'error' && <span className="badge badge-error">Failed</span>}
            </div>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>v1.0.0 • stable</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-secondary" onClick={handleRegenerate} disabled={app.status === 'generating'}>
            <RotateCcw size={16} /> Regenerate App
          </button>
          {app.status === 'ready' && (
            <button className="btn-primary" onClick={handleRunApp}>
              <Play size={16} /> Run App
            </button>
          )}
        </div>
      </div>

      <div className="detail-layout">
        {/* Main Content */}
        <div>
           {/* Run Preview / Stream Placeholder */}
           <div className="detail-card" style={{ padding: 0, overflow: 'hidden', border: 'none', background: 'transparent' }}>
            <div className="processing-stream">
               <Activity size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
               <h3>Data Processing Stream Active</h3>
            </div>
          </div>

          <div className="detail-card">
            <h3><FileText size={20} className="text-primary" /> App Description</h3>
            <p style={{ lineHeight: '1.6', color: 'var(--color-text-secondary)' }}>
              {app.description}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="detail-card">
              <h3><Users size={20} /> Target Audience</h3>
              <ul style={{ paddingLeft: '1.2rem', color: 'var(--color-text-secondary)' }}>
                {app.target_audience.split(',').map((item, i) => (
                  <li key={i} style={{ marginBottom: '0.5rem' }}>{item.trim()}</li>
                ))}
              </ul>
            </div>
            <div className="detail-card">
              <h3><Target size={20} /> Primary Goal</h3>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                {app.goal}
              </p>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="sidebar-panel">
          <h3 style={{ marginBottom: '1.5rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Technical Details</h3>
          
          <div className="info-row">
            <span className="info-label">Application ID</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#F1F5F9', padding: '0.5rem', borderRadius: '6px' }}>
              <span style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>app_{app.id}_{Math.random().toString(36).substr(2, 6)}</span>
              <Copy size={12} style={{ cursor: 'pointer', color: '#64748B' }} />
            </div>
          </div>

          <div className="info-row">
            <span className="info-label"><Calendar size={14} style={{ display: 'inline', marginRight: '4px' }}/> Created At</span>
            <span className="info-value">{new Date(app.created_at).toLocaleString()}</span>
          </div>

          <div className="info-row">
            <span className="info-label"><RotateCcw size={14} style={{ display: 'inline', marginRight: '4px' }}/> Last Updated</span>
            <span className="info-value">{new Date(app.updated_at).toLocaleString()}</span>
          </div>

          <hr style={{ borderColor: 'var(--color-border)', margin: '1.5rem 0' }} />

          <h3 style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Environment Stats</h3>
          
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
              <span>CPU Usage</span>
              <span style={{ fontWeight: 600 }}>12%</span>
            </div>
            <div style={{ height: '6px', background: '#E2E8F0', borderRadius: '3px' }}>
              <div style={{ height: '100%', width: '12%', background: 'var(--color-primary)', borderRadius: '3px' }}></div>
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
              <span>Memory</span>
              <span style={{ fontWeight: 600 }}>1.2GB / 4GB</span>
            </div>
            <div style={{ height: '6px', background: '#E2E8F0', borderRadius: '3px' }}>
              <div style={{ height: '100%', width: '30%', background: 'var(--color-primary)', borderRadius: '3px' }}></div>
            </div>
          </div>

          <hr style={{ borderColor: 'var(--color-border)', margin: '1.5rem 0' }} />
          
          <button className="btn-secondary" style={{ width: '100%', marginBottom: '0.75rem' }}>
            <Settings size={16} /> App Settings
          </button>
          
          <button className="btn-danger-outline" style={{ width: '100%' }}>
            <Trash2 size={16} /> Archive Application
          </button>

        </div>
      </div>
    </div>
  );
}
