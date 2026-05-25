import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import XLSX from "xlsx";
import AdmZip from "adm-zip";
import { extractTextFromFile } from "./services/fileParser.js";
import { extractResumeData } from "./services/aiService.js";
import { extractLocalData } from "./services/localParser.js";
import { canonicalizeResumeData } from "./services/resumeCanonicalizer.js";
import { generateResumePDF } from "./templates/resumeDownloadService.js";
import { generateResumeHTML } from "./templates/resumeHtmlTemplate.js";
import { generateResumeDocx } from "./templates/resumeDocxTemplate.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "100gb" }));
app.use(express.urlencoded({ limit: "100gb", extended: true }));



// Multer setup — store uploads in /tmp
const upload = multer({
  dest: path.join(__dirname, "tmp"),
  // limits: { fileSize: 100 * 1024 * 1024 * 1024 }, // No strict limit, or large enough
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "application/rtf",
      "text/rtf",
      "text/plain",
      "text/html",
      "text/markdown",
      "application/vnd.oasis.opendocument.text",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/svg+xml",
    ];
    const allowedExts = [
      ".pdf", ".docx", ".doc", ".rtf", ".txt", ".html", ".htm", ".odt", ".md", ".markdown", ".jpg", ".jpeg", ".png", ".webp", ".svg"
    ];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowed.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Unsupported file type: ${ext}. Supported: PDF, DOCX, DOC, RTF, TXT, HTML, ODT, MD, JPG, PNG, WEBP, SVG`
        )
      );
    }
  },
});

// Ensure tmp folder exists
const tmpDir = path.join(__dirname, "tmp");
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Resume Extractor API is running" });
});

/**
 * POST /api/extract
 * Main endpoint to process a single uploaded resume.
 * Accepts multipart/form-data with a single file named 'resume'.
 * Uses Gemini AI to extract data, with a fallback to local regex-based parsing.
 */
app.post("/api/extract", upload.single("resume"), async (req, res) => {
  const filePath = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    const { originalname, mimetype } = req.file;

    // Step 1: Extract text from file
    const { text, isPdf, isImage, sourceType, pageCount, buffer: fileBuffer, warnings = [], images: extractedImages = [] } = await extractTextFromFile(
      filePath,
      mimetype,
      originalname
    );

    if (!text && !isPdf && !isImage) {
      return res.status(422).json({ error: "Could not extract text or image from file." });
    }

    // Step 2: Send to AI service (with Local Fallback)
    let resumeData;
    let usedFallback = false;

    try {
      resumeData = await extractResumeData(
        apiKey,
        text,
        isPdf,
        isImage,
        mimetype,
        filePath,
        originalname,
        pageCount || 0,
        fileBuffer,
        extractedImages
      );
    } catch (apiError) {
      console.warn("⚠️ AI extraction failed, falling back to local parsing:", apiError.message);
      
      // Local fallback only works if we have text
      if (text) {
        resumeData = canonicalizeResumeData(extractLocalData(text));
        usedFallback = true;
      } else {
        // If it was a pure image/PDF and AI extraction failed, we might have no text
        throw new Error(`API failed and no local text available for fallback: ${apiError.message}`);
      }
    }

    if (resumeData && resumeData.is_resume === false) {
      return res.status(400).json({ error: "No data found upload a valid resume" });
    }

    res.json({
      success: true,
      filename: originalname,
      data: resumeData,
      fallback: usedFallback,
      sourceType,
      textLength: text ? text.length : 0,
      warnings,
    });
  } catch (err) {
    console.error("Extraction error:", err);
    res.status(500).json({
      error: err.message || "Internal server error during extraction.",
    });
  } finally {
    // Cleanup temp file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

/**
 * POST /api/download
 * Endpoint to download extracted resume data in a formatted file.
 * Formats supported: 'pdf' (default), 'html', 'docx'.
 */
app.post("/api/download", async (req, res) => {
  try {
    const { resumeData, filename, format = "pdf" } = req.body;

    if (!resumeData) {
      return res
        .status(400)
        .json({ error: "Resume data is required. Please extract a resume first." });
    }

    const sanitizedFilename = (filename || "resume")
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();

    if (format === "docx") {
      // Generate DOCX
      const docxBuffer = await generateResumeDocx(resumeData);

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${sanitizedFilename}_formatted.docx"`
      );

      res.send(docxBuffer);
    } else if (format === "html") {
      // Generate HTML
      const htmlContent = generateResumeHTML(resumeData);

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${sanitizedFilename}_formatted.html"`
      );

      res.send(htmlContent);
    } else {
      // Generate PDF (default)
      const pdfDoc = generateResumePDF(resumeData);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizedFilename}_formatted.pdf"`);

      pdfDoc.pipe(res);
    }
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({
      error: err.message || "Failed to generate resume.",
    });
  }
});

// ─── Bulk Folder Extraction Support ──────────────────────────────────────────

