
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { app } from 'electron';
import { updateAppStatus } from './db';

export async function generateProject(appId: number, appDetails: any, apiKey: string) {
  const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: apiKey,
  });

  const appPath = path.join(app.getPath('userData'), 'apps', appId.toString());
  
  // Ensure directory exists
  if (!fs.existsSync(appPath)) {
    fs.mkdirSync(appPath, { recursive: true });
  }

  const prompt = `
    You are an expert Electron.js developer.
    Generate a simple, functional Electron application based on this description:
    "${appDetails.description}"
    Goal: "${appDetails.goal}"
    Target Audience: "${appDetails.targetAudience}"
    
    You need to generate the following files:
    1. package.json (name should be the sanitized app name, main: "main.js")
    2. main.js (basic electron main process)
    3. index.html (beautiful, modern UI, dark mode, using the description)
    4. renderer.js (logic for the index.html)
    
    Return ONLY a raw JSON object where keys are filenames and values are the file content.
    Example:
    {
      "package.json": "...",
      "main.js": "..."
    }
    
    Do not include markdown formatting.
  `;

  try {
    console.log(`Generating project for app ${appId} using model: arcee-ai/trinity-large-preview:free`);
    
    // Validate API Key
    if (!apiKey) {
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
    updateAppStatus(appId, 'ready');

  } catch (error) {
    console.error('Failed to generate project files:', error);
    // Don't fail the whole request, just log it. The DB record is already created.
    updateAppStatus(appId, 'error');
  }
}
