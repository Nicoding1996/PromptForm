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
  getDoc,
  updateDoc,
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
// Max characters allowed when embedding JSON form/responses into the analysis prompt (override via env)
const ANALYZE_JSON_CHAR_LIMIT = parseInt(process.env.ANALYZE_JSON_CHAR_LIMIT || '20000', 10);

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

    // Prompt Enhancer: add guardrails for outcome-based quizzes/personality tests
    const addQuizGuardrails = (promptText) => {
      const keywords = ["personality test", "assessment", "what type of", "what kind of", "which are you", "disc", "enneagram", "mbti"];
      const lowerCasePrompt = String(promptText || "").toLowerCase();
      if (keywords.some((keyword) => lowerCasePrompt.includes(keyword))) {
        return `

---
CRITICAL INSTRUCTION: When you generate 'resultPages' with 'scoreRange', you MUST follow these rules:

All score ranges must be in ascending numerical order.
There must be no numerical gaps between the ranges.
There must be no numerical overlaps between the ranges.
Every possible score must map to exactly one outcome.
The from value of the very first score_range in the list MUST always be 0.
---`;
      }
      return "";
    };

    const masterPrompt = `
      You are an expert web form generator. Your sole purpose is to take a user's request and return a valid JSON object that represents a web form.
      Do not include any conversational text, explanations, or markdown formatting like \`\`\`json. Only return the raw JSON object.

      The JSON structure must be:
      {
        "title": "A String for the Form Title",
        "description": "An optional string for the form's introduction.",
        "isQuiz": false, // when applicable, set to true (see rules below)
        "fields": [
          {
            "label": "Field Label",
            "type": "text | email | password | textarea | radio | checkbox | select | date | time | file | range | radioGrid | section | submit",
            "name": "lowercase_field_label_with_underscores",
            "placeholder": "Optional placeholder text",
            "helperText": "Optional helper text below the field",
            "validation": {                      // optional; include when helpful
              "required": true,
              "minLength": 2,
              "maxLength": 50,
              "pattern": "email"                 // e.g., for email fields
            },
            "options": ["Option 1", "Option 2"],
            "rows": ["Row 1", "Row 2"],       // only for radioGrid
            "columns": [                      // only for radioGrid; per-column scoring objects
              { "label": "Col A", "points": 1 },
              { "label": "Col B", "points": 1 }
            ],
            "correctAnswer": "Option 1",      // when isQuiz is true and applicable (radio/checkbox/select)
            "points": 1                       // when isQuiz is true; default to 1 if not specified
          }
        ],
        // Optional for personality/typology assessments when isQuiz is true:
        // Each outcome page covers a score range; the client can edit these.
        "resultPages": [
          {
            "title": "Outcome A",
            "description": "A short description for this result.",
            "scoreRange": { "from": 0, "to": 0 }
          }
        ],
 
        // Adaptive Theming (required):
        // Name must be one of: Indigo | Slate | Rose | Amber | Emerald | Sky
        "theme_name": "Indigo",
        "theme_primary_color": "#6366F1",
        "theme_background_color": "#E0E7FF"
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
        - "columns": an array of objects for each column choice, each like { "label": "Very Satisfied", "points": 1 }.
          Default "points" to 1 when unspecified. Use these per-column points for per-row scoring in radioGrid.
        - "label": the main title of the grid.
      - 'section': This is a visual heading used to organize long or complex forms. It is NOT an input field.
        - Insert a field object before each thematic group: { "label": "Section Title", "type": "section", "name": "section_section_title" }
        - Do NOT include options/rows/columns/correctAnswer/points on a section.
        - Sections must not be counted for scoring even when "isQuiz": true.
      - 'submit': Ensure there is exactly one field with type "submit".
      - If the user's request implies a longer introduction or context, include a helpful summary in the "description" field.
 
      VALIDATION & UX RULES:
      - CRITICAL VALIDATION RULE: You MUST analyze the context of each field to determine if it is essential for the form's purpose.
        - If a field is objectively mandatory (e.g., Name, Email, Subject, Phone Number), you MUST set "validation": { "required": true }.
        - Do NOT make subjective, demographic, or convenience-only questions required unless the user's prompt explicitly instructs it.
        - For email fields, prefer type "email"; also set validation.pattern = "email".
        - For text-like fields, use "validation.minLength" and/or "validation.maxLength" when reasonable.
      - Add a helpful "placeholder" string for fields where an example would be useful.
      - Add a concise "helperText" when a field needs additional explanation.
      - The "name" for each field MUST be a unique snake_case identifier within the form. If duplicates would occur, append a numeric suffix (e.g., "_2", "_3").

      THEME RULES:
      - Based on the form's topic, suggest a theme using:
        [Indigo, Slate, Rose, Amber, Emerald, Sky].
      - For a business/professional form, prefer "Indigo" or "Slate".
      - For a fun/quiz/consumer form, prefer "Rose" or "Amber".
      - Output the following top-level keys (required):
        "theme_name" (one of the names above),
        "theme_primary_color" (hex),
        "theme_background_color" (hex, soft/pastel).
      - Use these canonical mappings unless context strongly suggests another:
        Indigo -> primary #6366F1, background #E0E7FF
        Slate  -> primary #475569, background #E2E8F0
        Rose   -> primary #F43F5E, background #FFE4E6
        Amber  -> primary #F59E0B, background #FEF3C7
        Emerald-> primary #10B981, background #D1FAE5
        Sky    -> primary #0EA5E9, background #E0F2FE

      QUIZ/ASSESSMENT RULES:
      - If the user's prompt contains keywords that imply a knowledge test—such as "quiz", "test", "exam", "true or false", or "knowledge check"—you MUST add a new top-level property "isQuiz": true on the main JSON object. Do NOT trigger quiz mode for generic workplace/self "assessment" or "evaluation" forms.
      - When "isQuiz" is true, you MUST do your best to analyze the prompt/context to identify the correct answer for option-based questions (types "radio", "checkbox", or "select"):
        - For "radio" or "select", set "correctAnswer" to the single correct option value if it can be identified.
        - For "checkbox", if multiple options are correct, set "correctAnswer" to an array of all correct option values (e.g., ["A","C"]). If only one is correct, you may still use a single string.
        - Always add a "points" key with value 1 on that field.
      - Only set "correctAnswer" on fields that actually have options (radio/checkbox/select). Do NOT add it for text-like or radioGrid fields.
      - CRITICAL REQUIREMENT FOR ALL QUIZZES/ASSESSMENTS: For any question that contributes to a score (i.e., fields with a "points" key or a "scoring" array), you MUST set "validation": { "required": true } so that submissions cannot omit scored items. For personality or opinion-based questions (e.g., Likert scales), you MUST also include a neutral or opt-out choice such as "Neutral", "I don't know", or "Not Applicable" to avoid forcing biased answers.
      PERSONALITY / OUTCOME-BASED ASSESSMENTS:
      - If the prompt implies a personality/typology outcome (e.g., contains phrases like "personality test", "assessment" with outcomes, "enneagram", "DISC", "MBTI", "what type of", "find out your", "which kind of"), you MUST:
        - Set "isQuiz": true.
        - Attempt to pre-populate a top-level "resultPages" array with 2–6 placeholder outcomes.
          Each object MUST include:
            {
              "title": "Result Name",
              "description": "Short description of this personality/result",
              "scoreRange": { "from": 0, "to": 0 }
            }
        - Provide reasonable placeholder score ranges that partition the total possible points, if inferable; otherwise set { "from": 0, "to": 0 } as placeholders.
      
      TRAIT-BASED SCORING RULES (for personality/outcome-based assessments):
      - Each object in "resultPages" MUST include a stable "outcomeId": a snake_case identifier (e.g., "outcome_analyst"). Keep this constant across edits.
      - For fields that contribute to outcomes, add a "scoring" array:
        - For "radio" | "select" | "checkbox": { "option": "Option Text", "points": 1, "outcomeId": "<existing outcomeId>" }
        - For "radioGrid": { "column": "Column Label", "points": 1, "outcomeId": "<existing outcomeId>" }
      - For trait scoring with "radioGrid", "columns" should be labels only (e.g., ["Rarely True","Sometimes True","Always True"]); do NOT embed "points" inside "columns".
      - Do NOT set "correctAnswer" for personality/outcome-based assessments; "correctAnswer" is only for knowledge quizzes.

      User's request: "${req.body.prompt}" ${addQuizGuardrails(req.body.prompt)}
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
// AI Assist: expand a partial question prompt into a single completed field JSON
app.post('/assist-question', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt ?? '').trim();
    if (!prompt) {
      return res.status(400).json({ error: 'Missing "prompt" in body.' });
    }

    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const masterPrompt = `
