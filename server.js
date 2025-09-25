import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import fileUpload from 'express-fileupload';
// NOTE: Import the library implementation directly to avoid index.js debug path in ESM which tries to read a test PDF.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';

 // Load environment variables from .env file (point to the frontend .env location)
dotenv.config();

const app = express();
const port = 3001;

app.use(cors());
// Increase JSON body limit to handle base64 images safely (adjust as needed)
app.use(express.json({ limit: '10mb' }));
// Enable multipart handling for file uploads (TXT, PDF, DOCX)
app.use(
  fileUpload({
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    abortOnLimit: true,
    createParentPath: false,
  })
);

// Check for API Key
if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not defined. Please check your .env file.");
}

// Initialize the Google AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// The API endpoint
app.post('/generate-form', async (req, res) => {
  console.log(`[POST] /generate-form received with prompt: "${req.body.prompt}"`);

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' }
    });

    const masterPrompt = `
      You are an expert web form generator. Your sole purpose is to take a user's request and return a valid JSON object that represents a web form.
      Do not include any conversational text, explanations, or markdown formatting like \`\`\`json. Only return the raw JSON object.

      The JSON structure must be:
      {
        "title": "A String for the Form Title",
        "fields": [
          {
            "label": "Field Label",
            "type": "text | email | password | textarea | radio | checkbox | select | date | time | file | range | radioGrid | submit",
            "name": "lowercase_field_label_with_underscores",
            "options": ["Option 1", "Option 2"],
            "rows": ["Row 1", "Row 2"],       // only for radioGrid
            "columns": ["Col A", "Col B"]     // only for radioGrid
          }
        ]
      }
      
      Follow these critical rules:
      - 'type': Use the most appropriate type based on the user's request.
        - For short text: "text"
        - For passwords: "password"
        - For long text/paragraphs: "textarea"
        - For single-choice from a list (like size or crust): "radio"
        - For multiple-choice from a list (like toppings): "checkbox"
        - For dropdown menus: "select"
        - For dates: "date"
        - For time: "time"
        - For file uploads: "file"
        - For linear scales or ratings: "range"
        - For questions presented in a grid/matrix where multiple rows share the same set of column choices: "radioGrid"
      - 'options': This key MUST be included for types "radio", "checkbox", and "select". It MUST be omitted for all other types (including "radioGrid").
      - 'radioGrid' structure: Use when the question is a matrix/grid. Include:
        - "rows": an array of strings for each row's question/label.
        - "columns": an array of strings for each column choice (e.g., "Very Satisfied", "Satisfied", ...).
        - "label": the main title of the grid.
      - 'submit': Ensure there is exactly one field with type "submit".
      
      User's request: "${req.body.prompt}"
    `;

    const result = await model.generateContent(masterPrompt);
    const response = await result.response;

    // 1) Safety handling: check if the prompt was blocked
    const promptFeedback = response?.promptFeedback;
    if (promptFeedback?.blockReason) {
      console.warn('[SAFETY] Prompt blocked by model:', promptFeedback.blockReason, promptFeedback);
      return res.status(400).json({
        error: 'Prompt rejected for safety reasons.',
        message: 'Your prompt was blocked by the safety system. Please modify the prompt and try again.',
        reason: promptFeedback.blockReason,
      });
    }

    // 2) Ensure non-empty text response before attempting to parse
    const text = (response?.text?.() ?? '').trim();
    if (!text) {
      console.error('[MODEL ERROR] Empty response from model.');
      return res.status(502).json({
        error: 'Upstream model returned an empty response.',
        message: 'The AI did not return any content. Please try again.',
      });
    }

    console.log('[AI RESPONSE - RAW TEXT]:', text);

    // Attempt to parse the JSON with robustness for occasional non-JSON wrappers
    let jsonResponse;
    try {
      jsonResponse = JSON.parse(text);
    } catch (e) {
      // Fallback: extract first {...} block if the model added prose or code fences
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        const slice = text.slice(start, end + 1);
        jsonResponse = JSON.parse(slice);
      } else {
        throw new Error('Model response was not valid JSON.');
      }
    }

    // Send the valid JSON back to the client
    console.log('[SUCCESS]: Sending valid JSON to client.');
    res.json(jsonResponse);

  } catch (error) {
    console.error('[CRITICAL SERVER ERROR]: An error occurred while processing the AI request.');
    console.error(error); // Log the full error object
    res.status(500).json({ error: 'Internal server error.', details: error.message });
  }
});

