# Resume Extractor

An AI-powered tool that extracts structured data from resumes in any format - PDFs, Word documents, images, and more.

## What It Does

Resume Extractor takes any resume file and converts it into clean, structured JSON data that you can use in your applications. It:

- **Accepts many formats** - PDF, DOCX, DOC, RTF, TXT, HTML, ODT, Markdown, JPG, PNG, WEBP, SVG
- **Uses AI vision** - Can read resume images and PDFs directly
- **Extracts everything** - Personal info, education, work experience, skills, projects, certifications, and more
- **Exports to multiple formats** - Download extracted data as PDF, DOCX, HTML, Excel, or ZIP
- **Validates automatically** - Ensures data quality and completeness

## How It Works

The application has two parts:
1. **Frontend** - Upload your resume and view the extracted data
2. **Backend** - Processes files and extracts structured information using AI

### AI Provider Selection

The extraction automatically chooses between two AI options:

**Option 1: Google Gemini API** (Cloud-based, requires free API key)
- Used when you configure `GEMINI_API_KEY` in your `.env` file
- Supports vision (can read images and PDFs directly)
- Best quality extraction
- Get your free key at: https://aistudio.google.com/app/apikey

**Option 2: Local Ollama** (Free, runs on your computer)
- Used automatically when no Gemini key is configured
- Requires Ollama installed on your machine
- Works completely offline
- Download from: https://ollama.com

If AI extraction fails for any reason, the system falls back to local regex-based parsing.

## Quick Start

### Prerequisites

- **Node.js** (version 18 or higher)
- **Either**:
  - A Gemini API key (free from Google AI Studio), **OR**
  - Ollama installed locally with the `gemma4` model

### Installation

1. **Install dependencies:**
   ```bash
   cd resume-extractor
   npm run install:all
   ```

2. **Configure environment:**
   ```bash
   # Copy the example file
   cp backend/.env.example backend/.env
   
   # Then edit backend/.env and add your Gemini API key
   # OR leave it empty to use local Ollama
   ```

3. **Run the application:**

   Open two terminals:

   **Terminal 1 - Backend:**
   ```bash
   npm run dev:backend
   # Runs on http://localhost:5000
   ```

   **Terminal 2 - Frontend:**
   ```bash
   npm run start:frontend
   # Runs on http://localhost:3000
   ```

4. **Open your browser** and go to http://localhost:3000

## Using the Application

1. **Drag and drop** or click to upload a resume file
2. **Wait for processing** - The AI reads and extracts the data
3. **View the results** - Structured JSON appears with all extracted information
4. **Download** - Export as PDF, DOCX, HTML, Excel, or ZIP

## Supported File Formats

| Format | Extensions | Method |
|--------|-----------|--------|
| PDF | `.pdf` | AI vision (reads pages as images) |
| Word 2007+ | `.docx` | Text extraction with mammoth |
| Word 97-2003 | `.doc` | Text extraction with word-extractor |
| Rich Text | `.rtf` | Regex parsing |
| Plain Text | `.txt` | Direct read |
| HTML | `.html`, `.htm` | HTML parsing |
| OpenDocument | `.odt` | XML extraction |
| Markdown | `.md`, `.markdown` | Direct read |
| JPEG Image | `.jpg`, `.jpeg` | AI vision with OCR fallback |
| PNG Image | `.png` | AI vision with OCR fallback |
| WebP Image | `.webp` | AI vision with OCR fallback |
| SVG Resume | `.svg` | Text node extraction |

## Configuration

Edit `backend/.env` to customize:

```env
# Use Gemini (cloud AI with vision support)
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash
GEMINI_API_VERSION=v1beta

# Use Ollama (local AI) - used when GEMINI_API_KEY is empty
OLLAMA_URL=http://localhost:11434/api/generate
OLLAMA_MODEL=gemma4

# Server port
PORT=5000
```

## Extracted Data Schema

The extractor produces a comprehensive JSON object containing:

