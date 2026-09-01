# Resume Extractor - Technical Manual

## Architecture Overview

Resume Extractor is a full-stack application that parses resumes in various formats and extracts structured JSON data using AI. The system supports both cloud-based (Google Gemini) and local (Ollama) AI providers.

### High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     FileUploader.jsx                         │  │
│  │  Drag & drop / browse → File selection                       │  │
│  └───────────────────────┬──────────────────────────────────────┘  │
│                          │                                         │
│                          ▼                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    LoadingState.jsx                          │  │
│  │  Shows progress during extraction                            │  │
│  └───────────────────────┬──────────────────────────────────────┘  │
│                          │                                         │
│                          ▼                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     JsonViewer.jsx                           │  │
│  │  Displays extracted JSON                                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                              │
                    HTTP /api/extract
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                       Backend (Express)                            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      server.js                               │  │
│  │  - File upload endpoint (/api/extract)                       │  │
│  │  - Download endpoints (/api/download, /api/export-*)         │  │
│  │  - Bulk extraction endpoints                                 │  │
│  └────────────────────────┬─────────────────────────────────────┘  │
│                           │                                        │
│                           ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              services/fileParser.js                          │  │
│  │  - PDF text extraction (pdf-parse)                           │  │
│  │  - DOCX extraction (mammoth)                                 │  │
│  │  - Image OCR (tesseract.js)                                  │  │
│  │  - Text file parsing                                         │  │
│  └────────────────────────┬─────────────────────────────────────┘  │
│                           │                                        │
│                           ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              services/aiService.js                           │  │
│  │  - AI provider selection                                     │  │
│  │  - Gemini API integration                                    │  │
│  │  - Ollama integration                                        │  │
│  │  - Rate limiting (Gemini)                                    │  │
│  └────────────────────────┬─────────────────────────────────────┘  │
│                           │                                        │
│                           ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │            services/localParser.js                           │  │
│  │  - Fallback regex parsing                                    │  │
│  │  - Basic field extraction                                    │  │
│  └────────────────────────┬─────────────────────────────────────┘  │
│                           │                                        │
│                           ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │          services/resumeCanonicalizer.js                     │  │
│  │  - Schema validation                                         │  │
│  │  - Field normalization                                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                              │
                    HTTP /api/download
                              ▼
                    templates/
               - resumeDownloadService.js (PDF)
               - resumeHtmlTemplate.js (HTML)
               - resumeDocxTemplate.js (DOCX)
