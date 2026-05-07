# 📄 ResumeAI — Intelligent Resume Extractor

A full-stack application that extracts structured JSON data from resumes in **any format** using **Google Gemini AI** (gemini-3-flash-preview) — including image-based resumes.

---

## ✨ Features

- 🤖 **AI-powered extraction** — uses Gemini's vision and language capabilities to parse every section of a resume
- 🖼️ **Image support** — upload a photo/scan of a resume (JPG, PNG, WEBP)
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

## 📋 Supported File Formats

| Format | Extension | Method |
|--------|-----------|--------|
| PDF | `.pdf` | Gemini native vision (inline base64) |
| Word 2007+ | `.docx` | mammoth |
| Word 97-2003 | `.doc` | mammoth |
| Rich Text | `.rtf` | regex strip |
| Plain Text | `.txt` | direct read |
| HTML | `.html`, `.htm` | node-html-parser |
| OpenDocument | `.odt` | unzipper + XML parse |
| Markdown | `.md`, `.markdown` | direct read |
| **JPEG Image** | `.jpg`, `.jpeg` | **Gemini vision (inline base64)** |
| **PNG Image** | `.png` | **Gemini vision (inline base64)** |
| **WebP Image** | `.webp` | **Gemini vision (inline base64)** |

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

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, react-dropzone |
| Backend | Node.js, Express |
| AI Model | Google Gemini 3 Flash Preview |
| PDF / Image Parsing | Gemini inline vision (base64) |
| DOCX/DOC | mammoth |
| HTML | node-html-parser |
| ODT | unzipper |

---

## 🔒 Privacy

- Files are processed in memory and immediately deleted after extraction
- API keys are read from `.env` and never exposed to the client
- No data is logged or persisted
