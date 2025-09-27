import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import fileUpload from 'express-fileupload';
// NOTE: Import the library implementation directly to avoid index.js debug path in ESM which tries to read a test PDF.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import fs from 'fs';

// Firebase Client SDK (web) used on the server per simplified architecture
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  doc,
  deleteDoc,
} from 'firebase/firestore';

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = 3001;

// Limit for including extracted document text in prompts (characters)
const DOC_TEXT_CHAR_LIMIT = parseInt(process.env.DOC_TEXT_CHAR_LIMIT || '15000', 10);

// Preferred Gemini model (override via .env GEMINI_MODEL). Using "-latest" avoids 404 on retired versions.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

// Temp directory for buffering uploads (prevents memory spikes on large DOCX)
const TEMP_DIR = './.tmp';
try {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
} catch (e) {
  console.warn('[warn] Could not ensure temp dir exists:', e);
}

/**
 * Condense large text to fit within model prompt limits while keeping context.
 * Keeps the beginning and the end where most form headers and signature sections live.
 */
function condenseText(input, limit = DOC_TEXT_CHAR_LIMIT) {
  if (!input || input.length <= limit) return input || '';
  const head = Math.floor(limit * 0.75);
  const tail = limit - head - 64; // reserve for ellipsis marker
  const start = input.slice(0, head);
  const end = input.slice(-Math.max(tail, 0));
  return `${start}\n\n...[omitted ${input.length - (head + Math.max(tail, 0))} chars]...\n\n${end}`;
}

app.use(cors());
// Increase JSON body limit to handle base64 images safely (adjust as needed)
app.use(express.json({ limit: '10mb' }));
// Enable multipart handling for file uploads (TXT, PDF, DOCX)
app.use(
  fileUpload({
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
    abortOnLimit: false, // don't hard-abort; allow a proper 413 or downstream handling
    useTempFiles: true,
    tempFileDir: TEMP_DIR,
    createParentPath: false,
  })
);

// Check for API Key
if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is not defined. Please check your .env file.');
}