```

---

## Technology Stack

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool
- **react-dropzone** - Drag & drop file uploads

### Backend
- **Node.js** - Runtime environment
- **Express** - Web framework
- **dotenv** - Environment configuration
- **Multer** - Multipart file uploads
- **pdf-parse** - PDF text extraction
- **mammoth** - DOCX parsing
- **tesseract.js** - OCR for images
- **unzipper** - ODT extraction
- **docx** - DOCX generation
- **pdfkit** - PDF generation
- **xlsx** - Excel export

### AI Providers
- **Google Gemini API** - Cloud AI for high-quality extraction
- **Ollama** - Local AI runtime for offline operation

---

## Project Structure

```
resume-extractor/
├── frontend/                           # React frontend
│   ├── src/
│   │   ├── main.jsx                    # React entry point
│   │   ├── App.jsx                     # Main app component
│   │   ├── index.css                   # Global styles
│   │   └── components/
│   │       ├── FileUploader.jsx        # Upload component
│   │       ├── JsonViewer.jsx          # JSON display component
│   │       └── LoadingState.jsx        # Loading indicator
│   ├── index.html                      # HTML shell
│   └── vite.config.js                  # Vite configuration
│
├── backend/                            # Express backend
│   ├── server.js                       # Express server entry
│   ├── services/
│   │   ├── fileParser.js               # File parsing logic
│   │   ├── aiService.js                # AI extraction service
│   │   ├── localParser.js              # Regex fallback parser
│   │   └── resumeCanonicalizer.js      # Schema validation
│   ├── templates/
│   │   ├── resumeDownloadService.js    # PDF generation
│   │   ├── resumeHtmlTemplate.js       # HTML generation
│   │   └── resumeDocxTemplate.js       # DOCX generation
│   ├── tmp/                            # Temporary upload storage
│   ├── .env.example                    # Environment template
│   ├── package.json                    # Dependencies
│   └── tests/                          # Test scripts
│       ├── validateExtraction.js
│       ├── accuracyTest.js
│       └── resumeScoring.js
│
├── docs/
│   ├── EXTRACTION_PIPELINE.md          # Technical overview
│   └── TECHNICAL_MANUAL.md             # This document
├── README.md                           # User documentation
└── package.json                        # Root scripts
```

---

## Core Services

### fileParser.js

**Purpose:** Extract text and images from various file formats

**Functions:**

```javascript
// Main extraction function
async function extractTextFromFile(filePath, mimetype, originalname)
```

**Returns:**
```javascript
{
  text: string,              // Extracted text
  isPdf: boolean,            // Whether file is PDF
  isImage: boolean,          // Whether file is image
  sourceType: string,        // Method used for extraction
  pageCount: number,         // PDF page count
  buffer: Buffer,            // File buffer for direct vision
  warnings: string[],        // Extraction warnings
  images: string[]           // Base64 images for vision
}
```

**Supported Formats:**

| Format | Method | Notes |
|--------|--------|-------|
| PDF | pdf-parse + vision | Renders pages to images |
| DOCX | mammoth | Word 2007+ format |
| DOC | word-extractor | Legacy Word format |
| RTF | Regex strip | Rich text format |
| TXT | Direct read | Plain text |
| HTML | node-html-parser | HTML files |
| ODT | unzipper + XML | OpenDocument |
| Markdown | Direct read | .md, .markdown |
| JPEG/PNG | OCR | Tesseract.js |
| WEBP | OCR | WebP images |
| SVG | Text extraction | Vector graphics |

### aiService.js

**Purpose:** AI extraction with provider selection

**Key Functions:**

```javascript
// Main extraction function
async function extractResumeData(
  extractedText,
  isPdf,
  isImage,
  mimeType,
  filePath,
  originalName,
  pageCount = 0,
  fileBuffer = null,
  extractedImages = []
)
```

**Provider Selection Logic:**

```javascript
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";

async function callConfiguredProvider(apiKey, promptText, images, isImage, mimeType) {
  if (apiKey) {
    console.log(`✨ Using Gemini API (${GEMINI_MODEL}) for resume extraction.`);
    return callGemini(systemPrompt, promptText, images, isImage, mimeType, apiKey);
  }
  
  console.log(`🦙 Using local Ollama instance (${OLLAMA_MODEL}) for resume extraction.`);
  return callOllama(systemPrompt, promptText, images);
}
```

**Rate Limiting:**

```javascript
// 6.1 second gap to stay under 10 RPM free tier limit
const MIN_GAP_MS = 6100;
let lastApiCallTime = 0;

async function throttleApiCall(apiCallFn) {
  // Ensures requests are spaced appropriately
}
```

**System Prompt:**

A comprehensive prompt that instructs the AI to extract specific fields according to a strict schema. Key requirements:
- Extract only verbatim text from document
- No fabrication or inference
- Categorize skills properly
- Handle multi-column layouts
- Distinguish between awards and employers

### localParser.js

**Purpose:** Fallback regex-based extraction

**Functions:**

```javascript
function extractLocalData(text) {
  // Extracts basic fields using regex patterns
  return {
    full_name: matchName(text),
    email: matchEmail(text),
    phone: matchPhone(text),
    summary: matchSummary(text),
    education: matchEducation(text),
    work_experience: matchExperience(text),
    technical_skills: matchSkills(text),
    soft_skills: matchSoftSkills(text)
  };
}
```

**Patterns:**
- Email: `\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b`
- Phone: Various formats with country codes
- Dates: Month YYYY, YYYY-MM-DD, etc.

### resumeCanonicalizer.js

**Purpose:** Normalize extracted data to standard schema

**Functions:**
```javascript
function canonicalizeResumeData(data) {
  // Ensures all required fields exist
  // Normalizes field names
  // Validates data types
  return normalizedData;
}
```

**Normalization:**
- Converts empty strings to `null`
- Ensures arrays are always arrays
- Standardizes date formats
- Categorizes skills properly

---

## API Endpoints

### Extract Resume

**Endpoint:** `POST /api/extract`

**Request:**
```
Content-Type: multipart/form-data