/**
 * Vision-based form generation endpoint
 * Expects:
 *  - image: Base64-encoded image data (no data: prefix)
 *  - mimeType: e.g., "image/png", "image/jpeg"
 */
app.post('/generate-form-from-image', async (req, res) => {
  const { image, mimeType } = req.body ?? {};
  console.log(`[POST] /generate-form-from-image (mimeType=${mimeType || 'n/a'})`);

  try {
    if (typeof image !== 'string' || image.length === 0) {
      return res.status(400).json({
        error: 'Invalid request: "image" must be a non-empty Base64 string.',
      });
    }
    if (typeof mimeType !== 'string' || !mimeType.startsWith('image/')) {
      return res.status(400).json({
        error: 'Invalid request: "mimeType" must be a valid image MIME type.',
      });
    }

    // Use a current vision-capable model (supports image inputs via inlineData)
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const visionPrompt = `
      You are an expert web form generator. Analyze the provided image of a form
      and return a valid JSON object that represents that form. Do not include any
      conversational text, explanations, or markdown formatting like \`\`\`json.
      Only return the raw JSON object.

      The JSON structure must be:
      {
        "title": "A String for the Form Title",
        "fields": [
          {
            "label": "Field Label",
            "type": "text | email | password | textarea | radio | checkbox | select | date | time | file | range | radioGrid | submit",
            "name": "lowercase_field_label_with_underscores",
            "options": ["Option 1", "Option 2"],
            "rows": ["Row 1", "Row 2"],       // only for radioGrid
            "columns": ["Col A", "Col B"]     // only for radioGrid
          }
        ]
      }

      Follow these critical rules:
      - 'type': Use the most appropriate type based on what is present in the image.
        - For short text: "text"
        - For passwords: "password"
        - For long text/paragraphs: "textarea"
        - For single-choice from a list (like size or crust): "radio"
        - For multiple-choice from a list (like toppings): "checkbox"
        - For dropdown menus: "select"
        - For dates: "date"
        - For time: "time"
        - For file uploads: "file"
        - For linear scales or ratings: "range"
        - For questions presented in a grid/matrix where multiple rows share the same set of column choices: "radioGrid"
      - 'options': This key MUST be included for types "radio", "checkbox", and "select". It MUST be omitted for all other types (including "radioGrid").
      - 'radioGrid' structure: Use when the question is a matrix/grid. Include:
        - "rows": an array of strings for each row's question/label.
        - "columns": an array of strings for each column choice (e.g., "Very Satisfied", "Satisfied", ...).
        - "label": the main title of the grid.
      - 'submit': Ensure there is exactly one field with type "submit".
    `;

    // Send text instructions + inline image
    const result = await model.generateContent([
      { text: visionPrompt },
      { inlineData: { mimeType, data: image } },
    ]);
    const response = await result.response;

    // Safety handling (blocked prompts or image content)
    const promptFeedback = response?.promptFeedback;
    if (promptFeedback?.blockReason) {
      console.warn('[SAFETY] Image prompt blocked by model:', promptFeedback.blockReason, promptFeedback);
      return res.status(400).json({
        error: 'Prompt rejected for safety reasons.',
        message: 'Your image or instructions were blocked by the safety system. Please modify and try again.',
        reason: promptFeedback.blockReason,
      });
    }

    // Ensure non-empty text response before attempting to parse
    const text = (response?.text?.() ?? '').trim();
    if (!text) {
      console.error('[MODEL ERROR] Empty response from vision model.');
      return res.status(502).json({
        error: 'Upstream model returned an empty response.',
        message: 'The AI did not return any content. Please try again.',
      });
    }

    console.log('[AI VISION RESPONSE - RAW TEXT]:', text);

    // Parse JSON robustly (handle occasional wrappers)
    let jsonResponse;
    try {
      jsonResponse = JSON.parse(text);
    } catch {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        const slice = text.slice(start, end + 1);
        jsonResponse = JSON.parse(slice);
      } else {
        throw new Error('Model response was not valid JSON.');
      }
    }

    console.log('[SUCCESS]: Sending vision JSON to client.');
    res.json(jsonResponse);
  } catch (error) {
    console.error('[CRITICAL SERVER ERROR - VISION]:', error);
    res.status(500).json({ error: 'Internal server error.', details: error.message });
  }
});

/**
 * Document-based form generation endpoint
 * Accepts: multipart/form-data with a 'file' field (TXT, PDF, DOCX)
 * Strategy:
 *   - Extract text from file using appropriate library
 *   - Feed extracted text into the same master prompt as text endpoint
 */
