import fs from "fs";
import { canonicalizeResumeData } from "./resumeCanonicalizer.js";
import { renderPdfPagesToImages } from "./fileParser.js";
import { extractLocalData } from "./localParser.js";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4";

// Gemini is selected whenever this value is configured; otherwise Ollama is used.
const GEMINI_API_VERSION = process.env.GEMINI_API_VERSION || "v1beta";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
const GEMINI_URL = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${GEMINI_MODEL}:generateContent`;



// Rate-limiting queue for the Gemini API (10 RPM safe limit for free tier)
let lastApiCallTime = 0;
const MIN_GAP_MS = 6100; // 6.1s gap guarantees <= 9.8 RPM
let apiQueuePromise = Promise.resolve();

async function throttleApiCall(apiCallFn) {
  const resultPromise = apiQueuePromise.then(async () => {
    const now = Date.now();
    const elapsed = now - lastApiCallTime;
    if (elapsed < MIN_GAP_MS) {
      const waitTime = MIN_GAP_MS - elapsed;
      console.log(`⏳ Rate limit protection: Spacing Gemini API request. Waiting ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    try {
      return await apiCallFn();
    } finally {
      lastApiCallTime = Date.now();
    }
  });

  // Do not block subsequent queue requests if this request fails
  apiQueuePromise = resultPromise.catch(() => {});
  return resultPromise;
}

function getGeminiParts(systemPrompt, promptText, images, isImage, mimeType) {
  const parts = [{ text: `${systemPrompt}\n\n${promptText}` }];

  if (images) {
    for (const imageData of images) {
      parts.push({
        inlineData: {
          mimeType: isImage ? (mimeType || "image/png") : "image/png",
          data: imageData,
        },
      });
    }
  }

  return parts;
}

async function callGemini(systemPrompt, promptText, images, isImage, mimeType, apiKey) {
  const geminiRequestBody = {
    contents: [{
      role: "user",
      parts: getGeminiParts(systemPrompt, promptText, images, isImage, mimeType),
    }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
      topP: 0.95,
      topK: 40,
      seed: 42,
    },
  };

  const geminiResponse = await throttleApiCall(() =>
    fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiRequestBody),
    })
  );

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    throw new Error(`Gemini API responded with status ${geminiResponse.status}: ${errorText}`);
  }

  const geminiResult = await geminiResponse.json();
  const geminiText = geminiResult.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  return canonicalizeResumeData(parseModelJson(geminiText));
}

