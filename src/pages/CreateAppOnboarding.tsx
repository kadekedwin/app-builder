import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateAppPayload } from '../types';
import { generateAppIdea, API_KEY } from '../services/ai-service';

export default function CreateAppOnboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [formData, setFormData] = useState({
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

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const idea = await generateAppIdea();
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

    // @ts-ignore
    await window.ipcRenderer.invoke('create-app', payload, API_KEY);
    navigate('/');
  };

  return (
    <div className="onboarding-container">
      <div className="onboarding-card">
        {step === 1 && (
          <div className="step">
            <div className="header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Let's start with the basics</h2>
              <button 
                onClick={handleGenerate} 
                className="btn-secondary" 
                disabled={isGenerating}
                style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}
              >
                {isGenerating ? 'Generating...' : '✨ Generate with AI'}
              </button>
            </div>
            <div className="form-group">
              <label>What is the name of your app?</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Super Rick's Portal Gun"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Give a short description</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="What does it do?"
              />
            </div>
            <div className="actions">
              <button onClick={() => navigate('/')} className="btn-secondary">Cancel</button>
              <button onClick={handleNext} disabled={!formData.name} className="btn-primary">
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="step">
            <h2>Who is this for?</h2>
            <div className="form-group">
              <label>Target Audience</label>
              <input
                type="text"
                name="targetAudience"
                value={formData.targetAudience}
                onChange={handleChange}
                placeholder="e.g. Students, Travelers, Rick Sanchez"
                autoFocus
              />
            </div>
             <div className="actions">
              <button onClick={() => setStep(1)} className="btn-secondary">Back</button>
              <button onClick={handleNext} className="btn-primary">
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="step">
            <h2>What is the primary goal?</h2>
            <div className="form-group">
              <label>Main Objective</label>
               <textarea
                name="goal"
                value={formData.goal}
                onChange={handleChange}
                placeholder="e.g. To verify interdimensional travel..."
                autoFocus
              />
            </div>
             <div className="actions">
              <button onClick={() => setStep(2)} className="btn-secondary">Back</button>
              <button onClick={handleSubmit} className="btn-primary">
                Create App
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