You are a form question expert. Take the user's partial prompt and expand it into a single, complete form field JSON object. Intelligently choose the best "type" and pre-populate "options" if applicable. Return ONLY a JSON object for one field, no prose.

Allowed keys and rules:
- Required: "label", "type", "name".
- Optional UX: "placeholder", "helperText".
- Optional "validation": { "required"?: boolean, "minLength"?: number, "maxLength"?: number, "pattern"?: "email" | string }.
- "type" must be one of: "text", "email", "password", "textarea", "radio", "checkbox", "select", "date", "time", "file", "range", "radioGrid".
- Do NOT return "section" or "submit".
- For "radio" | "checkbox" | "select": include "options": ["..."] with 2–6 sensible values.
- For "radioGrid": include "rows": ["..."] and "columns": [{ "label": "...", "points": 1 }, ...].
- For "range": include integer "min" and "max" if inferable (e.g., 1..5 or 0..10).
- Validation guidance:
  - If the field is clearly mandatory (e.g., Name, Email), set validation.required = true.
  - If type is "email", set validation.pattern = "email".
  - Add sensible minLength/maxLength for text/password/textarea when appropriate.
- Do not include "correctAnswer" unless the user's prompt clearly implies a knowledge quiz; otherwise omit quiz-specific fields.

Naming rule:
- Generate a URL-safe snake_case "name" from the label (lowercase, underscores, only [a-z0-9_]). Do not include spaces.

