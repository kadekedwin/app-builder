import OpenAI from 'openai';

let openai: OpenAI | null = null;

function getOpenAI() {
  if (!openai) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.warn('OPENROUTER_API_KEY is not set in environment variables');
    }
    openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
    });
  }
  return openai;
}
export interface GeneratedAppIdea {
  name: string;
  description: string;
  targetAudience: string;
  goal: string;
}

export async function generateAppIdea(): Promise<GeneratedAppIdea> {
  const completion = await getOpenAI().chat.completions.create({
    model: 'arcee-ai/trinity-large-preview:free',
    messages: [
      {
        role: 'system',
        content: `You are a creative app idea generator. 
        Generate a unique, fun, and useful app idea.
        Return ONLY a raw JSON object with the following fields:
        - name: A catchy name for the app.
        - description: A short, compelling description (1-2 sentences).
        - targetAudience: Who is this app for?
        - goal: The primary problem this app solves or goal it achieves.
        
        Do not include markdown formatting (like \`\`\`json). Just the raw JSON string.`
      },
      {
        role: 'user',
        content: 'Generate a new app idea.'
      }
    ]
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No content received from AI');
  }

  try {
    // Clean up potential markdown code blocks if the model behaves poorly
    const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanContent);
  } catch (e) {
    console.error('Failed to parse AI response:', content);
    throw new Error('Failed to parse AI response');
  }
}