resume: <file>
```

**Response (Success):**
```json
{
  "success": true,
  "filename": "john_doe_resume.pdf",
  "data": {
    "personal_info": { ... },
    "summary": "...",
    "education": [...],
    "work_experience": [...]
  },
  "fallback": false,
  "textLength": 1234,
  "warnings": []
}
```

**Response (Fallback Used):**
```json
{
  "success": true,
  "filename": "image_scan.jpg",
  "data": { ... },
  "fallback": true,
  "warnings": ["Used local parser fallback"]
}
```

**Response (Error):**
```json
{
  "error": "Could not extract text or image from file."
}
```

### Download Formatted Resume

**Endpoint:** `POST /api/download`

**Request:**
```json
{
  "resumeData": { ... },
  "filename": "output",
  "format": "pdf" // or "docx", "html"
}
```

**Response:**
- `pdf`: Binary PDF file with `Content-Type: application/pdf`
- `docx`: Binary DOCX file with proper header
- `html`: HTML document

### Bulk Extraction

**Endpoint:** `POST /api/extract-local-file`

**Request:**
```json
{
  "filePath": "/path/to/resume.pdf"
}
```

**Response:**
```json
{
  "success": true,
  "filename": "resume.pdf",
  "data": { ... },
  "fallback": false
}
```

### Export to Excel

**Endpoint:** `POST /api/export-excel`

**Request:**
```json
{
  "results": [
    { "filename": "r1.pdf", "data": { ... } },
    { "filename": "r2.pdf", "data": { ... } }
  ]
}
```

**Response:**
- Excel file with structured columns

---

## Extraction Pipeline

### Step 1: File Upload

```
User uploads file
    ↓
Multer saves to /tmp
    ↓
File metadata extracted
```

### Step 2: Text/Image Extraction

```
File type detected
    ↓
    ├─ PDF → pdf-parse + image rendering
    ├─ DOCX → mammoth
    ├─ Image → tesseract.js OCR
    ├─ Text → Direct read
    └─ Other → Format-specific parser
    ↓
Text extracted, images converted to base64
```

### Step 3: AI Extraction

```
Text/images ready
    ↓
checkGeminiAvailable()
    ↓
    ├─ API key present → Gemini API
    └─ No API key → Ollama
    ↓
Request sent with SYSTEM_PROMPT
    ↓
JSON response received
```

### Step 4: Data Normalization

```
Raw JSON response
    ↓
canonicalizeResumeData()
    ↓
Validated, normalized output
```

### Step 5: Response

```
Final JSON structure
    ↓
Add metadata (filename, warnings, fallback flag)
    ↓