User prompt: "${prompt}"
    `;

    const result = await model.generateContent(masterPrompt);
    const response = await result.response;

    const promptFeedback = response?.promptFeedback;
    if (promptFeedback?.blockReason) {
      console.warn('[SAFETY] Assist prompt blocked:', promptFeedback.blockReason, promptFeedback);
      return res.status(400).json({
        error: 'Prompt rejected for safety reasons.',
        reason: promptFeedback.blockReason,
      });
    }

    const text = (response?.text?.() ?? '').trim();
    if (!text) {
      console.error('[assist-question] Empty model response.');
      return res.status(502).json({ error: 'Upstream model returned an empty response.' });
    }

    let fieldJson;
    try {
      fieldJson = JSON.parse(text);
    } catch {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        const slice = text.slice(start, end + 1);
        fieldJson = JSON.parse(slice);
      } else {
        throw new Error('Model response was not valid JSON.');
      }
    }

    return res.json(fieldJson);
  } catch (e) {
    console.error('[assist-question] error:', e);
    return res.status(500).json({
      error: 'Internal server error.',
      message: e?.message || 'Unknown error',
    });
  }
});
// AI Suggest Question endpoint (Universal + Unique)
// POST /suggest-question
// Body: { form: CompleteFormJson }
// Returns: Single field JSON adapted to quizType with strict anti-duplication
app.post('/suggest-question', async (req, res) => {
  try {
    const { form } = req.body ?? {};
    if (!form || typeof form !== 'object') {
      return res.status(400).json({ error: 'Invalid "form" object in request body.' });
    }

    // Determine quizType context
    const quizTypeRaw = String(form?.quizType || '').toUpperCase();
    const quizType = (quizTypeRaw === 'KNOWLEDGE' || quizTypeRaw === 'OUTCOME') ? quizTypeRaw : null;

    // Build existing labels/names for anti-duplication
    const fieldsArr = Array.isArray(form?.fields) ? form.fields : [];
    const existingLabels = fieldsArr.map((f) => String(f?.label ?? '')).filter((s) => s.trim().length > 0);
    const existingNames = fieldsArr.map((f) => String(f?.name ?? '')).filter((s) => s.trim().length > 0);
    const existingLabelsBlock = JSON.stringify(existingLabels, null, 2);
    const existingNamesBlock = JSON.stringify(existingNames, null, 2);

    // Compact/condense form JSON for prompt if very large
    const formStr = JSON.stringify(form, null, 2);
    const formBlock =
      formStr.length > ANALYZE_JSON_CHAR_LIMIT ? condenseText(formStr, ANALYZE_JSON_CHAR_LIMIT) : formStr;

    // Model
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: 'application/json' },
    });

    // Shared anti-duplication clause (applied to all quiz types)
    const ANTI_DUP_CLAUSE = `
CRITICAL UNIQUENESS REQUIREMENT:
- The new question you generate MUST be unique and not a duplicate or a simple rephrasing of any question already present in the form.
- Compare against the existing labels and names below and ensure conceptual novelty. Do not re-use or trivially reword them.
- Existing labels: ${existingLabelsBlock}
- Existing names: ${existingNamesBlock}
- The "name" you output MUST be a new, unique snake_case identifier not present in the existing names list.`;

    // Guardrails text for outcome-based assessments (kept consistent with generate-form)
    const OUTCOME_GUARDRAILS = `
---
CRITICAL INSTRUCTION: When you generate 'resultPages' with 'scoreRange', you MUST follow these rules:

All score ranges must be in ascending numerical order.
There must be no numerical gaps between the ranges.
There must be no numerical overlaps between the ranges.
Every possible score must map to exactly one outcome.
The from value of the very first score_range in the list MUST always be 0.
Each subsequent range's "from" MUST be exactly previous "to" + 1.
The final range's "to" MUST equal the total_possible_score (inclusive).
If total_possible_score is not explicitly provided, ESTIMATE it (assume ~1 point per gradable question) and partition ranges to exactly cover 0..total_possible_score without gaps/overlaps.
---`;

    let masterPrompt = '';

    if (quizType === 'OUTCOME') {
      // Build outcome catalog from resultPages with stable IDs
      const pages = Array.isArray(form?.resultPages) ? form.resultPages : [];
      const toSnake = (s) =>
        String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const outcomeCatalog = pages.map((p, i) => {
        const title = String(p?.title || `Outcome ${i + 1}`);
        const id = String(p?.id || p?.outcomeId || `outcome_${toSnake(title) || i + 1}`);
        return { id, title };
      });

      if (!outcomeCatalog.length) {
        return res.status(400).json({
          error: 'Form is missing "resultPages" with outcomes. Cannot map scoring to outcomes.',
        });
      }

      const catalogBlock = JSON.stringify(outcomeCatalog, null, 2);

      masterPrompt = `
You are an expert psychometrician. Based on the provided form's existing questions and outcomes (JSON), generate ONE new, relevant question that fits the assessment's theme.
Your response must be a single, valid JSON object for the new form field. This object MUST include the new, detailed "scoring" array, correctly mapping the new question's answers to the existing outcome IDs.

${ANTI_DUP_CLAUSE}

Rules:
- Allowed field "type": "radio", "checkbox", "select", or "radioGrid". Prefer "radio" or "radioGrid" for trait assessments.
- Required keys: "label", "type", "name".
- For "radio" | "checkbox" | "select": include "options": ["..."] with 2–6 sensible values.
- For "radioGrid": include:
  - "rows": ["Row 1", "Row 2", ...]
  - "columns": ["Rarely True", "Sometimes True", "Always True"]   // labels only; do NOT include points here
- The field MUST include "scoring": an array of objects mapping specific answers to points for specific outcomes:
  - For radio/select/checkbox: { "option": "Option Text", "points": 1, "outcomeId": "<one-of-existing-outcome-ids>" }
  - For radioGrid (applies per-row selection): { "column": "Column Label", "points": 1, "outcomeId": "<one-of-existing-outcome-ids>" }
