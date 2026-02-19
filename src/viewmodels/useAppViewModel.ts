import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, CreateAppPayload, DiscoveryAnswer, DiscoveryQuestion } from '../../shared/types/app';
import { appApi } from '../api/app-api';

export type ViewModelMode = 'list' | 'create';

interface FormData {
  projectIdea: string;
  answers: Record<string, string>;
}

export function useAppViewModel(mode: ViewModelMode = 'list') {
  const navigate = useNavigate();

  // List State
  const [apps, setApps] = useState<App[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Create State
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [discoveryQuestions, setDiscoveryQuestions] = useState<DiscoveryQuestion[]>([]);
  const [formData, setFormData] = useState<FormData>({
    projectIdea: '',
    answers: {},
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

  const handleAnswerChange = (questionId: string, answer: string) => {
    setFormData((prev) => ({
      ...prev,
      answers: {
        ...prev.answers,
        [questionId]: answer
      }
    }));
  };

  const handleNext = async () => {
    if (step !== 1) {
      setStep(step + 1);
      return;
    }

    if (!formData.projectIdea.trim()) {
      return;
    }

    setIsGenerating(true);
    try {
      const questions = await appApi.generateAppDiscoveryQuestions(formData.projectIdea.trim());
      const nextAnswers = questions.reduce((acc, question) => {
        acc[question.id] = formData.answers[question.id] ?? '';
        return acc;
      }, {} as Record<string, string>);

      setDiscoveryQuestions(questions);
      setFormData((prev) => ({
        ...prev,
        answers: nextAnswers
      }));
      setStep(2);
    } catch (error) {
      console.error('Failed to generate discovery questions:', error);
      alert('Failed to generate follow-up questions. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const idea = await appApi.generateAppIdea();
      setFormData({
        projectIdea: `${idea.name}: ${idea.description}\nTarget audience: ${idea.targetAudience}\nMain goal: ${idea.goal}`,
        answers: {},
      });
      setStep(1);
      setDiscoveryQuestions([]);
    } catch (error) {
      console.error('Failed to generate app idea:', error);
      alert('Failed to generate app idea. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();

    const answers: DiscoveryAnswer[] = discoveryQuestions.map((question) => ({
      id: question.id,
      question: question.question,
      answer: (formData.answers[question.id] ?? '').trim(),
    }));

    const hasEmptyAnswers = answers.some((answer) => !answer.answer);
    if (hasEmptyAnswers) {
      alert('Please answer all follow-up questions so the app can be generated in detail.');
      return;
    }

    try {
      setIsGenerating(true);

      const brief = await appApi.generateAppBrief({
        projectIdea: formData.projectIdea.trim(),
        answers,
      });

      const payload: CreateAppPayload = {
        name: brief.name,
        description: brief.description,
        target_audience: brief.targetAudience,
        goal: brief.goal,
        detailed_requirements: brief.detailedRequirements,
        original_prompt: formData.projectIdea.trim(),
        discovery_answers: answers
      };

      await appApi.createApp(payload);
      navigate('/');
    } catch (error) {
      console.error('Failed to create app:', error);
      alert('Failed to create app.');
    } finally {
      setIsGenerating(false);
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
    discoveryQuestions,
    formData,
    handleChange,
    handleAnswerChange,
    handleNext,
    handleBack,
    handleGenerate,
    handleSubmit
  };
}
