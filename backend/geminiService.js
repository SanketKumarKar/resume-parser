import fs from "fs";
import { canonicalizeResumeData } from "./resumeCanonicalizer.js";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4";
const MIN_TEXT_FOR_STRUCTURING = 80;

const SYSTEM_PROMPT = `You are an expert resume parser and deterministic information extractor. Your task is to analyze resume documents and extract ALL relevant information into a structured JSON format.

Extract every piece of information present in the resume, including but not limited to:

{
  "personal_info": {
    "full_name": "",
    "email": "",
    "phone": "",
    "address": "",
    "city": "",
    "state": "",
    "country": "",
    "zip_code": "",
    "linkedin": "",
    "github": "",
    "portfolio": "",
    "website": "",
    "other_social": []
  },
  "objective": "",
  "summary": "",
  "education": [
    {
      "degree": "",
      "field_of_study": "",
      "institution": "",
      "location": "",
      "start_date": "",
      "end_date": "",
      "gpa": "",
      "honors": "",
      "relevant_coursework": []
    }
  ],
  "work_experience": [
    {
      "job_title": "",
      "company": "",
      "location": "",
      "start_date": "",
      "end_date": "",
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
      "name": "",
      "description": "",
      "technologies_used": [],
      "start_date": "",
      "end_date": "",
      "url": "",
      "github_link": ""
    }
  ],
  "certifications": [
    {
      "name": "",
      "issuing_organization": "",
      "issue_date": "",
      "expiry_date": "",
      "credential_id": "",
      "url": ""
    }
  ],
  "awards_honors": [
    {
      "title": "",
      "issuer": "",
      "date": "",
      "description": ""
    }
  ],
  "publications": [
    {
      "title": "",
      "publisher": "",
      "date": "",
      "url": "",
      "description": ""
    }
  ],
  "languages": [
    {
      "language": "",
      "proficiency": ""
    }
  ],
  "volunteer_experience": [
    {
      "role": "",
      "organization": "",
      "start_date": "",
      "end_date": "",
      "description": ""
    }
  ],
  "extracurricular_activities": [],
  "interests_hobbies": [],
  "references": [
    {
      "name": "",
      "title": "",
      "company": "",
      "email": "",
      "phone": "",
      "relationship": ""
    }
  ],
  "additional_sections": {}
}

CRITICAL STRICT RULES:
1. EXACT MATCH & DETERMINISM: You are a pure data extractor. Copy text verbatim from the resume. Do not rephrase, summarize, improve, or invent.
2. NO HALLUCINATION: Do not invent missing information. Use null for missing string fields and [] for missing array fields.
3. CANDIDATE ACTIONS ONLY: Do not extract generic company descriptions as responsibilities or achievements.
4. DATES: Keep date strings exactly as written. Do not output "Invalid Date".
5. SKILLS: Extract skills exactly as written. Categorize logically but do not alter names.
6. ORDERING: Sort experience-like lists reverse chronologically when dates are clear. Otherwise keep source order.
7. UNIQUE SECTIONS: Preserve uncommon resume sections in additional_sections. Use the visible section heading as the key and copy its content exactly.
8. TEXT ONLY: When RESUME CONTENT is provided, use only that content. Ignore XML, font, base64, path, style, and metadata artifacts if any appear.
9. JSON ONLY: Return only valid JSON. No markdown, no backticks, no explanations.`;

export async function extractResumeData(
  apiKey,
  extractedText,
  isPdf,
  isImage,
  mimeType,
  filePath,
  originalName
) {
  let images;
  let promptText = `Extract all information from this resume (${originalName}) and return it as a strict JSON object following the schema provided. Parse every section thoroughly.`;

  if (extractedText && extractedText.trim().length >= MIN_TEXT_FOR_STRUCTURING) {
    promptText += `\n\nRESUME CONTENT:\n${extractedText}`;
  } else if (isImage) {
    const fileBuffer = fs.readFileSync(filePath);
    images = [fileBuffer.toString("base64")];
    promptText += "\n\nNo reliable OCR text was available. Read the provided image directly and extract only visible resume content.";
  } else {
    throw new Error("No usable text could be extracted from the document.");
  }

  try {
    const requestBody = {
      model: OLLAMA_MODEL,
      system: SYSTEM_PROMPT,
      prompt: promptText,
      stream: false,
      format: "json",
      options: {
        temperature: 0,// Deterministic output
        seed: 42,// Fixed seed for reproducibility
        top_k: 1,// Focus on the single most likely output
        top_p: 0.1,// Limit to the most probable tokens
        repeat_penalty: 1,// No penalty to allow necessary repetition in structured data
        num_ctx: 8192,// Large context window to handle long resumes without truncation
      },
    };

    if (images) {
      requestBody.images = images;
    }

    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Ollama API responded with status: ${response.status}`);
    }

    const result = await response.json();
    return canonicalizeResumeData(parseModelJson(result.response));
  } catch (error) {
    console.error("Error communicating with local Ollama instance:", error);
    throw error;
  }
}

function parseModelJson(responseText) {
  const cleaned = String(responseText || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Model response did not contain valid JSON.");
  }
}
