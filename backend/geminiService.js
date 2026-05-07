import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";

const SYSTEM_PROMPT = `You are an expert resume parser and information extractor. Your task is to analyze resume documents and extract ALL relevant information into a structured JSON format.

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

STRICT RULES:
1. Return ONLY valid JSON — no markdown, no explanation, no preamble, no backticks.
2. If a field is not found in the resume, set it to null (for strings), [] (for arrays), or {} (for objects).
3. Do NOT hallucinate or infer data not present in the document.
4. Preserve original text as closely as possible.
5. For dates, use the format found in the resume.
6. If there are unusual or custom sections, add them under "additional_sections".
7. technical_skills must be intelligently categorized.`;

export async function extractResumeData(
  apiKey,
  extractedText,
  isPdf,
  isImage,
  mimeType,
  filePath,
  originalName
) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-3-flash-preview",
    systemInstruction: SYSTEM_PROMPT,
  });

  let result;

  if (isPdf || isImage) {
    // For PDFs and Images: Use inline data approach for better accuracy
    const fileBuffer = fs.readFileSync(filePath);
    const base64File = fileBuffer.toString("base64");
    const resolvedMimeType = mimeType || (isPdf ? "application/pdf" : "image/jpeg");

    result = await model.generateContent([
      {
        inlineData: {
          mimeType: resolvedMimeType,
          data: base64File,
        },
      },
      `Extract all information from this resume (${originalName}) and return it as a strict JSON object following the schema provided. Parse every section thoroughly.`,
    ]);
  } else {
    // For text-based formats
    result = await model.generateContent([
      `Extract all information from this resume and return it as a strict JSON object following the schema provided. Parse every section thoroughly.\n\nRESUME CONTENT:\n${extractedText}`,
    ]);
  }

  const responseText = result.response.text();

  // Clean response — strip any accidental markdown
  const cleaned = responseText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return JSON.parse(cleaned);
}