```json
{
  "personal_info": {
    "full_name": "...",
    "email": "...",
    "phone": "...",
    "linkedin": "...",
    "github": "...",
    ...
  },
  "summary": "...",
  "education": [...],
  "work_experience": [
    {
      "job_title": "...",
      "company": "...",
      "start_date": "...",
      "end_date": "...",
      "responsibilities": [...],
      "achievements": [...]
    }
  ],
  "technical_skills": {
    "programming_languages": [...],
    "frameworks_libraries": [...],
    "databases": [...],
    "cloud_platforms": [...],
    "tools_software": [...],
    "methodologies": [...]
  },
  "soft_skills": [...],
  "projects": [...],
  "certifications": [...],
  "awards_honors": [...],
  "languages": [...],
  "volunteer_experience": [...],
  "additional_sections": {}
}
```

## API Endpoints

### Extract Resume
```http
POST /api/extract
Content-Type: multipart/form-data

resume: <file>
```

Response:
```json
{
  "success": true,
  "filename": "john_doe_resume.pdf",
  "data": { ... },
  "fallback": false,
  "warnings": []
}
```

### Download Formatted Resume
```http
POST /api/download
Content-Type: application/json

{
  "resumeData": { ... },
  "filename": "output",
  "format": "pdf" // or "docx", "html"
}
```

### Bulk Extraction
```http
POST /api/extract-local-file
Content-Type: application/json

{
  "filePath": "/path/to/resume.pdf"
}
```

### Export to Excel
```http
POST /api/export-excel
Content-Type: application/json

{
  "results": [ ... ]
}
```

## Tech Stack

- **Frontend:** React 18, Vite, react-dropzone
- **Backend:** Node.js, Express
- **AI:** Google Gemini or Ollama
- **File Parsing:** pdf-parse, mammoth, tesseract.js, unzipper
- **Export:** pdfkit, docx, xlsx

## Project Structure

```
resume-extractor/
├── frontend/               # React application
│   ├── src/
│   │   ├── App.jsx         # Main app
│   │   └── components/     # UI components
│   └── vite.config.js
├── backend/                # Express server
│   ├── server.js           # API endpoints
│   ├── services/
│   │   ├── aiService.js    # AI extraction (Gemini/Ollama)
│   │   ├── fileParser.js   # Multi-format parsing
│   │   ├── localParser.js  # Regex fallback
│   │   └── resumeCanonicalizer.js
│   └── templates/          # Export templates
└── docs/
    └── EXTRACTION_PIPELINE.md  # Technical details
```

## Privacy & Security

- Files are processed in memory and deleted immediately after extraction
- API keys are stored server-side and never exposed to the client
- No data is logged or persisted
- Works completely offline when using local Ollama

## Validation & Testing

The project includes automated testing tools:

```bash
# Validate extraction quality
cd backend
node tests/validateExtraction.js

# Test extraction consistency
node tests/accuracyTest.js

# Score resume quality
node tests/resumeScoring.js
```

## Troubleshooting

**Extraction fails:**
- If using Gemini: Check your API key in `backend/.env`
- If using Ollama: Make sure Ollama is running and `gemma4` model is installed
- Try a different file format (some PDFs are harder to parse)

**Port 5000 already in use:**
- Change `PORT` in `backend/.env`

**"Rate limit" errors with Gemini:**
- The app automatically spaces requests by 6.1 seconds for free tier
- Wait a moment and try again

**Vision extraction not working:**
- Ensure you're using Gemini (Ollama has limited vision support)
- Try converting images to PNG format
- Check image quality - blurry or low-resolution images may fail

## ATS Best Practices

When submitting extracted/reformatted resumes to job portals:

- Use **PDF format** for online applications (best ATS compatibility)
- Use **DOCX format** when recruiters request editable files
- Keep to standard fonts (Arial, Helvetica, Times New Roman)
- Use single-column layout
- Avoid tables, images, and complex formatting
- Include clear section headers

## Documentation

- [Extraction Pipeline](docs/EXTRACTION_PIPELINE.md) - Detailed technical documentation
- [API Reference](docs/API.md) - Complete endpoint documentation (if available)

## Tips

- For best results with image resumes, use high-resolution scans
- Multi-page PDFs are fully supported
- The extractor preserves original phrasing and doesn't invent information
- Extracted data is ready for database import or further processing
