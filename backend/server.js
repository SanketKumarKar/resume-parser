import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { extractTextFromFile } from "./fileParser.js";
import { extractResumeData } from "./aiService.js";
import { extractLocalData } from "./localParser.js";
import { canonicalizeResumeData } from "./resumeCanonicalizer.js";
import { generateResumePDF } from "./resumeDownloadService.js";
import { generateResumeHTML } from "./resumeHtmlTemplate.js";
import { generateResumeDocx } from "./resumeDocxTemplate.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Multer setup — store uploads in /tmp
const upload = multer({
  dest: path.join(__dirname, "tmp"),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
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

// Main extraction endpoint
app.post("/api/extract", upload.single("resume"), async (req, res) => {
  const filePath = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    const { originalname, mimetype } = req.file;

    // Step 1: Extract text from file
    const { text, isPdf, isImage, sourceType, warnings = [] } = await extractTextFromFile(
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
        originalname
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

// Download resume as PDF endpoint
app.post("/api/download", express.json(), async (req, res) => {
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