async function callOllama(systemPrompt, promptText, images) {
  const requestBody = {
    model: OLLAMA_MODEL,
    system: systemPrompt,
    prompt: promptText,
    stream: false,
    format: "json",
    options: {
      temperature: 0,
      seed: 42,
      top_k: 1,
      top_p: 0.1,
      repeat_penalty: 1,
      num_ctx: 8192,
    },
  };

  if (images) requestBody.images = images;

  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Ollama API responded with status: ${response.status}`);
  }

  const result = await response.json();
  return canonicalizeResumeData(parseModelJson(result.response));
}

async function callConfiguredProvider(apiKey, promptText, images, isImage, mimeType) {
  // Try Gemini first if API key is provided
  if (apiKey) {
    console.log(`✨ Using Gemini API (${GEMINI_MODEL}) for resume extraction.`);
    try {
      return await callGemini(SYSTEM_PROMPT, promptText, images, isImage, mimeType, apiKey);
    } catch (geminiError) {
      console.warn(`⚠️ Gemini API failed: ${geminiError.message}. Falling back to Ollama...`);
    }
  }

  // Try Ollama as second option
  console.log(`🦙 Using local Ollama instance (${OLLAMA_MODEL}) for resume extraction.`);
  try {
    return await callOllama(SYSTEM_PROMPT, promptText, images);
  } catch (ollamaError) {
    console.warn(`⚠️ Ollama failed: ${ollamaError.message}. Falling back to local parser...`);
  }

  // Local parser as final fallback
  console.log(`🔧 Using local regex-based parser as final fallback.`);
  // For local parser, we need to extract text from the prompt
  // The promptText contains the resume content after "RESUME CONTENT:"
  const textMatch = promptText.match(/RESUME CONTENT:\n([\s\S]*)/);
  const extractedText = textMatch ? textMatch[1].trim() : promptText;
  return canonicalizeResumeData(extractLocalData(extractedText));
}

const SYSTEM_PROMPT = `ROLE
You are a deterministic, schema-bound resume parser. Your ONLY job is to extract information that is explicitly present in the resume document and emit valid JSON. You do not infer, guess, embellish, or summarize. Every extracted value must be traceable to a verbatim span of text in the source document.

OUTPUT CONTRACT

Return only a single valid JSON object. No markdown fences, no backticks, no prose, no comments, no trailing commas, no ellipses.
Every key listed in the schema below MUST appear in output — even if its value is null or [].
String field default: null (never "", "N/A", "Not provided", "Unknown", or any placeholder).
Array field default: [] (never null).
Boolean field default: false.


EXTRACTION RULES
R1 — VERBATIM COPY
Copy text exactly as it appears in the source. Do NOT rephrase, normalize, improve grammar, expand abbreviations, or reorder words. The only exception is stripping clear PDF/OCR artifacts (stray page numbers, isolated single characters, column-break symbols).
R2 — NO FABRICATION
If information is not present in the document, output null or []. Never invent plausible values. Never use your world knowledge to fill gaps (e.g., do not fill in a company's city from memory).
R3 — IDENTITY FIELDS (CRITICAL)
full_name, email, and phone are almost always at the top of the document. Scan the entire document if needed. These fields must be null ONLY if you have searched the entire text and the value genuinely does not exist anywhere.
R4 — DATE STRINGS
Keep dates exactly as written: "May 2021", "05/2021", "2021-05", "Present", "Current" — all are valid. Never transform, normalize, or output "Invalid Date".
R5 — CANDIDATE ACTIONS ONLY
responsibilities and achievements must describe actions taken by the candidate. Do NOT copy generic company descriptions, job postings, team overviews, or marketing text. If a bullet begins with a verb (Designed, Led, Reduced…), it is a candidate action. If it describes the employer, discard it.
R6 — ACHIEVEMENTS VS. RESPONSIBILITIES

responsibilities: ongoing duties, regular tasks, role scope.
achievements: discrete outcomes with measurable impact (numbers, %, milestones, awards from within a role).
When in doubt, place in responsibilities.

R7 — SKILLS CATEGORIZATION
Categorize skills exactly as follows (choose exactly ONE category per skill):

| Category | What belongs here |
| :--- | :--- |
| programming_languages | Languages: Python, Java, C++, SQL, TypeScript… |
| frameworks_libraries | React, Spring Boot, TensorFlow, Pandas, Express… |
| databases | PostgreSQL, MongoDB, Redis, MySQL, Cassandra… |
| cloud_platforms | AWS, GCP, Azure, Firebase, Heroku, Vercel… |
| tools_software | Git, Docker, Kubernetes, Jira, Figma, VS Code… |
| operating_systems | Linux, Windows, macOS, Ubuntu… |
| methodologies | Agile, Scrum, Kanban, TDD, CI/CD, DevOps… |
| soft_skills | Communication, Leadership, Teamwork, Problem-solving… |
| other | Domain-specific skills that do not fit any category above |

Never place skills in additional_sections.
R8 — ORDERING
Sort all experience-like arrays (work, education, projects, certifications, awards, publications) in reverse chronological order when dates are available and unambiguous. When dates are absent or ambiguous, preserve source order.
R9 — MULTI-COLUMN LAYOUT
Text separated by --- markers indicates column boundaries. Do NOT merge content across columns. A section heading applies only to content within its visual column until the next heading appears.
R10 — AWARD VS. EMPLOYER
Award titles, honor names, and recognition labels (e.g., "Best Paper Award", "Employee of the Year") are NEVER employer or company names. Place these in awards_honors. The actual employing institution is always separately named.
R11 — GRANTS & FUNDING
Grants, funded projects, and research funding are NOT awards. Place them in additional_sections under key "grants" or "fundings". Never place grants in awards_honors.
R12 — PUBLICATION COUNTS
Strings like "International Journals – 20" or "Conference Papers: 14" are summary statistics, not individual publication entries. Place them in additional_sections under key "publication_summary" as a plain text string. Only create individual entries in publications for specifically named works with a title.
R13 — TABLE DATA
When content appears in tabular form (pipe | delimited or wide-space aligned), treat each row as a separate entity. Never merge cells from different rows. Never confuse column headers with data values.
R14 — STRAY ARTIFACTS
Ignore isolated single digits, single letters, or stray characters that are clearly PDF layout artifacts (page numbers, column index markers). Do not include them in any extracted field.
R15 — ADDITIONAL SECTIONS
Any resume section with a heading that does not map to a standard schema key belongs in additional_sections. Use the exact section heading (lowercased, spaces replaced with underscores) as the key, and copy the content verbatim as a string or array of strings.
Examples: "patents", "speaking_engagements", "military_service", "conference_talks".
R16 — VALID RESUME CHECK
If the provided document is clearly NOT a resume (e.g., it is a random image, a receipt, a completely unrelated document), set the top-level field "is_resume" to false. Otherwise, set it to true.

OUTPUT SCHEMA:

{
  "is_resume": true,
  "personal_info": {
    "full_name": null,
    "email": null,
    "phone": null,
    "address": null,
    "city": null,
    "state": null,
    "country": null,
    "zip_code": null,
    "linkedin": null,
    "github": null,
    "portfolio": null,
    "website": null,
    "other_social": []
  },
  "objective": null,
  "summary": null,
  "education": [
    {
      "degree": null,
      "field_of_study": null,
      "institution": null,
      "location": null,
      "start_date": null,
      "end_date": null,
      "gpa": null,
      "honors": null,
      "relevant_coursework": []
    }
  ],
  "work_experience": [
    {
      "job_title": null,
      "company": null,
      "location": null,
      "start_date": null,
      "end_date": null,
      "is_current": false,
      "responsibilities": [],
      "achievements": []
    }
  ],
  "technical_skills": {
    "programming_languages": [],
    "frameworks_libraries": [],
    "databases": [],
    "cloud_platforms": [],
    "tools_software": [],
    "operating_systems": [],
    "methodologies": [],
    "other": []
  },
  "soft_skills": [],
  "projects": [
    {
      "name": null,
      "description": null,
      "technologies_used": [],
      "start_date": null,
      "end_date": null,
      "url": null,
      "github_link": null
    }
  ],
  "certifications": [
    {
      "name": null,
      "issuing_organization": null,
      "issue_date": null,
      "expiry_date": null,
      "credential_id": null,
      "url": null
    }
  ],
  "awards_honors": [
    {
      "title": null,
      "issuer": null,
      "date": null,
      "description": null
    }
  ],
  "publications": [
    {
      "title": null,
      "publisher": null,
      "date": null,
      "url": null,
      "description": null
    }
  ],
  "languages": [
    {
      "language": null,
      "proficiency": null
    }
  ],
  "volunteer_experience": [
    {
      "role": null,
      "organization": null,
      "start_date": null,
      "end_date": null,
      "description": null
    }
  ],
  "extracurricular_activities": [],
  "interests_hobbies": [],
  "references": [
    {
      "name": null,
      "title": null,
      "company": null,
      "email": null,
      "phone": null,
      "relationship": null
    }
  ],
  "additional_sections": {}
}

FIELD SEMANTICS (DB ALIGNMENT)
These notes align extraction to the PostgreSQL schema consuming this JSON.
FieldNoteswork_experience[].is_currentSet true only when the resume explicitly uses "Present", "Current", "Ongoing", or equivalent for end_date. Never infer from context.education[].relevant_courseworkExtract as an array of individual course name strings, not a single comma-joined string.technical_skills.*Each array element is a single skill name string, exactly as written.work_experience[].responsibilitiesOne action per array element. Split multi-sentence bullets at sentence boundaries.work_experience[].achievementsSame granularity rule as responsibilities.projects[].technologies_usedOne technology per array element.additional_sectionsKeys are snake_case section headings. Values may be strings, arrays of strings, or arrays of objects — whatever best preserves structure.personal_info.other_socialArray of raw URL strings for any social link that is not LinkedIn, GitHub, portfolio, or website.

DECISION TREE — AMBIGUOUS CASES
Is this text a job bullet?
  ├─ Starts with a verb AND subject is the candidate → responsibilities or achievements
  └─ Describes the employer / team / company → DISCARD

Is this a skill?
  ├─ Technical tool, language, platform, or framework → technical_skills (correct category)
  ├─ Communication, interpersonal, or leadership trait → soft_skills
  └─ Domain knowledge (e.g., "HIPAA compliance", "derivatives trading") → technical_skills.other

Is this an award or a grant?
  ├─ Recognition/honor given to the person → awards_honors
  └─ Money/resources received for a project → additional_sections["grants"]

Is this a publication entry or a count?
  ├─ Has a specific named title → publications[]
  └─ Is a category + number (e.g., "Journals: 12") → additional_sections["publication_summary"]

Is this a known schema section?
  ├─ Yes → use the mapped schema key
  └─ No (Patents, Talks, Military…) → additional_sections[snake_case_heading]

SELF-CHECK BEFORE OUTPUT
Run these checks mentally before emitting JSON:

Identity check: Are full_name, email, phone non-null if they exist anywhere in the document?
No placeholder strings: Zero occurrences of "", "N/A", "Not provided", "TBD", "Unknown".
No invented data: Every non-null value can be pointed to in the source text.
is_current accuracy: Only true when end date is explicitly "Present" / "Current".
Skills not in additional_sections: All skills are in technical_skills or soft_skills.
Awards ≠ employers: No award title appears as a company value.
Grants not in awards: Funded projects / research grants are in additional_sections.
Publication counts not in publications[]: Only named titles appear as publication entries.
Valid JSON: No trailing commas, no comments, all strings properly escaped.
All schema keys present: Every top-level key exists in the output, even if empty.`;

/**
 * Main AI service function that takes extracted text or images from a resume
 * and calls the underlying AI model (Gemini -> Ollama -> Local Parser) to parse it into structured JSON.
 *
 * @param {string} apiKey - Optional Gemini API Key (falls back to OLLAMA if undefined, then local parser)
 * @param {string} extractedText - Text extracted from the resume
 * @param {boolean} isPdf - Whether the original file is a PDF
 * @param {boolean} isImage - Whether the original file is an Image
 * @param {string} mimeType - The file's MIME type
 * @param {string} filePath - Path to the original file
 * @param {string} originalName - Name of the uploaded file
 * @param {number} pageCount - Number of pages in the PDF
 * @param {Buffer} fileBuffer - File buffer for direct vision models
 * @returns {Promise<Object>} Canonicalized JSON resume data
 */
export async function extractResumeData(
  apiKey,
  extractedText,
  isPdf,
  isImage,
  mimeType,
  filePath,
  originalName,
  pageCount = 0,
  fileBuffer = null,
  extractedImages = []
) {
  let images;
  let promptText = `Extract all information from this resume (${originalName}) and return it as a strict JSON object following the schema provided. Parse every section thoroughly.`;

  // Always use direct vision for PDF files by converting them to images
  const useDirectVision = isPdf && fileBuffer;

  if (isImage) {
    console.log(`📷 Using direct vision for image: ${originalName}`);
    try {
      const imgBuffer = fileBuffer || fs.readFileSync(filePath);
      images = [Buffer.from(imgBuffer).toString("base64")];
      promptText += `\n\nThis resume is provided as an image. Read the visual layout and text carefully, paying attention to columns, tables, and section boundaries. Extract only visible resume content.`;
      if (extractedText && extractedText.trim().length > 0) {
        promptText += `\n\nSUPPLEMENTARY OCR/TEXT (may contain ordering errors from multi-column layout — prefer the image when conflicts arise):\n${extractedText}`;
      }
    } catch (err) {
      console.warn(`⚠️ Failed to read image file buffer: ${err.message}`);
    }
  } else if (useDirectVision) {
    // Render PDF pages as images and send directly to the model
    console.log(`📷 Using direct vision for ${originalName} (${pageCount} pages)`);
    try {
      images = await renderPdfPagesToImages(fileBuffer);
      promptText += `\n\nThis resume has ${pageCount} page(s). The page images are provided directly. Read the visual layout carefully, paying attention to columns, tables, and section boundaries. Extract only visible resume content.`;
      // Also include extracted text as supplementary context if available
      if (extractedText && extractedText.trim().length > 0) {
        promptText += `\n\nSUPPLEMENTARY OCR/TEXT (may contain ordering errors from multi-column layout — prefer the image when conflicts arise):\n${extractedText}`;
      }
    } catch (err) {
      console.warn(`⚠️ Failed to render PDF pages as images: ${err.message}. Falling back to text extraction.`);
      images = undefined;
    }
  } else if (extractedImages && extractedImages.length > 0) {
    console.log(`📷 Sending ${extractedImages.length} extracted embedded images for ${originalName}`);
    images = extractedImages;
    promptText += `\n\nThis resume contained embedded images. Read the visual layout carefully and extract only visible resume content from them.`;
    if (extractedText && extractedText.trim().length > 0) {
      promptText += `\n\nSUPPLEMENTARY TEXT (may contain ordering errors from multi-column layout — prefer the image when conflicts arise):\n${extractedText}`;
    }
  }

  // Standard text-based path (if not using vision, or vision rendering failed)
  if (!images) {
    if (extractedText && extractedText.trim().length > 0) {
      promptText += `\n\nRESUME CONTENT:\n${extractedText}`;
    } else if (isImage) {
      const fileContent = fs.readFileSync(filePath);
      images = [fileContent.toString("base64")];
      promptText += "\n\nNo reliable OCR text was available. Read the provided image directly and extract only visible resume content.";
    } else {
      throw new Error("No usable text or image could be extracted from the document.");
    }
  }

  const effectiveApiKey = String(apiKey || GEMINI_API_KEY || "").trim();
  return callConfiguredProvider(effectiveApiKey, promptText, images, isImage, mimeType);
}

function parseModelJson(responseText) {
  let cleaned = String(responseText || "").trim();

  // Strip leading/trailing markdown code block ticks if any
  cleaned = cleaned.replace(/^```json\s*/i, "")
                   .replace(/^```\s*/i, "")
                   .replace(/```\s*$/i, "")
                   .trim();

  // Helper to try parsing and return if successful
  const tryParse = (str) => {
    try {
      return JSON.parse(str);
    } catch (e) {
      return null;
    }
  };

  // 1. Try direct parse first
  let parsed = tryParse(cleaned);
  if (parsed) return parsed;

  // 2. Extract between first '{' and last '}'
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate = cleaned.slice(start, end + 1);
    parsed = tryParse(candidate);
    if (parsed) return parsed;

    // 3. Robust clean-up of common JSON issues (comments, trailing commas)
    let extraClean = candidate
      // Strip single-line comments // ...
      .replace(/\/\/.*$/gm, "")
      // Strip multi-line comments /* ... */
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // Clean up trailing commas in objects e.g., "key": "val", } -> "key": "val" }
      .replace(/,\s*(?=\})/g, "")
      // Clean up trailing commas in arrays e.g., "val", ] -> "val" ]
      .replace(/,\s*(?=\])/g, "")
      .trim();

    parsed = tryParse(extraClean);
    if (parsed) return parsed;

    // Log the raw clean value to help debugging
    console.error("❌ Failed to parse JSON even after cleaning. Candidate raw text:\n", extraClean);
    
    // Attempt last ditch parse to throw the original JSON.parse error
    return JSON.parse(extraClean);
  }

  throw new Error("Model response did not contain valid JSON structure.");
}
