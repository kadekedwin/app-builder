import { useNavigate } from 'react-router-dom';
import { useAppViewModel } from '../viewmodels/useAppViewModel';

export default function CreateAppOnboarding() {
  const navigate = useNavigate();
  const {
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
  } = useAppViewModel('create');

  return (
    <div className="onboarding-container">
      <div className="onboarding-card">
        {step === 1 && (
          <div className="step">
            <div className="header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>What project do you want to create?</h2>
              <button 
                onClick={handleGenerate} 
                className="btn-secondary" 
                disabled={isGenerating}
                style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}
              >
                {isGenerating ? 'Generating...' : '✨ Suggest Idea'}
              </button>
            </div>
            <div className="form-group">
              <label>Describe the app you want</label>
              <textarea
                name="projectIdea"
                value={formData.projectIdea}
                onChange={handleChange}
                placeholder="Example: I want a receipt management app for freelancers with search, analytics, tax tracking, and export options."
                autoFocus
              />
            </div>
            <div className="actions">
              <button onClick={() => navigate('/')} className="btn-secondary">Cancel</button>
              <button onClick={handleNext} disabled={!formData.projectIdea.trim() || isGenerating} className="btn-primary">
                {isGenerating ? 'Preparing Questions...' : 'Next'}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="step">
            <h2>Answer context-aware questions</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              These questions are generated from your project idea so the AI can build a detailed and specific app.
            </p>

            {discoveryQuestions.map((question) => (
              <div className="form-group" key={question.id}>
                <label>{question.question}</label>
                <textarea
                  value={formData.answers[question.id] ?? ''}
                  onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                  placeholder={question.placeholder}
                  autoFocus={question.id === discoveryQuestions[0]?.id}
                />
              </div>
            ))}

            <div className="actions">
              <button onClick={handleBack} className="btn-secondary" disabled={isGenerating}>Back</button>
              <button onClick={handleSubmit} className="btn-primary" disabled={isGenerating}>
                {isGenerating ? 'Creating App...' : 'Create App'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
