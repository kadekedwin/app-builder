import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { app } from 'electron';
import { appRepository } from '../repositories/AppRepository';
import { CreateAppPayload } from '../../shared/types/app';

export async function generateProject(appId: number, appDetails: CreateAppPayload, apiKey?: string) {
  const effectiveApiKey = apiKey || process.env.OPENROUTER_API_KEY;
  const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: effectiveApiKey,
  });

  const appPath = path.join(app.getPath('userData'), 'apps', appId.toString());
  
  // Ensure directory exists
  if (!fs.existsSync(appPath)) {
    fs.mkdirSync(appPath, { recursive: true });
  }

  const discoveryAnswers = appDetails.discovery_answers
    ?.map((item, index) => `${index + 1}. ${item.question}\nAnswer: ${item.answer}`)
    .join('\n\n');

  const prompt = `
You are an expert Electron.js product engineer.
Generate a detailed, high-quality, fully functional desktop application.

App Name: "${appDetails.name}"
Product Description: "${appDetails.description}"
Primary Goal: "${appDetails.goal}"
Target Audience: "${appDetails.target_audience}"
Original User Idea: "${appDetails.original_prompt ?? ''}"
Detailed Requirements: "${appDetails.detailed_requirements ?? ''}"
Discovery Answers:
${discoveryAnswers || 'None provided'}

Implementation requirements:
1. Build a polished app that directly implements the requirements and business rules.
2. Include complete working flows, not placeholders.
3. Use clean HTML, CSS, and vanilla JS in renderer.
4. Support edge cases and input validation for critical user actions.
5. Keep data in memory unless persistence is needed by requirements.

Generate the following files at minimum:
1. package.json (name should be sanitized app name, main: "main.js")
2. main.js (electron main process)
3. index.html (structured and modern UI)
4. styles.css (clear, maintainable styling)
5. renderer.js (all application logic and interactions)

Return ONLY a raw JSON object where keys are filenames and values are file contents.
Do not include markdown formatting.
`;

  try {
    console.log(`Generating project for app ${appId} using model: arcee-ai/trinity-large-preview:free`);
    
    // Validate API Key
    if (!effectiveApiKey) {
      console.error('API Key is missing!');
      throw new Error('API Key is missing');
    }

    const completion = await openai.chat.completions.create({
      model: 'arcee-ai/trinity-large-preview:free',
      messages: [{ role: 'system', content: prompt }]
    });

    const content = completion.choices[0]?.message?.content;
    console.log('AI Response Content:', content);

    if (!content) throw new Error('No content from AI');

    const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
    console.log('Clean Content to Parse:', cleanContent);
    
    let files;
    try {
        files = JSON.parse(cleanContent);
    } catch (e) {
        console.error('JSON Parse Error:', e);
        // Try to leniently parse if it wrapped in something else?
        // For now, fail but log.
        // check if it is wrapped in markdown code block without json tag
        if (cleanContent.startsWith('{') || cleanContent.startsWith('[')) {
             // maybe safe?
        }
        throw e;
    }

    for (const [filename, fileContent] of Object.entries(files)) {
      fs.writeFileSync(path.join(appPath, filename), fileContent as string);
    }

    console.log(`Generated project for app ${appId} at ${appPath}`);
    appRepository.updateStatus(appId, 'ready');

  } catch (error) {
    console.error('Failed to generate project files:', error);
    // Don't fail the whole request, just log it. The DB record is already created.
    appRepository.updateStatus(appId, 'error');
  }
}
