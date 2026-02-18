import { useNavigate } from 'react-router-dom';
import { useCreateAppViewModel } from '../viewmodels/useCreateAppViewModel';

export default function CreateAppOnboarding() {
  const navigate = useNavigate();
  const {
    step,
    isGenerating,
    formData,
    handleChange,
    handleNext,
    handleBack,
    handleGenerate,
    handleSubmit
  } = useCreateAppViewModel();

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
              <button onClick={handleBack} className="btn-secondary">Back</button>
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
              <button onClick={handleBack} className="btn-secondary">Back</button>
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