- Use ONLY these existing outcome IDs exactly as provided (do not invent new IDs):
${catalogBlock}
- Do not include "section" or "submit" types.
- Do not include "correctAnswer" for this task.
- Do NOT include any surrounding prose or markdown. Output only the JSON object.

Existing form (for context):
"""${formBlock}"""

${OUTCOME_GUARDRAILS}
`;
    } else if (quizType === 'KNOWLEDGE') {
      // Knowledge quiz: SME prompt that outputs a single option-based question with correctAnswer
      masterPrompt = `
 You are a subject matter expert creating a knowledge-check question that complements the existing quiz.
 Generate ONE new option-based question aligned with the form's topic.
 
 ${ANTI_DUP_CLAUSE}
 
 CRITICAL REQUIREMENT: You MUST determine the correct answer for the question you generate. Your final JSON output MUST include a correctAnswer key with the correct option's text, and a points key with a value of 1.
 
 Output ONLY a single field JSON object with:
 - Required: "label", "type", "name"
 - Allowed "type": "radio", "checkbox", or "select" (choose the best fit)
 - Include "options": ["..."] with 3–6 plausible answers
 - MUST include "correctAnswer":
   - For "radio" or "select": a single string exactly matching one of the options
   - For "checkbox": an array of one or more strings, each exactly matching options
 - Include "points": 1
 - Do NOT include "scoring" or "resultPages"
 - Do NOT include "section" or "submit"
 - Do NOT include any surrounding prose or markdown. Output only the JSON object.
 
 Existing form (for context):
 """${formBlock}"""
 `;
    } else {
      // Normal forms: form design expert prompt (no scoring/correctAnswer)
      masterPrompt = `
You are a form design expert. Propose ONE new, relevant, non-duplicate question that improves this form.

${ANTI_DUP_CLAUSE}

CRITICAL RULE: This is a standard feedback form, NOT a quiz. Your JSON response for the new field MUST NOT include the isQuiz, correctAnswer, points, or scoring keys. Generate a simple, non-scored question field.Output ONLY a single field JSON object with:
- Required: "label", "type", "name"
- "type" may be one of: "text", "email", "password", "textarea", "radio", "checkbox", "select", "date", "time", "file", "range", "radioGrid"
- For "radio" | "checkbox" | "select": include "options": ["..."] (2–6 values)
- For "radioGrid": include "rows": ["..."] and "columns": ["..."] (labels only; do not include points)
- Do NOT include "correctAnswer" or "scoring"
- Do NOT include "section" or "submit"
- Do NOT include any surrounding prose or markdown. Output only the JSON object.

