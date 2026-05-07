import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { extractTextFromFile } from "./fileParser.js";
import { extractResumeData } from "./geminiService.js";

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
    ];
    const allowedExts = [
      ".pdf", ".docx", ".doc", ".rtf", ".txt", ".html", ".htm", ".odt", ".md", ".markdown", ".jpg", ".jpeg", ".png", ".webp"
    ];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowed.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Unsupported file type: ${ext}. Supported: PDF, DOCX, DOC, RTF, TXT, HTML, ODT, MD, JPG, PNG, WEBP`
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
    if (!apiKey) {
      return res.status(400).json({
        error: "Gemini API key is missing. Provide it in the request header x-api-key or in .env",
      });
    }

    const { originalname, mimetype } = req.file;

    // Step 1: Extract text from file
    const { text, isPdf, isImage, buffer } = await extractTextFromFile(
      filePath,
      mimetype,
      originalname
    );

    if (!text && !isPdf && !isImage) {
      return res.status(422).json({ error: "Could not extract text or image from file." });
    }

    // Step 2: Send to Gemini
    const resumeData = await extractResumeData(
      apiKey,
      text,
      isPdf,
      isImage,
      mimetype,
      filePath,
      originalname
    );

    res.json({
      success: true,
      filename: originalname,
      data: resumeData,
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
