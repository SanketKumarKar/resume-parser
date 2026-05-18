import fs from "fs";
import { canonicalizeResumeData } from "./resumeCanonicalizer.js";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4";
const MIN_TEXT_FOR_STRUCTURING = 80;

// To switch from local Ollama/Gemma4 to Gemini API later:
// 1. Keep GEMINI_API_KEY in backend/.env.
// 2. In extractResumeData(), comment the "OLLAMA / GEMMA4 ACTIVE BLOCK".
// 3. Uncomment the "GEMINI API ALTERNATIVE BLOCK".
//
// Gemini 3 Flash model code from Google AI docs:
//   gemini-3-flash-preview
// Gemini 3 currently uses the v1alpha API in examples, and Google recommends
// keeping temperature at its Gemini 3 default of 1.0 instead of forcing 0.0.
// For older stable Gemini 2.5 Flash, use:
//   GEMINI_API_VERSION=v1beta
//   GEMINI_MODEL=gemini-2.5-flash
//
// Suggested env values for Gemini 3 Flash preview:
//   GEMINI_API_VERSION=v1alpha
//   GEMINI_MODEL=gemini-3-flash-preview
//
// const GEMINI_API_VERSION = process.env.GEMINI_API_VERSION || "v1alpha";
// const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
// const GEMINI_URL = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${GEMINI_MODEL}:generateContent`;

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
6. SKILLS PLACEMENT: Do not put a generic "Skills" section in additional_sections. Put technical/tool/domain skills in technical_skills and communication/leadership/customer/team skills in soft_skills. If a skill could fit multiple places, choose exactly one place.
7. ORDERING: Sort experience-like lists reverse chronologically when dates are clear. Otherwise keep source order.
8. UNIQUE SECTIONS: Preserve uncommon resume sections in additional_sections. Use the visible section heading as the key and copy its content exactly.
9. TEXT ONLY: When RESUME CONTENT is provided, use only that content. Ignore XML, font, base64, path, style, and metadata artifacts if any appear.
10. JSON ONLY: Return only valid JSON. No markdown, no backticks, no explanations.`;

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
    // ---------------------------------------------------------------------
    // OLLAMA / GEMMA4 ACTIVE BLOCK
    // ---------------------------------------------------------------------
    // This is the currently active local-model path. To stop using Gemma4,
    // comment from "const requestBody = {" through:
    //   return canonicalizeResumeData(parseModelJson(result.response));
    // Then uncomment the Gemini API block below.
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

    // ---------------------------------------------------------------------
    // GEMINI API ALTERNATIVE BLOCK - COMMENTED OUT BY DEFAULT
    // ---------------------------------------------------------------------
    // Uncomment this block only after commenting the active Ollama block above.
    // Gemini REST docs use generateContent with contents[].parts[].
    //
    // Gemini 3 Flash preview settings:
    // - model: gemini-3-flash-preview
    // - api version: v1alpha
    // - temperature: omit it OR keep 1.0. Google recommends Gemini 3 default 1.0.
    // - thinkingConfig.thinkingLevel: "low" for lower latency/cost, "high" for max reasoning.
    // - responseMimeType: "application/json" for JSON output.
    //
    // For deterministic-style tests on Gemini 2.5 Flash instead, you may use:
    //   model: "gemini-2.5-flash"
    //   api version: "v1beta"
    //   generationConfig: { temperature: 0.1, topP: 0.1, topK: 1, responseMimeType: "application/json" }
    // below you have to uncomment-------
    // const geminiParts = [
    //   { text: `${SYSTEM_PROMPT}\n\n${promptText}` },
    // ];
    //
    // if (images) {
    //   geminiParts.push({
    //     inlineData: {
    //       mimeType,
    //       data: images[0],
    //     },
    //   });
    // }
    //
    // const geminiRequestBody = {
    //   contents: [
    //     {
    //       role: "user",
    //       parts: geminiParts,
    //     },
    //   ],
    //   generationConfig: {
    //     responseMimeType: "application/json",
    //
    //     // Gemini 3 Flash: recommended default temperature is 1.0.
    //     // You can omit temperature entirely to use the model default.
    //     temperature: 1.0,
    //
    //     // Optional sampling controls. If a Gemini model rejects topK,
    //     // remove topK and retry; some models do not support it.
    //     topP: 0.95,
    //     topK: 40,
    //
    //     // Gemini API supports seed in GenerateContentConfig, but cloud
    //     // model behavior can still change across model updates.
    //     seed: 42,
    //   },
    //   // Gemini 3 only. Use "low" for faster extraction, "high" for careful parsing.
    //   thinkingConfig: {
    //     thinkingLevel: "low",
    //   },
    // };
    //
    // const geminiResponse = await fetch(`${GEMINI_URL}?key=${apiKey || process.env.GEMINI_API_KEY}`, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify(geminiRequestBody),
    // });
    //
    // if (!geminiResponse.ok) {
    //   const errorText = await geminiResponse.text();
    //   throw new Error(`Gemini API responded with status ${geminiResponse.status}: ${errorText}`);
    // }
    //
    // const geminiResult = await geminiResponse.json();
    // const geminiText = geminiResult.candidates?.[0]?.content?.parts
    //   ?.map((part) => part.text || "")
    //   .join("")
    //   .trim();
    //
    // return canonicalizeResumeData(parseModelJson(geminiText));
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