const SUPPORTED_EXTS = new Set([
  ".pdf", ".docx", ".doc", ".rtf", ".txt", ".html", ".htm",
  ".odt", ".md", ".markdown", ".jpg", ".jpeg", ".png", ".webp", ".svg",
]);

const MIME_TYPES = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".rtf": "application/rtf",
  ".txt": "text/plain",
  ".html": "text/html",
  ".htm": "text/html",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function discoverFilesRecursive(dir) {
  const results = [];
  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    const stats = fs.statSync(currentDir);
    if (!stats.isDirectory()) return;

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.name.startsWith("~$")) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTS.has(ext)) {
        results.push({
          fullPath,
          name: entry.name,
          ext,
          size: fs.statSync(fullPath).size,
        });
      }
    }
  }
  walk(dir);
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

function flattenResumeForExcel(resume, filename) {
  if (!resume) return {};
  
  const info = resume.personal_info || {};
  
  // Extract and normalize skills
  let techSkillsList = [];
  let softSkillsList = [];
  
  if (resume.technical_skills) {
    const tech = resume.technical_skills;
    Object.values(tech).forEach(val => {
      if (Array.isArray(val)) {
        techSkillsList.push(...val);
      }
    });
  }
  
  if (Array.isArray(resume.soft_skills)) {
    softSkillsList.push(...resume.soft_skills);
  }
  
  // Unique, clean skills
  const cleanTechSkills = [...new Set(techSkillsList.map(s => String(s).trim()).filter(Boolean))];
  const cleanSoftSkills = [...new Set(softSkillsList.map(s => String(s).trim()).filter(Boolean))];

  // Summarize education
  const eduList = (resume.education || []).map(edu => {
    const degree = edu.degree || edu.qualification || "";
    const field = edu.field_of_study || edu.major || "";
    const inst = edu.institution || edu.university || edu.school || "";
    const dates = [edu.start_date, edu.end_date].filter(Boolean).join(" - ");
    return `${degree}${field ? ' in ' + field : ''} (${inst})${dates ? ' [' + dates + ']' : ''}`;
  }).join(" | ");

  // Summarize work experience
  const expList = (resume.work_experience || []).map(exp => {
    const title = exp.job_title || exp.position || "";
    const comp = exp.company || "";
    const start = exp.start_date || "";
    const end = exp.end_date || "";
    return `${title} at ${comp} (${start} - ${end})`;
  }).join(" | ");

  // Summarize projects
  const projList = (resume.projects || []).map(p => {
    const name = p.name || p.title || "";
    const tech = Array.isArray(p.technologies_used) ? p.technologies_used.join(", ") : "";
    return `${name}${tech ? ' [' + tech + ']' : ''}`;
  }).filter(Boolean).join(" | ");

  // Summarize certifications
  const certList = (resume.certifications || []).map(c => {
    const name = c.name || "";
    const issuer = c.issuing_organization || c.issuer || "";
    return `${name}${issuer ? ' (' + issuer + ')' : ''}`;
  }).filter(Boolean).join(", ");

  // Summarize languages
  const langList = (resume.languages || []).map(l => {
    const lang = l.language || l.name || "";
    const prof = l.proficiency || "";
    return `${lang}${prof ? ' (' + prof + ')' : ''}`;
  }).filter(Boolean).join(", ");

  // Summarize awards
  const awardsList = (resume.awards_honors || []).map(a => {
    const title = a.title || "";
    const issuer = a.issuer || "";
    return `${title}${issuer ? ' (' + issuer + ')' : ''}`;
  }).filter(Boolean).join(", ");
  
  // Summarize references
  const refList = (resume.references || []).map(r => {
    const name = r.name || "";
    const title = r.title || "";
    const comp = r.company || "";
    return `${name}${title ? ' - ' + title : ''}${comp ? ' at ' + comp : ''}`;
  }).filter(Boolean).join(" | ");

  return {
    "Filename": filename || "",
    "Full Name": resume.full_name || info.full_name || "",
    "Email": resume.email || info.email || "",
    "Phone": resume.phone || info.phone || "",
    "Address": resume.address || info.address || "",
    "City": info.city || "",
    "State": info.state || "",
    "Country": info.country || "",
    "Zip Code": info.zip_code || "",
    "LinkedIn": resume.linkedin_url || info.linkedin || info.linkedin_url || "",
    "GitHub": resume.github_url || info.github || info.github_url || "",
    "Portfolio/Website": resume.portfolio_url || info.portfolio || resume.website || "",
    "Objective": resume.objective || "",
    "Summary": resume.summary || "",
    "Degrees/Education": eduList,
    "Work Experience": expList,
    "Technical Skills": cleanTechSkills.join(", "),
    "Soft Skills": cleanSoftSkills.join(", "),
    "Projects": projList,
    "Certifications": certList,
    "Awards/Honors": awardsList,
    "Languages": langList,
    "References": refList
  };
}

/**
 * POST /api/scan-folder
 * Recursively scans a local directory path to discover supported files for bulk extraction.
 */
