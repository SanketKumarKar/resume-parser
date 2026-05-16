# Resume Extraction Pipeline

This document describes the end-to-end process for extracting structured data from resumes in this project.

## 1. API Endpoint
- **POST /api/extract** (see `backend/server.js`)
- Accepts a resume file upload (PDF, DOCX, image, etc.) as `resume` (multipart/form-data).

## 2. File Parsing
- The file is saved temporarily and passed to `extractTextFromFile` (`backend/fileParser.js`).
- Detects file type and extracts text using:
  - `pdf-parse` for PDFs
  - `mammoth` for DOCX
  - OCR (`tesseract.js`) for images
  - Regex/other logic for TXT, RTF, etc.

## 3. AI Extraction
- Extracted text is sent to `extractResumeData` (`backend/geminiService.js`).
- Builds a strict JSON schema prompt and calls a local LLM (Ollama/Gemma4) to extract structured data.
- Canonicalizes the result to match the expected schema.

## 4. Fallback Extraction
- If the AI call fails, falls back to `extractLocalData` (`backend/localParser.js`), which uses regex and keyword matching for basic info.

## 5. Response
- Returns JSON with:
  - `success`: true/false
  - `data`: extracted resume object
  - `fallback`: true if local parser was used
  - Metadata (filename, warnings, etc.)

## 6. Validation & Testing
- The script `backend/tests/validateExtraction.js` automates QA:
  - Sends many resumes to the API
  - Validates output against the schema
  - Checks for missing fields, recall, and quality
  - Generates a report for analysis
- The script `backend/tests/accuracyTest.js` checks extraction consistency (determinism):
  - Runs extraction twice for each resume and compares the outputs
  - Flattens both JSON results and scores how many fields match
  - Reports per-file and overall accuracy, highlighting unstable fields
  - Ensures the extraction process is reliable and repeatable

---

For more details, see the referenced files in the backend directory.