Existing form (for context):
"""${formBlock}"""
`;
    }

    const result = await model.generateContent(masterPrompt);
    const response = await result.response;

    // Safety handling
    const promptFeedback = response?.promptFeedback;
    if (promptFeedback?.blockReason) {
      console.warn('[SAFETY] suggest-question prompt blocked:', promptFeedback.blockReason, promptFeedback);
      return res.status(400).json({
        error: 'Prompt rejected for safety reasons.',
        reason: promptFeedback.blockReason,
      });
    }

    const text = (response?.text?.() ?? '').trim();
    if (!text) {
      console.error('[suggest-question] Empty model response.');
      return res.status(502).json({ error: 'Upstream model returned an empty response.' });
    }

    let fieldJson;
    try {
      fieldJson = JSON.parse(text);
    } catch {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        const slice = text.slice(start, end + 1);
        fieldJson = JSON.parse(slice);
      } else {
        throw new Error('Model response was not valid JSON.');
      }
    }

    // Hard guardrails: sanitize quiz-only keys for normal (non-quiz) forms
    if (!quizType) {
      if (fieldJson && typeof fieldJson === 'object') {
        // Remove any quiz/scoring related keys the model might have hallucinated
        delete fieldJson.correctAnswer;
        delete fieldJson.points;
        if (Array.isArray(fieldJson.scoring)) delete fieldJson.scoring;
        delete fieldJson.isQuiz;

        // Normalize radioGrid: ensure columns are labels only (strip objects/points)
        const t = String(fieldJson?.type || '').toLowerCase();
        if (t === 'radiogrid' && Array.isArray(fieldJson.columns)) {
          fieldJson.columns = fieldJson.columns
            .map((c) => (typeof c === 'string' ? c : (c && typeof c.label === 'string' ? c.label : '')))
            .filter((s) => typeof s === 'string' && s.length > 0);
        }

        // Normalize options to plain strings if objects were returned
        if (Array.isArray(fieldJson.options)) {
          fieldJson.options = fieldJson.options
            .map((o) => (typeof o === 'string' ? o : (o && typeof o.label === 'string' ? o.label : '')))
            .filter((s) => typeof s === 'string' && s.length > 0);
        }
      }
    }

    return res.json(fieldJson);
  } catch (e) {
    console.error('[suggest-question] error:', e);
    return res.status(500).json({
      error: 'Internal server error.',
      message: e?.message || 'Unknown error',
    });
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
        "isQuiz": false,
        "fields": [
          {
            "label": "Field Label",
            "type": "text | email | password | textarea | radio | checkbox | select | date | time | file | range | radioGrid | section | submit",
            "name": "lowercase_field_label_with_underscores",
            "placeholder": "Optional placeholder text",
            "helperText": "Optional helper text below the field",
            "validation": {                      // optional; include when helpful
              "required": true,
              "minLength": 2,
              "maxLength": 50,
              "pattern": "email"                 // e.g., for email fields
            },
            "options": ["Option 1", "Option 2"],
            "rows": ["Row 1", "Row 2"],       // only for radioGrid
            "columns": [                      // only for radioGrid; per-column scoring objects
              { "label": "Col A", "points": 1 },
              { "label": "Col B", "points": 1 }
            ],
            "correctAnswer": "Option 1",      // when isQuiz is true and applicable
            "points": 1
          }
        ],
        "resultPages": [
          { "title": "Outcome A", "description": "Result description", "scoreRange": { "from": 0, "to": 0 } }
        ],
 
        // Adaptive Theming (required):
        "theme_name": "Indigo",
        "theme_primary_color": "#6366F1",
        "theme_background_color": "#E0E7FF"
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
        - "columns": an array of objects for each column choice, each like { "label": "Very Satisfied", "points": 1 }.
          Default "points" to 1 when unspecified. Use these per-column points for per-row scoring in radioGrid.
        - "label": the main title of the grid.
      - 'section': This is a visual heading used to organize long or complex forms. It is NOT an input field.
        - Insert a field object before each thematic group: { "label": "Section Title", "type": "section", "name": "section_section_title" }
        - Do NOT include options/rows/columns/correctAnswer/points on a section.
        - Sections must not be counted for scoring even when "isQuiz": true.
      - 'submit': Ensure there is exactly one field with type "submit".
      - If the user's request implies a longer introduction or context, include a helpful summary in the "description" field.
 
      VALIDATION & UX RULES:
      - CRITICAL VALIDATION RULE: You MUST analyze the context of each field to determine if it is essential for the form's purpose.
        - If a field is objectively mandatory (e.g., Name, Email, Subject, Phone Number), you MUST set "validation": { "required": true }.
        - Do NOT make subjective, demographic, or convenience-only questions required unless the user's context explicitly instructs it.
        - For email fields, prefer type "email"; also set validation.pattern = "email".
        - For text-like fields, use "validation.minLength" and/or "validation.maxLength" when reasonable.
      - Add a helpful "placeholder" string for fields where an example would be useful.
      - Add a concise "helperText" when a field needs additional explanation.
      - The "name" for each field MUST be a unique snake_case identifier within the form. If duplicates would occur, append a numeric suffix (e.g., "_2", "_3").

      THEME RULES:
      - Based on the form's topic/context, choose a theme from [Indigo, Slate, Rose, Amber, Emerald, Sky].
      - Prefer Indigo/Slate for business/professional; Rose/Amber for fun/quiz.
      - Output top-level keys: "theme_name", "theme_primary_color", "theme_background_color".
      - Canonical mappings:
        Indigo -> #6366F1 / #E0E7FF
        Slate  -> #475569 / #E2E8F0
        Rose   -> #F43F5E / #FFE4E6
        Amber  -> #F59E0B / #FEF3C7
        Emerald-> #10B981 / #D1FAE5
        Sky    -> #0EA5E9 / #E0F2FE

      QUIZ/ASSESSMENT RULES:
      - If the user's prompt or the image/context contains keywords that imply a knowledge test—such as "quiz", "test", "exam", "true or false", or "knowledge check"—you MUST add a new top-level property "isQuiz": true on the main JSON object. Do NOT trigger quiz mode for generic workplace/self "assessment" or "evaluation" forms.
      - When "isQuiz" is true, you MUST do your best to analyze the image/context to identify the correct answer for option-based questions (types "radio", "checkbox", or "select"):
        - For "radio" or "select", set "correctAnswer" to the single correct option value if it can be identified.
        - For "checkbox", if multiple options are correct, set "correctAnswer" to an array of all correct option values (e.g., ["A","C"]). If only one is correct, you may still use a single string.
        - Always add a "points" key with value 1 on that field.
      - Only set "correctAnswer" on fields that actually have options (radio/checkbox/select). Do NOT add it for text-like or radioGrid fields.
      - CRITICAL REQUIREMENT FOR ALL QUIZZES/ASSESSMENTS: For any question that contributes to a score (i.e., fields with a "points" key or a "scoring" array), you MUST set "validation": { "required": true } so that submissions cannot omit scored items. For personality or opinion-based questions (e.g., Likert scales), you MUST also include a neutral or opt-out choice such as "Neutral", "I don't know", or "Not Applicable" to avoid forcing biased answers.

      CRITICAL OUTCOME RANGE RULE:
      - When generating outcomes with scoreRange, ranges MUST be contiguous and non-overlapping, starting at 0 and ending at total_possible_score (inclusive).
      - Each next range.from MUST equal previous range.to + 1.
      - If total_possible_score is not explicit, estimate 1 point per gradable question and set ranges to exactly cover 0..total_possible_score.
      
      PERSONALITY / OUTCOME-BASED ASSESSMENTS:
      - If the image/context implies a personality/typology outcome (e.g., "personality test", "enneagram", "DISC", "MBTI", "what type of", "find out your"), you MUST set "isQuiz": true and attempt to include a "resultPages" array with 2–6 placeholder objects, each with { "title", "description", "scoreRange": { "from": 0, "to": 0 } }.

     TRAIT-BASED SCORING RULES (for personality/outcome-based assessments):
     - Each object in "resultPages" MUST include a stable "outcomeId": a snake_case identifier (e.g., "outcome_analyst"). Keep this constant across edits.
     - For fields that contribute to outcomes, add a "scoring" array:
       - For "radio" | "select" | "checkbox": { "option": "Option Text", "points": 1, "outcomeId": "<existing outcomeId>" }
       - For "radioGrid": { "column": "Column Label", "points": 1, "outcomeId": "<existing outcomeId>" }
     - For trait scoring with "radioGrid", "columns" should be labels only (e.g., ["Rarely True","Sometimes True","Always True"]); do NOT embed "points" inside "columns".
     - Do NOT set "correctAnswer" for personality/outcome-based assessments; "correctAnswer" is only for knowledge quizzes.

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
        "isQuiz": false,
        "fields": [
          {
            "label": "Field Label",
            "type": "text | email | password | textarea | radio | checkbox | select | date | time | file | range | radioGrid | section | submit",
            "name": "lowercase_field_label_with_underscores",
            "placeholder": "Optional placeholder text",
            "helperText": "Optional helper text below the field",
            "validation": {                      // optional; include when helpful
              "required": true,
              "minLength": 2,
              "maxLength": 50,
              "pattern": "email"                 // e.g., for email fields
            },
            "options": ["Option 1", "Option 2"],
            "rows": ["Row 1", "Row 2"],       // only for radioGrid
            "columns": [                      // only for radioGrid; per-column scoring objects
              { "label": "Col A", "points": 1 },
              { "label": "Col B", "points": 1 }
            ],
            "correctAnswer": "Option 1",      // when isQuiz is true and applicable
            "points": 1
          }
        ],
        "resultPages": [
          { "title": "Outcome A", "description": "Result description", "scoreRange": { "from": 0, "to": 0 } }
        ],
 
        // Adaptive Theming (required):
        "theme_name": "Indigo",
        "theme_primary_color": "#6366F1",
        "theme_background_color": "#E0E7FF"
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
        - "columns": an array of objects for each column choice, each like { "label": "Very Satisfied", "points": 1 }.
          Default "points" to 1 when unspecified. Use these per-column points for per-row scoring in radioGrid.
        - "label": the main title of the grid.
      - 'section': This is a visual heading used to organize long or complex forms. It is NOT an input field.
        - Insert a field object before each thematic group: { "label": "Section Title", "type": "section", "name": "section_section_title" }
        - Do NOT include options/rows/columns/correctAnswer/points on a section.
        - Sections must not be counted for scoring even when "isQuiz": true.
      - 'submit': Ensure there is exactly one field with type "submit".
      - If the user's request implies a longer introduction or context, include a helpful summary in the "description" field.
 
      VALIDATION & UX RULES:
      - CRITICAL VALIDATION RULE: You MUST analyze the context of each field to determine if it is essential for the form's purpose.
        - If a field is objectively mandatory (e.g., Name, Email, Subject, Phone Number), you MUST set "validation": { "required": true }.
        - Do NOT make subjective, demographic, or convenience-only questions required unless the user's context explicitly instructs it.
        - For email fields, prefer type "email"; also set validation.pattern = "email".
        - For text-like fields, use "validation.minLength" and/or "validation.maxLength" when reasonable.
      - Add a helpful "placeholder" string for fields where an example would be useful.
      - Add a concise "helperText" when a field needs additional explanation.
      - The "name" for each field MUST be a unique snake_case identifier within the form. If duplicates would occur, append a numeric suffix (e.g., "_2", "_3").

      THEME RULES:
      - Choose a theme from [Indigo, Slate, Rose, Amber, Emerald, Sky] based on topic/context.
      - Prefer Indigo/Slate for business; Rose/Amber for fun quizzes.
      - Output top-level: "theme_name", "theme_primary_color", "theme_background_color".
      - Canonical mappings:
        Indigo -> #6366F1 / #E0E7FF
        Slate  -> #475569 / #E2E8F0
        Rose   -> #F43F5E / #FFE4E6
        Amber  -> #F59E0B / #FEF3C7
        Emerald-> #10B981 / #D1FAE5
        Sky    -> #0EA5E9 / #E0F2FE

      QUIZ/ASSESSMENT RULES:
      - If the user's prompt or the document content contains keywords that imply a knowledge test—such as "quiz", "test", "exam", "true or false", or "knowledge check"—you MUST add a new top-level property "isQuiz": true on the main JSON object. Do NOT trigger quiz mode for generic workplace/self "assessment" or "evaluation" forms.
      - When "isQuiz" is true, you MUST do your best to analyze the prompt/document to identify the correct answer for option-based questions (types "radio", "checkbox", or "select"):
        - For "radio" or "select", set "correctAnswer" to the single correct option value if it can be identified.
        - For "checkbox", if multiple options are correct, set "correctAnswer" to an array of all correct option values (e.g., ["A","C"]). If only one is correct, you may still use a single string.
        - Always add a "points" key with value 1 on that field.
      - Only set "correctAnswer" on fields that actually have options (radio/checkbox/select). Do NOT add it for text-like or radioGrid fields.
      - CRITICAL REQUIREMENT FOR ALL QUIZZES/ASSESSMENTS: For any question that contributes to a score (i.e., fields with a "points" key or a "scoring" array), you MUST set "validation": { "required": true } so that submissions cannot omit scored items. For personality or opinion-based questions (e.g., Likert scales), you MUST also include a neutral or opt-out choice such as "Neutral", "I don't know", or "Not Applicable" to avoid forcing biased answers.

      CRITICAL OUTCOME RANGE RULE:
      - When generating outcomes with scoreRange, ranges MUST be contiguous and non-overlapping, starting at 0 and ending at total_possible_score (inclusive).
      - Each next range.from MUST equal previous range.to + 1.
      - If total_possible_score is not explicit, estimate 1 point per gradable question and set ranges to exactly cover 0..total_possible_score.
      
      PERSONALITY / OUTCOME-BASED ASSESSMENTS:
      - If the document implies a personality/typology outcome (e.g., "personality test", "enneagram", "DISC", "MBTI", "what type of", "find out your"), set "isQuiz": true and include a "resultPages" array (2–6 items) with { "title", "description", "scoreRange": { "from": 0, "to": 0 } } placeholders.
      
     TRAIT-BASED SCORING RULES (for personality/outcome-based assessments):
     - Each object in "resultPages" MUST include a stable "outcomeId": a snake_case identifier (e.g., "outcome_analyst"). Keep this constant across edits.
     - For fields that contribute to outcomes, add a "scoring" array:
       - For "radio" | "select" | "checkbox": { "option": "Option Text", "points": 1, "outcomeId": "<existing outcomeId>" }
       - For "radioGrid": { "column": "Column Label", "points": 1, "outcomeId": "<existing outcomeId>" }
     - For trait scoring with "radioGrid", "columns" should be labels only (e.g., ["Rarely True","Sometimes True","Always True"]); do NOT embed "points" inside "columns".
     - Do NOT set "correctAnswer" for personality/outcome-based assessments; "correctAnswer" is only for knowledge quizzes.

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
    const body = req.body ?? {};
    // Backward compatible: if caller sends raw answers directly, treat it as payload.
    const payload = body.payload ?? body;
    const { score = null, maxScore = null } = body;

    const ip =
      (req.headers['x-forwarded-for']?.toString().split(',')[0] || '').trim() ||
      req.socket?.remoteAddress ||
      null;

    const ref = await addDoc(collection(db, 'forms', formId, 'responses'), {
      payload,
      score,
      maxScore,
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

/**
* AI analysis endpoint
* POST /analyze-responses
* Body:
*  - form: JSON object for form structure (title, description, fields)
*  - responses: Array of StoredResponse-like objects or raw payloads
* Returns: Markdown text report (Content-Type: text/markdown)
*/
app.post('/analyze-responses', async (req, res) => {
 try {
   const { form, responses, formId } = req.body ?? {};

   if (!form || typeof form !== 'object') {
     return res.status(400).json({ error: 'Invalid "form" object in request body.' });
   }
   if (!Array.isArray(responses)) {
     return res.status(400).json({ error: '"responses" must be an array.' });
   }

   // Prepare compacted JSON strings for prompt (guard against very large payloads)
   const formJson = JSON.stringify(form, null, 2);
   const responsesJson = JSON.stringify(responses, null, 2);
   const formBlock =
     formJson.length > ANALYZE_JSON_CHAR_LIMIT ? condenseText(formJson, ANALYZE_JSON_CHAR_LIMIT) : formJson;
   const responsesBlock =
     responsesJson.length > ANALYZE_JSON_CHAR_LIMIT ? condenseText(responsesJson, ANALYZE_JSON_CHAR_LIMIT) : responsesJson;

   const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

   const masterPrompt = `