// Initialize the Google AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Initialize Firebase Client SDK on server using Vite-style keys from .env
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID,
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// The API endpoint
app.post('/generate-form', async (req, res) => {
  console.log(`[POST] /generate-form received with prompt: "${req.body.prompt}"`);

  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const masterPrompt = `
      You are an expert web form generator. Your sole purpose is to take a user's request and return a valid JSON object that represents a web form.
      Do not include any conversational text, explanations, or markdown formatting like \`\`\`json. Only return the raw JSON object.

      The JSON structure must be:
      {
        "title": "A String for the Form Title",
        "description": "An optional string for the form's introduction.",
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
      - If the user asks for an "Age Range", you MUST use the "text" field type (not "range" or any other).
      - 'options': This key MUST be included for types "radio", "checkbox", and "select". It MUST be omitted for all other types (including "radioGrid").
      - 'radioGrid' structure: Use when the question is a matrix/grid. Include:
        - "rows": an array of strings for each row's question/label.
        - "columns": an array of strings for each column choice (e.g., "Very Satisfied", "Satisfied", ...).
        - "label": the main title of the grid.
      - 'submit': Ensure there is exactly one field with type "submit".
      - If the user's request implies a longer introduction or context, include a helpful summary in the "description" field.
      
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
  const { image, mimeType, context } = req.body ?? {};
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
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const extraVisionContext =
      typeof context === 'string' && context.trim().length
        ? `
Additional user instructions (context): "${context.trim()}". Use these instructions to transform the extracted form as requested.`
        : '';

    const visionPrompt = `
      You are an expert web form generator. Analyze the provided image of a form
      and return a valid JSON object that represents that form. Do not include any
      conversational text, explanations, or markdown formatting like \`\`\`json.
      Only return the raw JSON object.
 
      The JSON structure must be:
      {
        "title": "A String for the Form Title",
        "description": "An optional string for the form's introduction.",
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
      - If the user asks for an "Age Range", you MUST use the "text" field type (not "range" or any other).
      - 'options': This key MUST be included for types "radio", "checkbox", and "select". It MUST be omitted for all other types (including "radioGrid").
      - 'radioGrid' structure: Use when the question is a matrix/grid. Include:
        - "rows": an array of strings for each row's question/label.
        - "columns": an array of strings for each column choice (e.g., "Very Satisfied", "Satisfied", ...).
        - "label": the main title of the grid.
      - 'submit': Ensure there is exactly one field with type "submit".
      - If the user's request implies a longer introduction or context, include a helpful summary in the "description" field.
      ${extraVisionContext}
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
    // Read buffer from memory or temp file (when useTempFiles is enabled)
    let buf = uploaded.data;
    // When useTempFiles=true, "data" may be an empty Buffer. Fallback to reading the temp file.
    if (!buf || buf.length === 0) {
      if (uploaded.tempFilePath) {
        try {
          buf = await fs.promises.readFile(uploaded.tempFilePath);
        } catch (e) {
          console.warn('[DOCX] Failed reading temp file:', uploaded.tempFilePath, e);
          buf = Buffer.alloc(0);
        }
      }
    }
    if (!buf || buf.length === 0) {
      return res.status(400).json({
        error: 'Uploaded file content is empty.',
        message: 'The server received a zero-length file buffer. Please re-upload the file or re-save it as DOCX and try again.',
        received: { name, mime, size: uploaded.size },
      });
    }

    let extractedText = '';
    const lowerName = name.toLowerCase();
    const userContext = String(req.body?.prompt ?? req.body?.context ?? '').trim();

    if (mime.startsWith('text/') || lowerName.endsWith('.txt')) {
      extractedText = buf.toString('utf-8');
    } else if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) {
      const parsed = await pdfParse(buf);
      extractedText = parsed.text || '';
    } else if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerName.endsWith('.docx')
    ) {
      try {
        // Prefer reading directly from the temp file path to avoid zero-length buffers
        if (uploaded.tempFilePath && uploaded.tempFilePath.length > 0) {
          const result = await mammoth.extractRawText({ path: uploaded.tempFilePath });
          extractedText = result.value || '';
        } else {
          const result = await mammoth.extractRawText({ buffer: buf });
          extractedText = result.value || '';
        }
      } catch (e) {
        console.error('[DOCX PARSE ERROR]', e);
        return res.status(400).json({
          error: 'Failed to read DOCX file.',
          message: 'The DOCX appears corrupted or unreadable. Please re-save it as .docx in Word/Google Docs and try again.',
          details: String(e?.message || e),
        });
      } finally {
        if (uploaded.tempFilePath) {
          // Best-effort cleanup to avoid temp file buildup
          fs.promises.unlink(uploaded.tempFilePath).catch(() => {});
        }
      }
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

    // Condense overly long text to avoid upstream provider errors (e.g., input too long)
    const beforeLen = extractedText.length;
    if (beforeLen > DOC_TEXT_CHAR_LIMIT) {
      console.warn(`[DOC] Extracted text length ${beforeLen} exceeds limit ${DOC_TEXT_CHAR_LIMIT}. Condensing for prompt.`);
      extractedText = condenseText(extractedText, DOC_TEXT_CHAR_LIMIT);
    }

    // Use the same structure and rules as the text endpoint (with radioGrid support)
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const contextBlock = userContext
      ? `
Additional user instructions (context): "${userContext}"
`
      : '';

    const masterPrompt = `
      You are an expert web form generator. Your sole purpose is to analyze the provided document content and return a valid JSON object that represents a web form. Use any additional context, if provided, to transform the document accordingly.
      Do not include any conversational text, explanations, or markdown formatting like \`\`\`json. Only return the raw JSON object.
 
      The JSON structure must be:
      {
        "title": "A String for the Form Title",
        "description": "An optional string for the form's introduction.",
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
      - If the user asks for an "Age Range", you MUST use the "text" field type (not "range" or any other).
      - 'options': This key MUST be included for types "radio", "checkbox", and "select". It MUST be omitted for all other types (including "radioGrid").
      - 'radioGrid' structure: Use when the question is a matrix/grid. Include:
        - "rows": an array of strings for each row's question/label.
        - "columns": an array of strings for each column choice (e.g., "Very Satisfied", "Satisfied", ...).
        - "label": the main title of the grid.
      - 'submit': Ensure there is exactly one field with type "submit".
      - If the user's request implies a longer introduction or context, include a helpful summary in the "description" field.
      
      ${contextBlock}
      Document content to analyze and transform:
      """${extractedText}"""
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

/**
 * Public responses endpoint using Firebase Client SDK:
 *   Stores submissions under forms/{formId}/responses/{autoId}
 */
app.post('/submit-response/:formId', async (req, res) => {
  const { formId } = req.params;
  if (!formId || typeof formId !== 'string') {
    return res.status(400).json({ error: 'Invalid formId' });
  }

  try {
    const payload = req.body ?? {};
    const ip =
      (req.headers['x-forwarded-for']?.toString().split(',')[0] || '').trim() ||
      req.socket?.remoteAddress ||
      null;

    const ref = await addDoc(collection(db, 'forms', formId, 'responses'), {
      payload,
      createdAt: serverTimestamp(),
      userAgent: req.get('user-agent') || null,
      ip,
    });

    return res.status(201).json({ ok: true, id: ref.id });
  } catch (e) {
    console.error('[submit-response] Failed to save response:', e);
    return res.status(500).json({
      error: 'Failed to save response',
      message: e?.message || 'Unknown error',
    });
  }
});

/**
 * Delete a form document using Firebase Client SDK:
 *   DELETE /forms/:formId
 */
app.delete('/forms/:formId', async (req, res) => {
  const { formId } = req.params;
  if (!formId || typeof formId !== 'string') {
    return res.status(400).json({ error: 'Invalid formId' });
  }

  try {
    await deleteDoc(doc(db, 'forms', formId));
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[delete-form] Failed to delete form:', e);
    return res.status(500).json({
      error: 'Failed to delete form',
      message: e?.message || 'Unknown error',
    });
  }
});

app.listen(port, () => {
  console.log(`[startup] Server listening on port ${port}`);
});