app.post("/api/scan-folder", (req, res) => {
  const { folderPath } = req.body;

  if (!folderPath) {
    return res.status(400).json({ error: "Folder path is required." });
  }

  try {
    const resolvedPath = path.resolve(folderPath);

    if (!fs.existsSync(resolvedPath)) {
      return res.status(400).json({ error: `The folder path does not exist: ${folderPath}` });
    }

    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: `The path is not a directory: ${folderPath}` });
    }

    const files = discoverFilesRecursive(resolvedPath);

    res.json({
      success: true,
      folderPath: resolvedPath,
      count: files.length,
      files,
    });
  } catch (err) {
    console.error("Scan folder error:", err);
    res.status(500).json({ error: err.message || "Failed to scan directory." });
  }
});

/**
 * POST /api/extract-local-file
 * Processes a single file from a local path without requiring a file upload.
 * Used during the bulk extraction process.
 */
app.post("/api/extract-local-file", async (req, res) => {
  const { filePath } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: "File path is required." });
  }

  try {
    const resolvedPath = path.resolve(filePath);

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: `File not found: ${filePath}` });
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";
    const originalname = path.basename(resolvedPath);

    const apiKey = process.env.GEMINI_API_KEY;

    // Step 1: Extract text from file
    const { text, isPdf, isImage, sourceType, pageCount, buffer: fileBuffer, warnings = [], images: extractedImages = [] } = await extractTextFromFile(
      resolvedPath,
      mimeType,
      originalname
    );

    if (!text && !isPdf && !isImage) {
      return res.status(422).json({ error: "Could not extract text or image from file." });
    }

    // Step 2: Send to AI service (with Local Fallback)
    let resumeData;
    let usedFallback = false;

    try {
      resumeData = await extractResumeData(
        apiKey,
        text,
        isPdf,
        isImage,
        mimeType,
        resolvedPath,
        originalname,
        pageCount || 0,
        fileBuffer,
        extractedImages
      );
    } catch (apiError) {
      console.warn("⚠️ AI extraction failed, falling back to local parsing:", apiError.message);
      
      // Local fallback only works if we have text
      if (text) {
        resumeData = canonicalizeResumeData(extractLocalData(text));
        usedFallback = true;
      } else {
        throw new Error(`API failed and no local text available for fallback: ${apiError.message}`);
      }
    }

    if (resumeData && resumeData.is_resume === false) {
      return res.status(400).json({ error: "invalid" });
    }

    res.json({
      success: true,
      filename: originalname,
      filePath: resolvedPath,
      data: resumeData,
      fallback: usedFallback,
      sourceType,
      textLength: text ? text.length : 0,
      warnings,
    });
  } catch (err) {
    console.error("Local file extraction error:", err);
    res.status(500).json({
      error: err.message || "Failed to extract local resume.",
    });
  }
});

// Export array of resumes to Excel
app.post("/api/export-excel", (req, res) => {
  const { resumes } = req.body;

  if (!resumes || !Array.isArray(resumes)) {
    return res.status(400).json({ error: "Invalid resumes data. Expected an array." });
  }

  try {
    const rows = resumes.map(item => flattenResumeForExcel(item.data, item.filename));

    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Apply auto-column widths
    const colWidths = [];
    if (rows.length > 0) {
      const keys = Object.keys(rows[0]);
      for (const key of keys) {
        let maxLen = key.length;
        for (const row of rows) {
          const val = String(row[key] || "");
          if (val.length > maxLen) maxLen = val.length;
        }
        colWidths.push({ wch: Math.min(Math.max(maxLen + 2, 10), 50) });
      }
      worksheet["!cols"] = colWidths;
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Candidates");

    const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=\"extracted_resumes.xlsx\"");
    res.send(excelBuffer);
  } catch (err) {
    console.error("Excel export error:", err);
    res.status(500).json({ error: err.message || "Failed to generate Excel file." });
  }
});

// Export array of resumes to ZIP of JSONs
app.post("/api/export-zip", (req, res) => {
  const { resumes } = req.body;

  if (!resumes || !Array.isArray(resumes)) {
    return res.status(400).json({ error: "Invalid resumes data. Expected an array." });
  }

  try {
    const zip = new AdmZip();

    for (const item of resumes) {
      if (!item.filename || !item.data) continue;
      const baseName = path.basename(item.filename, path.extname(item.filename));
      const jsonContent = JSON.stringify(item.data, null, 2);
      zip.addFile(`${baseName}_extracted.json`, Buffer.from(jsonContent, "utf-8"));
    }

    const zipBuffer = zip.toBuffer();

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=\"extracted_resumes_json.zip\"");
    res.send(zipBuffer);
  } catch (err) {
    console.error("ZIP export error:", err);
    res.status(500).json({ error: err.message || "Failed to generate ZIP file." });
  }
});

// Multer error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message?.includes("Unsupported")) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`✅ Resume Extractor API running on http://localhost:${PORT}`);
});
