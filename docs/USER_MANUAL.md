# Resume Extractor - User Manual

## Table of Contents

1. [Getting Started](#getting-started)
2. [Interface Overview](#interface-overview)
3. [Uploading Resumes](#uploading-resumes)
4. [Viewing Results](#viewing-results)
5. [Exporting Data](#exporting-data)
6. [AI Features](#ai-features)
7. [Tips & Best Practices](#tips--best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Getting Started

### System Requirements

- **Browser:** Chrome, Firefox, Edge, or Safari (latest versions)
- **Internet:** Required for AI extraction (unless using local Ollama)
- **Optional:** Gemini API key for cloud AI, or Ollama for local AI

### Quick Setup

1. Install dependencies:
   ```bash
   cd resume-extractor
   npm run install:all
   ```

2. Configure environment:
   ```bash
   cp backend/.env.example backend/.env
   ```

3. Run the application:

   **Terminal 1 (Backend):**
   ```bash
   npm run dev:backend
   ```

   **Terminal 2 (Frontend):**
   ```bash
   npm run start:frontend
   ```

4. Open http://localhost:3000 in your browser

---

## Interface Overview

### Main Areas

1. **Upload Zone** (Center)
   - Drag and drop area for files
   - Click to browse files
   - Shows accepted formats

2. **Results Panel** (Below upload)
   - Extracted JSON data
   - Expandable/collapsible sections
   - Copy to clipboard button

3. **Action Buttons** (Right side)
   - Download as PDF
   - Download as DOCX
   - Download as HTML
   - Export to Excel

4. **Status Bar** (Top)
   - AI provider indicator (Gemini/Ollama)
   - Processing status
   - Warnings/notices

---

## Uploading Resumes

### Supported File Types

| Category | Formats |
|----------|---------|
| Documents | PDF, DOCX, DOC, RTF, TXT, HTML, ODT, MD |
| Images | JPG, JPEG, PNG, WEBP, SVG |

### How to Upload

**Method 1: Drag and Drop**
1. Drag your resume file onto the upload zone
2. Release to start processing
3. Wait for extraction to complete

**Method 2: Click to Browse**
1. Click the upload zone
2. Select your resume file
3. Wait for extraction to complete

### Upload Tips

- **File size**: Maximum 10MB recommended
- **Single file**: Upload one resume at a time
- **Clear scans**: For image resumes, use clear, high-resolution scans
- **Multi-page PDFs**: Fully supported

---

## Viewing Results

### Extracted Data Structure

The extracted JSON contains these main sections:

#### Personal Information
- Full name
- Email address
- Phone number
- Location (city, state, country)
- LinkedIn URL
- GitHub URL
- Portfolio/website

#### Summary & Objective
- Professional summary
- Career objective

#### Work Experience
- Job titles
- Company names
- Employment dates
- Responsibilities (bullet points)
- Achievements (quantified results)

#### Education
- Degrees obtained
- Institutions
- Graduation dates
- GPA (if available)
- Relevant coursework

#### Skills
- **Technical Skills**: Programming languages, frameworks, databases, tools, cloud platforms
- **Soft Skills**: Communication, leadership, etc.

#### Additional Sections
- Projects
- Certifications
- Awards & Honors
- Publications
- Languages
- Volunteer Experience
- Interests

### Navigating Results

- **Click sections** to expand/collapse
- **Copy button** for each section
- **Copy All** to get complete JSON
- **Search** within results (browser find)

---

## Exporting Data

### Download as PDF
Creates an ATS-friendly PDF resume:
1. Click "Download PDF"
2. File saves automatically
3. Open to verify formatting

### Download as DOCX
Creates an editable Word document:
1. Click "Download DOCX"
2. Opens in Word for editing
3. Customize as needed

### Download as HTML
Creates a web-ready HTML file:
1. Click "Download HTML"
2. Opens in browser
3. Save or print from browser

### Export to Excel
Creates a spreadsheet with all resumes:
1. Upload multiple resumes
2. Click "Export All to Excel"
3. Opens in Excel with structured columns
4. Use for bulk processing

### Export to ZIP
Downloads all extracted data as ZIP:
1. Process multiple resumes
2. Click "Export ZIP"
3. Contains JSON for each resume

---

## AI Features

### How AI Extraction Works

1. File is parsed to extract text or convert to images
2. Text/images are sent to AI (Gemini or Ollama)
3. AI analyzes content and returns structured JSON
4. Data is canonicalized to standard format

### AI Provider Setup

**Option 1: Google Gemini API (Recommended)**

Best for:
- Image resumes (scans, photos)
- PDF resumes
- Highest accuracy

Setup:
1. Get free API key: https://aistudio.google.com/app/apikey
2. Add to `backend/.env`:
   ```
   GEMINI_API_KEY=your_key_here
   ```
3. Restart the backend

**Option 2: Local Ollama**

Best for:
- Privacy-sensitive extractions
- Offline operation
- No API costs

Setup:
1. Install Ollama: https://ollama.com
2. Pull model: `ollama pull gemma4`
3. Keep `GEMINI_API_KEY` empty in `.env`
4. Ensure Ollama is running

### Vision Capabilities

When using Gemini:
- **PDFs**: Read directly as images (each page)
- **Images**: Analyze visual content
- **Text**: OCR fallback if needed

### Fallback Processing

If AI extraction fails:
1. System attempts local regex parsing
2. Extracts basic fields (name, email, phone)
3. Returns partial data with `fallback: true` flag

---

## Tips & Best Practices

### For Best Extraction Results

1. **Use clear, complete resumes**
   - Full contact information
   - Complete work history
   - Education details

2. **Standard formats work best**
   - PDF is ideal
   - DOCX is good alternative
   - Avoid images if possible

3. **For image resumes**
   - Use high-resolution scans (300 DPI)
   - Ensure text is readable
   - Avoid shadows and glare
   - Use PNG or JPG format

4. **Multi-page PDFs**
   - All pages are processed
   - Information is combined
   - Page order matters

### For AI Accuracy

1. **Provide complete information**
   - More data = better extraction
   - Include all relevant sections

2. **Use standard section headings**
   - EXPERIENCE, EDUCATION, SKILLS
   - Helps AI identify sections

3. **Avoid unusual formatting**
   - Tables can be tricky
   - Two-column layouts work
   - Graphics may not parse

### For Export

1. **Choose the right format**
   - **PDF**: Submit to job portals (ATS-friendly)
   - **DOCX**: When asked for editable file
   - **HTML**: For web publishing

2. **Review before submitting**
   - Open exported files
   - Check formatting
   - Verify content accuracy

---

## Troubleshooting

### Upload Issues

**Problem**: File won't upload

**Solutions**:
- Check file format is supported
- Ensure file is under 10MB
- Try a different file
- Check browser console for errors

**Problem**: "Unsupported file type"

**Solutions**:
- Convert to PDF or DOCX
- Check file extension
- Verify file is not corrupted

### Extraction Issues

**Problem**: Extraction takes very long

**Solutions**:
- Gemini: Wait for rate limiting (6+ seconds)
- Ollama: Check if model is downloaded
- Try smaller file

**Problem**: Extraction fails completely

**Solutions**:
- Check AI configuration in `.env`
- Verify API key (Gemini) or running service (Ollama)
- Try a different file format

**Problem**: Data looks wrong or missing

**Solutions**:
- Try with a different file
- Check if resume has standard formatting
- Review warnings in response
- Use manual review

### AI Issues

**Problem**: "Rate limit exceeded"

**Solutions**:
- Wait 10-15 seconds between requests
- This is normal for free Gemini tier
- Consider using Ollama

**Problem**: AI shows offline

**Solutions**:
- Check `GEMINI_API_KEY` in `.env`
- If using Ollama, ensure `ollama serve` is running
- Restart backend server

### Export Issues

**Problem**: PDF download is blank

**Solutions**:
- Try DOCX format instead
- Check if extraction succeeded
- Use different browser

**Problem**: Excel export missing data

**Solutions**:
- Ensure extraction completed
- Check JSON has all fields
- Try exporting individual resume

---

## Advanced Features

### Bulk Processing

Process multiple resumes:
1. Use the API endpoints directly
2. Or process files in sequence via UI
3. Export all to Excel for comparison

### API Usage

Direct API access:
```bash
# Extract resume
curl -X POST http://localhost:5000/api/extract \
  -F "resume=@resume.pdf"

# Download as PDF
curl -X POST http://localhost:5000/api/download \
  -H "Content-Type: application/json" \
  -d '{"resumeData": {...}, "format": "pdf"}'
```

### Validation Tools

Run validation scripts:
```bash
cd backend
node tests/validateExtraction.js
node tests/accuracyTest.js
```

---

## Understanding the Output

### JSON Schema

The extracted data follows a strict schema:
- All fields present (even if empty)
- Consistent date formats
- Skill categorization
- Proper array structures

### Field Descriptions

| Field | Description |
|-------|-------------|
| `is_resume` | Boolean - is this a valid resume |
| `personal_info` | Contact and profile information |
| `summary` | Professional summary |
| `education` | Array of education entries |
| `work_experience` | Array of job entries |
| `technical_skills` | Categorized technical skills |
| `soft_skills` | Soft skill array |
| `projects` | Notable projects |
| `certifications` | Professional certifications |
| `awards_honors` | Awards and recognition |
| `languages` | Spoken languages |

---

## Need Help?

- Check the main README
- Review technical docs in `/docs`
- Open an issue on GitHub

---

*Resume Extractor - AI-powered resume parsing made simple*