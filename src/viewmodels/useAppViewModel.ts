import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, CreateAppPayload } from '../../shared/types/app';
import { appApi } from '../api/app-api';

export type ViewModelMode = 'list' | 'create';

interface FormData {
  name: string;
  description: string;
  targetAudience: string;
  goal: string;
}

export function useAppViewModel(mode: ViewModelMode = 'list') {
  const navigate = useNavigate();

  // List State
  const [apps, setApps] = useState<App[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Create State
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    targetAudience: '',
    goal: '',
  });

  // --- List Logic ---
  const fetchApps = useCallback(() => {
    if (mode === 'list') {
      appApi.getApps().then((result) => {
        setApps(result);
      });
    }
  }, [mode]);

  useEffect(() => {
    if (mode === 'list') {
      fetchApps();
      const interval = setInterval(fetchApps, 3000);
      return () => clearInterval(interval);
    }
  }, [fetchApps, mode]);

  const handleRunApp = async (appId: number): Promise<boolean> => {
    return await appApi.runApp(appId);
  };

  const filteredApps = apps.filter(app => 
    app.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    app.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const cookingCount = apps.filter(a => a.status === 'generating').length;
  const activeCount = apps.filter(a => a.status === 'ready').length;

  // --- Create Logic ---
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleNext = () => {
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const idea = await appApi.generateAppIdea();
      setFormData({
        name: idea.name,
        description: idea.description,
        targetAudience: idea.targetAudience,
        goal: idea.goal,
      });
    } catch (error) {
      console.error('Failed to generate app idea:', error);
      alert('Failed to generate app idea. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: CreateAppPayload = {
      name: formData.name,
      description: formData.description,
      target_audience: formData.targetAudience,
      goal: formData.goal,
    };

    try {
        await appApi.createApp(payload);
        navigate('/');
    } catch (error) {
        console.error("Failed to create app:", error);
        alert("Failed to create app.");
    }
  };

  return {
    // List
    apps,
    filteredApps,
    searchTerm,
    setSearchTerm,
    cookingCount,
    activeCount,
    fetchApps,
    handleRunApp,

    // Create
    step,
    isGenerating,
    formData,
    handleChange,
    handleNext,
    handleBack,
    handleGenerate,
    handleSubmit
  };
}