You are an expert data analyst. Analyze survey/form responses and produce a concise, professional summary report.
Your output must be VALID Markdown only. Do not include code fences. Do not include backticks. Do not include any JSON.

Goals for the report:
- Provide a brief Overview of key findings (2–4 sentences).
- Identify strong positive and negative trends (bullet points).
- Provide exactly three Actionable Recommendations (numbered list, 1–3).
- If applicable, include a short Data Quality Notes section (e.g., low sample size, missing values).
- Keep the entire report between 250–500 words. Be precise and avoid fluff. Do not hallucinate any data.

Context:
- Form definition (questions, types, choices):
"""${formBlock}"""

- Collected responses (array where each item is a single submission payload):
"""${responsesBlock}"""

Important instructions:
- Use the question labels when referring to questions.
- For single/multi choice fields (radio/select/checkbox/radioGrid), derive counts or clear trends from the data.
- For text answers, extract common themes; quote sparingly.
- For range questions, mention averages or distribution patterns when meaningful.
- If data is insufficient to draw conclusions, clearly state that limitation.
- Output must be Markdown with clear section headings:
 "# AI-Powered Summary Report", "## Overview", "## Trends", "## Actionable Recommendations", "## Data Quality Notes" (if needed).
`;

   const result = await model.generateContent(masterPrompt);
   const response = await result.response;

   // Safety handling
   const promptFeedback = response?.promptFeedback;
   if (promptFeedback?.blockReason) {
     console.warn('[SAFETY] Analysis prompt blocked:', promptFeedback.blockReason, promptFeedback);
     return res.status(400).json({
       error: 'Analysis rejected for safety reasons.',
       message: 'Your request was blocked by the safety system. Please adjust inputs and try again.',
       reason: promptFeedback.blockReason,
     });
   }

   const text = (response?.text?.() ?? '').trim();
   if (!text) {
     console.error('[MODEL ERROR] Empty analysis response from model.');
     return res.status(502).json({
       error: 'Upstream model returned an empty analysis.',
       message: 'The AI did not return any content. Please try again.',
     });
   }

   // Persist AI summary to Firestore when formId is provided
   if (formId && typeof formId === 'string') {
     try {
       await updateDoc(doc(db, 'forms', formId), {
         aiSummary: text,
         aiSummaryUpdatedAt: serverTimestamp(),
       });
     } catch (e) {
       console.warn('[analyze-responses] Failed to persist aiSummary for form', formId, e);
     }
   }

   // Return raw Markdown
   res.type('text/markdown').send(text);
 } catch (error) {
   console.error('[CRITICAL SERVER ERROR - ANALYZE]:', error);
   res.status(500).json({ error: 'Internal server error.', details: error.message });
 }
});

/**
 * AI Refactor Engine endpoint
 * POST /refactor-form
 * Body:
 *  - formJson: current complete form JSON object
 *  - command: string instruction describing the refactor to apply
 * Returns: Refactored form JSON (application/json)
 */
app.post('/refactor-form', async (req, res) => {
  try {
    const { formJson, command } = req.body ?? {};

    if (!formJson || typeof formJson !== 'object') {
      return res.status(400).json({ error: 'Invalid "formJson" object in request body.' });
    }
    if (typeof command !== 'string' || !command.trim()) {
      return res.status(400).json({ error: 'Invalid "command" string in request body.' });
    }

    // Compact/condense form JSON for prompt if very large
    const formStr = JSON.stringify(formJson, null, 2);
    const formBlock = formStr.length > ANALYZE_JSON_CHAR_LIMIT ? condenseText(formStr, ANALYZE_JSON_CHAR_LIMIT) : formStr;

    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const masterPrompt = `
