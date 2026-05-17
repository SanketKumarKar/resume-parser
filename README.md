# 📄 ResumeAI — Intelligent Resume Extractor

A full-stack application that extracts structured JSON data from resumes in **any format** using **Google Gemini AI** (gemini-3-flash-preview) — including image-based resumes.

---

## ✨ Features

- 🤖 **AI-powered extraction** — uses Gemini's vision and language capabilities to parse every section of a resume
- 🖼️ **Image support** — upload a photo/scan of a resume (JPG, PNG, WEBP, SVG)
- 📄 **Multi-format support** — PDF, DOCX, DOC, RTF, TXT, HTML, ODT, Markdown
- 🔐 **API key via `.env`** — no need to paste your key in the UI
- 🧹 **Zero data retention** — files are deleted immediately after extraction

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/SanketKumarKar/resume-parser.git
cd resume-parser/resume-extractor

# Install all dependencies (backend + frontend)
npm run install:all
```

### 2. Configure Environment

```bash
cp backend/.env.example backend/.env
```

Then open `backend/.env` and fill in your key:

```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=5000
```

> Get your free API key at: https://aistudio.google.com/app/apikey

### 3. Run the App

Open **two terminals**:

**Terminal 1 — Backend:**

```bash
npm run dev:backend
# Runs on http://localhost:5000
```

**Terminal 2 — Frontend:**

```bash
npm run start:frontend
# Runs on http://localhost:3000
```

Open your browser at **http://localhost:3000**

---

## 📂 Project Structure

```
resume-extractor/
├── backend/
│   ├── server.js          # Express API server
│   ├── fileParser.js      # Multi-format file text extraction
│   ├── geminiService.js   # Gemini API integration (text + vision)
│   ├── .env               # API key config (git-ignored)
│   ├── .env.example       # Template for environment variables
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx                      # Main app shell
│   │   ├── components/
│   │   │   ├── FileUploader.jsx         # Drag & drop uploader
│   │   │   ├── JsonViewer.jsx           # Collapsible JSON viewer
│   │   │   └── LoadingState.jsx         # Extraction loading UI
│   │   ├── index.css                    # Global styles & design tokens
│   │   └── main.jsx                     # React entry point
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── README.md
```

---

## 🗺️ Extraction Pipeline Diagram

![Pipeline Diagram](Pipeline%20Diagram.png)

---

## 📋 Supported File Formats

| Format               | Extension              | Method                                  |
| -------------------- | ---------------------- | --------------------------------------- |
| PDF                  | `.pdf`               | Gemini native vision (inline base64)    |
| Word 2007+           | `.docx`              | mammoth                                 |
| Word 97-2003         | `.doc`               | word-extractor                          |
| Rich Text            | `.rtf`               | regex strip                             |
| Plain Text           | `.txt`               | direct read                             |
| HTML                 | `.html`, `.htm`    | node-html-parser                        |
| OpenDocument         | `.odt`               | unzipper + XML parse                    |
| Markdown             | `.md`, `.markdown` | direct read                             |
| **JPEG Image** | `.jpg`, `.jpeg`    | OCR text-first, vision fallback   |
| **PNG Image**  | `.png`               | OCR text-first, vision fallback   |
| **WebP Image** | `.webp`              | OCR text-first, vision fallback   |
| **SVG Resume** | `.svg`               | SVG text-node extraction          |

---

## 📦 Extracted JSON Schema

```json
{
  "personal_info": { "full_name", "email", "phone", "address", "linkedin", "github", ... },
  "objective": "...",
  "summary": "...",
  "education": [{ "degree", "institution", "gpa", "start_date", "end_date", ... }],
  "work_experience": [{ "job_title", "company", "responsibilities", "achievements", ... }],
  "technical_skills": {
    "programming_languages": [],
    "frameworks_libraries": [],
    "databases": [],
    "cloud_platforms": [],
    "tools_software": [],
    "methodologies": []
  },
  "soft_skills": [],
  "projects": [{ "name", "description", "technologies_used", "url", ... }],
  "certifications": [{ "name", "issuing_organization", "issue_date", ... }],
  "awards_honors": [],
  "publications": [],
  "languages": [],
  "volunteer_experience": [],
  "interests_hobbies": [],
  "references": [],
  "additional_sections": {}
}
```

---

## 🔌 API Endpoint

### `POST /api/extract`

**Headers:**

```
Content-Type: multipart/form-data
```

**Body (form-data):**

```
resume: <file>
```

**Response:**

```json
{
  "success": true,
  "filename": "john_doe_resume.pdf",
  "data": { ... extracted JSON ... }
}
```

---

## ⬇️ Download / Export Resume

After extraction you can convert the parsed JSON into a clean, ATS-friendly resume and download it in three formats: `pdf` (ATS-friendly), `docx` (editable Word), and `html` (web-friendly).

### `POST /api/download`

Request body (application/json):

```json
{
  "resumeData": { /* extracted JSON from /api/extract */ },
  "filename": "john_doe_resume",
  "format": "pdf" // or "docx" or "html"
}
```

Response:
- `pdf`: returns an ATS-optimized PDF (Content-Type: application/pdf)
- `docx`: returns an editable Microsoft Word file (Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document)
- `html`: returns an HTML file (Content-Type: text/html)

### Example (client-side Axios)

```javascript
// Download PDF
const resp = await axios.post('/api/download', { resumeData, filename: 'me', format: 'pdf' }, { responseType: 'blob' });
// then createObjectURL + anchor click to save
```

### ATS Notes
- The default PDF renderer produces a plain, black-on-white layout using standard fonts and single-column structure to maximize compatibility with Applicant Tracking Systems (ATS).
- Best practice: send the `pdf` for online job portals and `docx` when a recruiter requests an editable file.

---

## 🛠️ Tech Stack

| Layer               | Technology                     |
| ------------------- | ------------------------------ |
| Frontend            | React 18, Vite, react-dropzone |
| Backend             | Node.js, Express               |
| AI Model            | Google Gemini 3 Flash Preview  |
| PDF / Image Parsing | Gemini inline vision (base64)  |
| DOCX/DOC            | mammoth                        |
| HTML                | node-html-parser               |
| ODT                 | unzipper                       |

---

## 🔒 Privacy

- Files are processed in memory and immediately deleted after extraction
- API keys are read from `.env` and never exposed to the client
- No data is logged or persisted

---

## ⬇️ Download Feature — Details

This project can convert extracted JSON into clean, ATS-friendly resumes and downloadable files in `pdf`, `docx`, and `html` formats. Key behaviors and usage notes:

- Supported formats: `pdf` (ATS-friendly), `docx` (editable Word), `html` (web-friendly)
- Endpoint: `POST /api/download` accepts `{ resumeData, filename, format }` and returns a binary file.
- Browser client: use `responseType: 'blob'` and createObjectURL + anchor click to save the file.
- PDF generation uses `pdfkit` and produces single-column, text-first PDFs optimized for parsing by ATS.

### Quick Download Example (client-side Axios)

```javascript
const resp = await axios.post('/api/download', { resumeData, filename: 'me', format: 'pdf' }, { responseType: 'blob' });
// then createObjectURL + anchor click to save
```

### Response Headers (examples)

- PDF: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="<name>_formatted.pdf"`
- DOCX: `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- HTML: `Content-Type: text/html; charset=utf-8`

## ATS Guidance (summary)

To maximize parsing accuracy when submitting resumes to Applicant Tracking Systems, follow these rules:

- Use standard fonts (Arial, Helvetica, Times New Roman)
- Keep single-column layout; avoid tables or multi-column designs
- Use black text on white background; avoid images and graphics
- Use clear section headers (EXPERIENCE, EDUCATION, SKILLS, etc.)
- Use plain bullet points and include dates for each job/education entry
- Keep margins standard (approx. 0.5 in) and limit to 1–2 pages

These rules are the default target for the `pdf` renderer in this project.

## Setup & Troubleshooting (concise)

1. Install backend deps:

```bash
cd backend
npm install
```

2. Start backend (dev):

```bash
npm run dev
```

3. Start frontend (dev):

```bash
cd frontend
npm run dev
```

Common troubleshooting:
- If port 5000 is in use, free it or update `backend/.env` `PORT` value.
- Ensure `pdfkit` is installed for PDF generation: `npm list pdfkit`.
- If a download appears blank, verify `resumeData` from `/api/extract` before calling `/api/download`.

---

## 📋 Extraction Pipeline
See [docs/EXTRACTION_PIPELINE.md](docs/EXTRACTION_PIPELINE.md) for a detailed overview of how resumes are processed, parsed, and validated end-to-end.

---