app.post('/generate-form-from-document', async (req, res) => {
  try {
    const files = req.files;
    const file = files?.file;
    if (!file || (Array.isArray(file) && file.length === 0)) {
      return res.status(400).json({ error: 'No file uploaded. Please provide a TXT, PDF, or DOCX file.' });
    }

    const uploaded = Array.isArray(file) ? file[0] : file;
    const mime = uploaded.mimetype || '';
    const name = uploaded.name || '';
    const buf = uploaded.data;

    let extractedText = '';
    const lowerName = name.toLowerCase();

    if (mime.startsWith('text/') || lowerName.endsWith('.txt')) {
      extractedText = buf.toString('utf-8');
    } else if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) {
      const parsed = await pdfParse(buf);
      extractedText = parsed.text || '';
    } else if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerName.endsWith('.docx')
    ) {
      const result = await mammoth.extractRawText({ buffer: buf });
      extractedText = result.value || '';
    } else {
      return res.status(400).json({
        error: 'Unsupported file type. Please upload a TXT, PDF, or DOCX file.',
        received: { name, mime },
      });
    }

    extractedText = (extractedText || '').trim();
    if (!extractedText) {
      return res.status(400).json({
        error: 'Unable to extract text from the uploaded document.',
        message: 'The file may be empty or unreadable.',
      });
    }

    // Use the same structure and rules as the text endpoint (with radioGrid support)
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const masterPrompt = `
      You are an expert web form generator. Your sole purpose is to take a user's request and return a valid JSON object that represents a web form.
      Do not include any conversational text, explanations, or markdown formatting like \`\`\`json. Only return the raw JSON object.

      The JSON structure must be:
      {
        "title": "A String for the Form Title",
        "fields": [
          {
            "label": "Field Label",
            "type": "text | email | password | textarea | radio | checkbox | select | date | time | file | range | radioGrid | submit",
            "name": "lowercase_field_label_with_underscores",
            "options": ["Option 1", "Option 2"],
            "rows": ["Row 1", "Row 2"],       // only for radioGrid
            "columns": ["Col A", "Col B"]     // only for radioGrid
          }
        ]
      }
      
      Follow these critical rules:
      - 'type': Use the most appropriate type based on the user's request or the provided content.
        - For short text: "text"
        - For passwords: "password"
        - For long text/paragraphs: "textarea"
        - For single-choice from a list (like size or crust): "radio"
        - For multiple-choice from a list (like toppings): "checkbox"
        - For dropdown menus: "select"
        - For dates: "date"
        - For time: "time"
        - For file uploads: "file"
        - For linear scales or ratings: "range"
        - For questions presented in a grid/matrix where multiple rows share the same set of column choices: "radioGrid"
      - 'options': This key MUST be included for types "radio", "checkbox", and "select". It MUST be omitted for all other types (including "radioGrid").
      - 'radioGrid' structure: Use when the question is a matrix/grid. Include:
        - "rows": an array of strings for each row's question/label.
        - "columns": an array of strings for each column choice (e.g., "Very Satisfied", "Satisfied", ...).
        - "label": the main title of the grid.
      - 'submit': Ensure there is exactly one field with type "submit".
      
      User's request: "${extractedText}"
    `;

    const result = await model.generateContent(masterPrompt);
    const response = await result.response;

    const promptFeedback = response?.promptFeedback;
    if (promptFeedback?.blockReason) {
      console.warn('[SAFETY] Document prompt blocked by model:', promptFeedback.blockReason, promptFeedback);
      return res.status(400).json({
        error: 'Prompt rejected for safety reasons.',
        message: 'Your document content was blocked by the safety system. Please modify and try again.',
        reason: promptFeedback.blockReason,
      });
    }

    const text = (response?.text?.() ?? '').trim();
    if (!text) {
      console.error('[MODEL ERROR] Empty response from document model.');
      return res.status(502).json({
        error: 'Upstream model returned an empty response.',
        message: 'The AI did not return any content. Please try again.',
      });
    }

    console.log('[AI DOCUMENT RESPONSE - RAW TEXT]:', text);

    let jsonResponse;
    try {
      jsonResponse = JSON.parse(text);
    } catch {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        const slice = text.slice(start, end + 1);
        jsonResponse = JSON.parse(slice);
      } else {
        throw new Error('Model response was not valid JSON.');
      }
    }

    console.log('[SUCCESS]: Sending document-derived JSON to client.');
    res.json(jsonResponse);
  } catch (error) {
    console.error('[CRITICAL SERVER ERROR - DOCUMENT]:', error);
    res.status(500).json({ error: 'Internal server error.', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`[startup] Server listening on port ${port}`);
});