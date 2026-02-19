export interface App {
  id: number;
  name: string;
  description: string;
  target_audience: string;
  goal: string;
  status: 'generating' | 'ready' | 'error';
  created_at: string;
  updated_at: string;
}

export interface DiscoveryQuestion {
  id: string;
  question: string;
  placeholder: string;
}

export interface DiscoveryAnswer {
  id: string;
  question: string;
  answer: string;
}

export interface AppBriefRequest {
  projectIdea: string;
  answers: DiscoveryAnswer[];
}

export interface GeneratedAppBrief {
  name: string;
  description: string;
  targetAudience: string;
  goal: string;
  detailedRequirements: string;
}

export interface CreateAppPayload {
  name: string;
  description: string;
  target_audience: string;
  goal: string;
  detailed_requirements?: string;
  original_prompt?: string;
  discovery_answers?: DiscoveryAnswer[];
}
