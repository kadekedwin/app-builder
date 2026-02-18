import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateAppPayload } from '../../shared/types';
import { electronApi } from '../api/electron-api';

interface FormData {
  name: string;
  description: string;
  targetAudience: string;
  goal: string;
}

export function useCreateAppViewModel() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    targetAudience: '',
    goal: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleNext = () => {
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  }

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const idea = await electronApi.generateAppIdea();
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
        await electronApi.createApp(payload);
        navigate('/');
    } catch (error) {
        console.error("Failed to create app:", error);
        alert("Failed to create app.");
    }
  };

  return {
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
