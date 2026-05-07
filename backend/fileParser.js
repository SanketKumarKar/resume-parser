import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { parse as parseHTML } from "node-html-parser";

export async function extractTextFromFile(filePath, mimeType, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const buffer = fs.readFileSync(filePath);

  try {
    // PDF
    if (ext === ".pdf" || mimeType === "application/pdf") {
      const data = await pdfParse(buffer);
      return { text: data.text, isPdf: true, buffer };
    }

    // Image
    if (
      ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp" ||
      mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp"
    ) {
      return { text: null, isPdf: false, isImage: true, buffer };
    }

    // DOCX
    if (
      ext === ".docx" ||
      mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value, isPdf: false };
    }

    // DOC (older Word) - mammoth handles basic .doc too
    if (ext === ".doc" || mimeType === "application/msword") {
      try {
        const result = await mammoth.extractRawText({ buffer });
        return { text: result.value, isPdf: false };
      } catch {
        return {
          text: buffer.toString("utf8").replace(/[^\x20-\x7E\n\r\t]/g, " "),
          isPdf: false,
        };
      }
    }

    // RTF
    if (ext === ".rtf" || mimeType === "application/rtf") {
      const rtfContent = buffer.toString("utf8");
      // Basic RTF strip as fallback
      const text = rtfContent.replace(/\\[a-z]+\d* ?/gi, "").replace(/[{}]/g, "");
      return { text, isPdf: false };
    }

    // HTML
    if (
      ext === ".html" ||
      ext === ".htm" ||
      mimeType === "text/html"
    ) {
      const root = parseHTML(buffer.toString("utf8"));
      const text = root.text;
      return { text, isPdf: false };
    }

    // ODT - extract content.xml from zip
    if (
      ext === ".odt" ||
      mimeType === "application/vnd.oasis.opendocument.text"
    ) {
      const text = await extractOdtText(buffer);
      return { text, isPdf: false };
    }

    // Markdown & Plain Text
    if (
      ext === ".md" ||
      ext === ".txt" ||
      ext === ".markdown" ||
      mimeType === "text/plain" ||
      mimeType === "text/markdown"
    ) {
      return { text: buffer.toString("utf8"), isPdf: false };
    }

    // Fallback: try as plain text
    return {
      text: buffer.toString("utf8"),
      isPdf: false,
    };
  } catch (err) {
    throw new Error(`Failed to parse file: ${err.message}`);
  }
}

async function extractOdtText(buffer) {
  const unzipper = await import("unzipper");
  return new Promise((resolve, reject) => {
    const chunks = [];
    const readable = require("stream").Readable.from(buffer);
    readable
      .pipe(unzipper.Parse())
      .on("entry", (entry) => {
        if (entry.path === "content.xml") {
          const xmlChunks = [];
          entry.on("data", (d) => xmlChunks.push(d));
          entry.on("end", () => {
            const xml = Buffer.concat(xmlChunks).toString("utf8");
            // Strip XML tags
            const text = xml
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            resolve(text);
          });
        } else {
          entry.autodrain();
        }
      })
      .on("error", reject)
      .on("finish", () => resolve(""));
  });
}