You are an Expert Form Editor.

You will be given a complete form as a JSON object and a command from the user.
Your sole task is to apply the user's command to the entire form and return the new, complete, and still valid JSON object.
Do not add any conversational text or markdown.

CRITICAL REQUIREMENTS:
- Preserve a valid schema compatible with this structure:
{
  "title": "string",
  "description": "string",
  "isQuiz": boolean,
  "fields": [
    {
      "label": "string",
      "type": "text | email | password | textarea | radio | checkbox | select | date | time | file | range | radioGrid | section | submit",
      "name": "snake_case_identifier",
      "placeholder": "Optional placeholder text",
      "helperText": "Optional helper text below the field",
      "validation": {                           // optional; include when helpful
        "required": true,
        "minLength": 2,
        "maxLength": 50,
        "pattern": "email"                      // e.g., for email fields
      },
      "options": ["..."],                       // only for radio, checkbox, select
      "rows": ["..."],                          // only for radioGrid
      "columns": [{ "label": "A", "points": 1 }], // only for radioGrid
      "correctAnswer": "..." | ["..."],         // only if isQuiz and option-based field
      "points": 1                               // only if isQuiz
    }
  ],
  "resultPages": [
    { "title": "string", "description": "string", "scoreRange": { "from": 0, "to": 0 } }
  ],

  // Adaptive Theming (preserve if present; update only if the command explicitly changes theme)
  "theme_name": "Indigo|Slate|Rose|Amber|Emerald|Sky",
  "theme_primary_color": "#RRGGBB",
  "theme_background_color": "#RRGGBB"
}
- Exactly one "submit" field must exist and be last in order.
- For "radio" | "checkbox" | "select": include "options"; omit for other types (including radioGrid).
- radioGrid must use "rows" (string[]) and "columns" ({ "label": string, "points": number }[]).
- If you add or rename fields, ensure unique, URL-safe snake_case "name" values across the entire form.
- Preserve and reasonably enhance UX details ("placeholder", "helperText") and "validation" unless the command requests their removal or change.
- Maintain logical consistency; do not degrade the form's functionality.
- If the input JSON contains top-level theming keys (theme_name, theme_primary_color, theme_background_color), you MUST preserve them unless the user command explicitly asks to change theme.
- Output ONLY the raw JSON object.

User command:
"${String(command).trim()}"

Current form JSON:
"""${formBlock}"""
`;

    const result = await model.generateContent(masterPrompt);
    const response = await result.response;

    // Safety handling
    const promptFeedback = response?.promptFeedback;
    if (promptFeedback?.blockReason) {
      console.warn('[SAFETY] Refactor prompt blocked:', promptFeedback.blockReason, promptFeedback);
      return res.status(400).json({
        error: 'Refactor rejected for safety reasons.',
        message: 'Your request was blocked by the safety system. Please adjust inputs and try again.',
        reason: promptFeedback.blockReason,
      });
    }

    // Ensure non-empty text response and parse JSON robustly
    const text = (response?.text?.() ?? '').trim();
    if (!text) {
      console.error('[MODEL ERROR] Empty refactor response from model.');
      return res.status(502).json({
        error: 'Upstream model returned an empty refactor.',
        message: 'The AI did not return any content. Please try again.',
      });
    }

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

    return res.json(jsonResponse);
  } catch (error) {
    console.error('[refactor-form] error:', error);
    return res.status(500).json({ error: 'Internal server error.', details: error.message });
  }
});

app.listen(port, () => {
 console.log(`[startup] Server listening on port ${port}`);
});