Return to client
```

---

## Data Schema

### Complete Extracted Schema

```javascript
{
  // Required boolean - is this a valid resume?
  is_resume: true,

  // Personal information
  personal_info: {
    full_name: string|null,
    email: string|null,
    phone: string|null,
    address: string|null,
    city: string|null,
    state: string|null,
    country: string|null,
    zip_code: string|null,
    linkedin: string|null,
    github: string|null,
    portfolio: string|null,
    website: string|null,
    other_social: string[]
  },

  // Professional content
  objective: string|null,
  summary: string|null,

  // Education history
  education: [{
    degree: string|null,
    field_of_study: string|null,
    institution: string|null,
    location: string|null,
    start_date: string|null,
    end_date: string|null,
    gpa: string|null,
    honors: string|null,
    relevant_coursework: string[]
  }],

  // Work experience
  work_experience: [{
    job_title: string|null,
    company: string|null,
    location: string|null,
    start_date: string|null,
    end_date: string|null,
    is_current: boolean,
    responsibilities: string[],
    achievements: string[]
  }],

  // Categorized skills
  technical_skills: {
    programming_languages: string[],
    frameworks_libraries: string[],
    databases: string[],
    cloud_platforms: string[],
    tools_software: string[],
    operating_systems: string[],
    methodologies: string[],
    other: string[]
  },
  soft_skills: string[],

  // Projects
  projects: [{
    name: string|null,
    description: string|null,
    technologies_used: string[],
    start_date: string|null,
    end_date: string|null,
    url: string|null,
    github_link: string|null
  }],

  // Certifications
  certifications: [{
    name: string|null,
    issuing_organization: string|null,
    issue_date: string|null,
    expiry_date: string|null,
    credential_id: string|null,
    url: string|null
  }],

  // Awards and recognition
  awards_honors: [{
    title: string|null,
    issuer: string|null,
    date: string|null,
    description: string|null
  }],

  // Publications
  publications: [{
    title: string|null,
    publisher: string|null,
    date: string|null,
    url: string|null,
    description: string|null
  }],

  // Languages
  languages: [{
    language: string|null,
    proficiency: string|null
  }],

  // Additional sections
  volunteer_experience: [{
    role: string|null,
    organization: string|null,
    start_date: string|null,
    end_date: string|null,
    description: string|null
  }],
  extracurricular_activities: string[],
  interests_hobbies: string[],
  references: [{
    name: string|null,
    title: string|null,
    company: string|null,
    email: string|null,
    phone: string|null,
    relationship: string|null
  }],
  additional_sections: {}  // Any non-standard sections
}
```

---

## AI Provider Configuration

### Gemini API

**Configuration:**
```javascript
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.5-flash
GEMINI_API_VERSION=v1beta
```

**API Endpoint:**
```
https://generativelanguage.googleapis.com/{version}/models/{model}:generateContent?key={apiKey}
```

**Features:**
- Support for image vision (PDFs rendered to images)
- JSON mode response
- Rate limited (10 RPM for free tier)

**Request Body:**
```json
{
  "contents": [{
    "role": "user",
    "parts": [
      { "text": "SYSTEM_PROMPT + user_prompt" },
      { "inlineData": { "mimeType": "image/png", "data": "base64..." } }
    ]
  }],
  "generationConfig": {
    "responseMimeType": "application/json",
    "temperature": 0.1,
    "topP": 0.95,
    "topK": 40,
    "seed": 42
  }
}
```

### Ollama (Local AI)

**Configuration:**
```javascript
OLLAMA_URL=http://localhost:11434/api/generate
OLLAMA_MODEL=gemma4
```

**Features:**
- Runs entirely locally
- No API costs
- No rate limits
- Supports image input for vision models

**Request Body:**
```json
{
  "model": "gemma4",
  "system": "SYSTEM_PROMPT",
  "prompt": "user_prompt",
  "stream": false,
  "format": "json",
  "images": ["base64..."],
  "options": {
    "temperature": 0,
    "seed": 42,
    "top_k": 1,
    "top_p": 0.1,
    "repeat_penalty": 1,
    "num_ctx": 8192
  }
}
```

---

## Template Generation

### PDF Generation (resumeDownloadService.js)

**Features:**
- ATS-friendly layout
- Single column, standard fonts
- Proper margins and spacing

**Functions:**
```javascript
function generateResumePDF(resumeData) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 60, right: 60 } });
  // Renders resume sections to PDF
  return doc;
}
```

### HTML Generation (resumeHtmlTemplate.js)

**Features:**
- Semantic HTML5
- Print-optimized styles
- ATS-friendly structure

### DOCX Generation (resumeDocxTemplate.js)

**Features:**
- Microsoft Word compatible
- Table-based layout
- Standard fonts

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | - | Google Gemini API key |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model to use |
| `GEMINI_API_VERSION` | `v1beta` | Gemini API version |
| `OLLAMA_URL` | `http://localhost:11434/api/generate` | Ollama endpoint |
| `OLLAMA_MODEL` | `gemma4` | Ollama model name |
| `PORT` | `5000` | Backend server port |

