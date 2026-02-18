import { useState, useEffect, useCallback } from 'react';
import { App } from '../../shared/types';
import { electronApi } from '../api/electron-api';

export function useAppsViewModel() {
  const [apps, setApps] = useState<App[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchApps = useCallback(() => {
    electronApi.getApps().then((result) => {
      setApps(result);
    });
  }, []);

  useEffect(() => {
    fetchApps();
    // Poll every 3 seconds to check for status updates
    const interval = setInterval(fetchApps, 3000);
    return () => clearInterval(interval);
  }, [fetchApps]);

  const handleRunApp = async (appId: number): Promise<boolean> => {
    return await electronApi.runApp(appId);
  };

  const filteredApps = apps.filter(app => 
    app.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    app.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const cookingCount = apps.filter(a => a.status === 'generating').length;
  const activeCount = apps.filter(a => a.status === 'ready').length;

  return {
    apps,
    filteredApps,
    searchTerm,
    setSearchTerm,
    cookingCount,
    activeCount,
    fetchApps,
    handleRunApp
  };
}
