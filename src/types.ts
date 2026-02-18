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

export interface CreateAppPayload {
  name: string;
  description: string;
  target_audience: string;
  goal: string;
}