### Setup

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your configuration
```

---

## Testing

### Extraction Validation

```bash
cd backend
node tests/validateExtraction.js
```

This script:
- Sends multiple resumes to the API
- Validates output against schema
- Reports missing fields
- Checks data quality

### Accuracy Testing

```bash
cd backend
node tests/accuracyTest.js
```

This script:
- Runs extraction twice per file
- Compares outputs
- Reports consistency scores
- Identifies unstable fields

### Manual Testing

```bash
# Start backend
npm run dev:backend

# Test extraction
curl -X POST http://localhost:5000/api/extract \
  -F "resume=@test.pdf"

# Test status
curl http://localhost:5000/api/health
```

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "No usable text" | File is image/PDF without OCR | Use Gemini API with vision |
| "Rate limit" | Too many Gemini requests | Wait 10+ seconds |
| "Model not found" | Ollama model missing | Run `ollama pull gemma4` |
| "Parse failed" | Invalid JSON from AI | Use local fallback |

### Error Response Format

```json
{
  "error": "Descriptive error message"
}
```

---

## Performance Optimization

### Gemini Rate Limiting

```javascript
// Automatically spaces requests by 6.1 seconds
const MIN_GAP_MS = 6100;

// Queue system prevents concurrent requests
let apiQueuePromise = Promise.resolve();
```

### Ollama Local Processing

- No network latency
- Uses local resources
- Can process multiple files sequentially

### Memory Management

- Files stored in `/tmp` and deleted after processing
- Large files handled efficiently
- Buffer management for images

---

## Deployment

### Prerequisites

- Node.js 18+
- Either: Gemini API key OR Ollama installed

### Quick Deploy

```bash
npm run install:all
cp backend/.env.example backend/.env
# Configure .env
npm run dev:backend  # Terminal 1
npm run start:frontend  # Terminal 2
```

### Production Considerations

1. **Environment variables** - Use secure configuration
2. **CORS** - Restrict origins for production
3. **File size limits** - Adjust in server.js if needed
4. **Error logging** - Configure proper logging

### Docker Example

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
RUN npm run build:all
EXPOSE 5000 3000
CMD ["npm", "run", "start"]
```

---

## Security

### API Key Management

- Keys stored in `.env` (git-ignored)
- Keys never exposed to frontend
- Request logging excludes keys

### Input Validation

- File type whitelist enforced
- Size limits on uploads
- Sanitized file paths

### CORS Configuration

Default allows all origins. For production:
```javascript
app.use(cors({
  origin: 'https://your-domain.com'
}));
```

---

## Troubleshooting

### Common Issues

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| AI not responding | Check `.env` configuration | Set API key or start Ollama |
| Extraction too slow | Gemini rate limiting | Wait 10+ seconds |
| Missing fields | Ollama model not trained | Use Gemini API |
| PDF not parsing | Scanned PDF without text | Use Gemini with vision |
| Port in use | Another process using port | Change PORT in `.env` |

### Debug Mode

Enable verbose logging in `aiService.js`:
```javascript
console.log('Sending to provider:', apiKey ? 'Gemini' : 'Ollama');
console.log('Request text length:', promptText.length);
```

---

## Future Enhancements

Potential improvements:

1. **More AI Providers** - Claude, GPT-4 support
2. **Batch Processing** - Queue system for high volume
3. **Database Integration** - Persistent storage
4. **Custom Templates** - User-definable extraction rules
5. **Export Formats** - JSON Schema, XML support
6. **Resume Scoring** - ATS compatibility check
7. **Multilingual Support** - Non-English resume parsing

---

## Contributing

### Adding New File Format Support

1. Add parser in `fileParser.js`
2. Update `extractTextFromFile()` function
3. Add test case in validation suite

### Adding New AI Provider

1. Create provider service file
2. Implement `callProvider()` function
3. Update `callConfiguredProvider()` selector

---

*Technical Manual for Resume Extractor v1.0*