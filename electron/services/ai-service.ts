import OpenAI from 'openai';
import { AppBriefRequest, DiscoveryQuestion, GeneratedAppBrief } from '../../shared/types/app';

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

const FALLBACK_DISCOVERY_QUESTIONS: DiscoveryQuestion[] = [
  {
    id: 'core_workflow',
    question: 'What are the top 2-3 user actions this app must support end-to-end?',
    placeholder: 'Example: create receipt, search receipt, export monthly report'
  },
  {
    id: 'key_data',
    question: 'What key data should each record store?',
    placeholder: 'Example: amount, merchant, date, category, tax, notes'
  },
  {
    id: 'output_requirements',
    question: 'What outputs or exports are required?',
    placeholder: 'Example: CSV and PDF exports, printable summary, JSON backup'
  },
  {
    id: 'constraints',
    question: 'Any hard constraints or preferences we must follow?',
    placeholder: 'Example: offline-first, no login, desktop-only, simple UI'
  }
];

function parseJsonResponse<T>(content: string): T {
  const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(cleanContent) as T;
  } catch {
    const firstBrace = cleanContent.indexOf('{');
    const lastBrace = cleanContent.lastIndexOf('}');
    const firstBracket = cleanContent.indexOf('[');
    const lastBracket = cleanContent.lastIndexOf(']');

    if (firstBracket !== -1 && lastBracket !== -1 && firstBracket < lastBracket) {
      return JSON.parse(cleanContent.slice(firstBracket, lastBracket + 1)) as T;
    }

    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      return JSON.parse(cleanContent.slice(firstBrace, lastBrace + 1)) as T;
    }

    throw new Error('Unable to parse AI JSON response');
  }
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
    return parseJsonResponse<GeneratedAppIdea>(content);
  } catch (error) {
    console.error('Failed to parse AI response:', content, error);
    throw new Error('Failed to parse AI response');
  }
}

export async function generateDiscoveryQuestions(projectIdea: string): Promise<DiscoveryQuestion[]> {
  const completion = await getOpenAI().chat.completions.create({
    model: 'arcee-ai/trinity-large-preview:free',
    messages: [
      {
        role: 'system',
        content: `You are a senior product discovery assistant.
Generate 5-7 highly relevant clarifying questions based on the user's app idea.
Questions must be contextual, concrete, and scoped to building a functional app.

Return ONLY a raw JSON array with this shape:
[
  {
    "id": "snake_case_id",
    "question": "Question text",
    "placeholder": "Helpful example answer for this exact question"
  }
]

Important:
- IDs must be unique and snake_case.
- Ask about workflows, key data, outputs, business rules, and edge cases.
- Keep each question short and specific.
- For a receipt app, ask things like export type, supported currencies, tax handling, and receipt categories.
- Do not include markdown.`
      },
      {
        role: 'user',
        content: `App idea: ${projectIdea}`
      }
    ]
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No content received from AI');
  }

  try {
    const parsed = parseJsonResponse<DiscoveryQuestion[]>(content);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return FALLBACK_DISCOVERY_QUESTIONS;
    }

    const normalized = parsed
      .map((item, index) => ({
        id: (item.id || `question_${index + 1}`).toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        question: item.question?.trim(),
        placeholder: item.placeholder?.trim() || 'Provide details...'
      }))
      .filter(item => item.question);

    return normalized.length > 0 ? normalized : FALLBACK_DISCOVERY_QUESTIONS;
  } catch (error) {
    console.error('Failed to parse discovery questions:', content, error);
    return FALLBACK_DISCOVERY_QUESTIONS;
  }
}

export async function generateAppBrief(payload: AppBriefRequest): Promise<GeneratedAppBrief> {
  const answersText = payload.answers
    .map((answer, index) => `${index + 1}. ${answer.question}\nAnswer: ${answer.answer}`)
    .join('\n\n');

  const completion = await getOpenAI().chat.completions.create({
    model: 'arcee-ai/trinity-large-preview:free',
    messages: [
      {
        role: 'system',
        content: `You are a senior product manager and software architect.
Create a detailed implementation brief for a desktop app generator.

Return ONLY a raw JSON object with:
- name: final app name
- description: 1-2 sentence product description
- targetAudience: comma-separated user groups
- goal: 1-2 sentence primary product goal
- detailedRequirements: a detailed, structured requirements block including:
  - core features
  - data model fields
  - workflows
  - exports/output formats
  - business rules and edge cases
  - UX expectations

Requirements:
- Be specific and implementation-oriented.
- Infer missing details logically from context.
- Keep it consistent with user answers.
- Do not include markdown code fences.`
      },
      {
        role: 'user',
        content: `Project idea:\n${payload.projectIdea}\n\nDiscovery answers:\n${answersText}`
      }
    ]
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No content received from AI');
  }

  try {
    const parsed = parseJsonResponse<GeneratedAppBrief>(content);
    if (!parsed.name || !parsed.description || !parsed.goal) {
      throw new Error('Incomplete app brief returned by AI');
    }
    return parsed;
  } catch (error) {
    console.error('Failed to parse app brief:', content, error);
    throw new Error('Failed to generate app brief');
  }
}
