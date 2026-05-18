import fs from "fs";
import os from "os";
import path from "path";
import mammoth from "mammoth";//docx parser
import pdfParse from "pdf-parse";
import { parse as parseHTML } from "node-html-parser";
import WordExtractor from "word-extractor"; //doc parser for older .doc files
import Tesseract from "tesseract.js"; // OCR for images
import { Readable } from "stream";
import { execFile } from "child_process";
import { promisify } from "util";

const MIN_USABLE_TEXT_LENGTH = 80; // Minimum length of text to consider it a successful extraction, otherwise fallback to vision for images and SVGs.
const execFileAsync = promisify(execFile);

export async function extractTextFromFile(filePath, mimeType, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const buffer = fs.readFileSync(filePath);
  const warnings = [];

  try {
    // PDF
    if (ext === ".pdf" || mimeType === "application/pdf") {
      const data = await pdfParse(buffer);
      return {
        text: cleanExtractedText(data.text),
        isPdf: true,
        isImage: false,
        buffer,
        sourceType: "pdf_text",
        warnings,
      };
    }

    // SVG
    if (ext === ".svg" || mimeType === "image/svg+xml") {
      const text = extractSvgText(buffer.toString("utf8"));
      if (text.length >= MIN_USABLE_TEXT_LENGTH) {
        return {
          text,
          isPdf: false,
          isImage: false,
          buffer,
          sourceType: "svg_text",
          warnings,
        };
      }

      warnings.push("SVG did not contain enough usable text nodes; vision fallback may be required.");
      return {
        text: null,
        isPdf: false,
        isImage: true,
        buffer,
        sourceType: "svg_image_fallback",
        warnings,
      };
    }

    // Raster image OCR first; direct vision is only a fallback.
    if (
      ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp" ||
      mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp"
    ) {
      const text = await extractImageText(filePath, buffer);
      if (text.length >= MIN_USABLE_TEXT_LENGTH) {
        return {
          text,
          isPdf: false,
          isImage: false,
          buffer,
          sourceType: "image_ocr",
          warnings,
        };
      }

      warnings.push("OCR did not produce enough usable text; vision fallback may be required.");
      return {
        text: null,
        isPdf: false,
        isImage: true,
        buffer,
        sourceType: "image_vision_fallback",
        warnings,
      };
    }

    // DOCX
    if (
      ext === ".docx" ||
      mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return {
        text: cleanExtractedText(result.value),
        isPdf: false,
        isImage: false,
        sourceType: "docx_text",
        warnings,
      };
    }

    // DOC (older Word)
    if (ext === ".doc" || mimeType === "application/msword") {
      const { text, sourceType, warning } = await extractDocText(filePath);
      if (warning) warnings.push(warning);
      return {
        text,
        isPdf: false,
        isImage: false,
        sourceType,
        warnings,
      };
    }

    // RTF
    if (ext === ".rtf" || mimeType === "application/rtf") {
      const rtfContent = buffer.toString("utf8");
      // Basic RTF strip as fallback
      const text = rtfContent.replace(/\\[a-z]+\d* ?/gi, "").replace(/[{}]/g, "");
      return {
        text: cleanExtractedText(text),
        isPdf: false,
        isImage: false,
        sourceType: "rtf_text",
        warnings,
      };
    }

    // HTML
    if (
      ext === ".html" ||
      ext === ".htm" ||
      mimeType === "text/html"
    ) {
      const root = parseHTML(buffer.toString("utf8"));
      const text = root.text;
      return {
        text: cleanExtractedText(text),
        isPdf: false,
        isImage: false,
        sourceType: "html_text",
        warnings,
      };
    }

    // ODT - extract content.xml from zip
    if (
      ext === ".odt" ||
      mimeType === "application/vnd.oasis.opendocument.text"
    ) {
      const text = await extractOdtText(buffer);
      return {
        text: cleanExtractedText(text),
        isPdf: false,
        isImage: false,
        sourceType: "odt_text",
        warnings,
      };
    }

    // Markdown & Plain Text
    if (
      ext === ".md" ||
      ext === ".txt" ||
      ext === ".markdown" ||
      mimeType === "text/plain" ||
      mimeType === "text/markdown"
    ) {
      return {
        text: cleanExtractedText(buffer.toString("utf8")),
        isPdf: false,
        isImage: false,
        sourceType: "plain_text",
        warnings,
      };
    }

    // Fallback: try as plain text
    return {
      text: cleanExtractedText(buffer.toString("utf8")),
      isPdf: false,
      isImage: false,
      sourceType: "plain_text_fallback",
      warnings,
    };
  } catch (err) {
    throw new Error(`Failed to parse file: ${err.message}`);
  }
}

function cleanExtractedText(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/â€¢|•|·|▪|◦|●/g, "-")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractDocText(filePath) {
  const errors = [];

  try {
    const extractor = new WordExtractor();
    const doc = await extractor.extract(filePath);
    const text = cleanExtractedText(doc.getBody());
    if (text.length >= MIN_USABLE_TEXT_LENGTH) {
      return { text, sourceType: "doc_text" };
    }
    errors.push("word-extractor returned empty text");
  } catch (err) {
    errors.push(err.message);
  }

  try {
    const images = extractEmbeddedImages(fs.readFileSync(filePath));
    const textParts = [];
    for (const image of images) {
      const imageText = await extractImageText(filePath, image);
      if (imageText.length >= MIN_USABLE_TEXT_LENGTH) textParts.push(imageText);
    }
    const text = cleanExtractedText(textParts.join("\n\n"));
    if (text.length >= MIN_USABLE_TEXT_LENGTH) {
      return {
        text,
        sourceType: "doc_embedded_image_ocr",
        warning: `word-extractor failed; OCRed ${textParts.length} embedded image(s) from legacy .doc (${errors.join("; ")}).`,
      };
    }
    if (images.length > 0) errors.push(`embedded image OCR returned empty text from ${images.length} image(s)`);
  } catch (err) {
    errors.push(`embedded image OCR failed: ${err.message}`);
  }

  try {
    const text = await extractDocTextWithWordAutomation(filePath);
    if (text.length >= MIN_USABLE_TEXT_LENGTH) {
      return {
        text,
        sourceType: "doc_word_automation_text",
        warning: `word-extractor failed; used Microsoft Word conversion fallback (${errors.join("; ")}).`,
      };
    }
    errors.push("Microsoft Word conversion returned empty text");
  } catch (err) {
    errors.push(`Microsoft Word conversion failed: ${err.message}`);
  }

  throw new Error(`Legacy .doc extraction failed: ${errors.join("; ")}`);
}

function extractEmbeddedImages(buffer) {
  return [
    ...extractEmbeddedPngs(buffer),
    ...extractEmbeddedJpegs(buffer),
  ].filter((image) => image.length > 10 * 1024);
}

function extractEmbeddedPngs(buffer) {
  const images = [];
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const iend = Buffer.from("IEND");
  let offset = 0;

  while ((offset = buffer.indexOf(signature, offset)) >= 0) {
    const end = buffer.indexOf(iend, offset);
    if (end < 0) break;
    images.push(buffer.subarray(offset, end + 8));
    offset = end + 8;
  }

  return images;
}

function extractEmbeddedJpegs(buffer) {
  const images = [];
  const signature = Buffer.from([0xff, 0xd8, 0xff]);
  let offset = 0;

  while ((offset = buffer.indexOf(signature, offset)) >= 0) {
    let end = offset + 2;
    while ((end = buffer.indexOf(Buffer.from([0xff, 0xd9]), end)) >= 0) {
      images.push(buffer.subarray(offset, end + 2));
      offset = end + 2;
      break;
    }
    if (end < 0) break;
  }

  return images;
}

async function extractDocTextWithWordAutomation(filePath) {
  if (process.platform !== "win32") {
    throw new Error("Microsoft Word automation is only available on Windows");
  }

  const resolvedInput = path.resolve(filePath);
  const outputDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "resume-doc-"));
  const outputPath = path.join(outputDir, `${path.basename(filePath, path.extname(filePath))}.txt`);

  const script = `
$ErrorActionPreference = "Stop"
$word = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open(${toPowerShellString(resolvedInput)}, $false, $true)
  $doc.SaveAs2(${toPowerShellString(outputPath)}, 7)
  $doc.Close($false)
} finally {
  if ($word -ne $null) {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  }
}
`;

  try {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ], { timeout: 45000, windowsHide: true });

    const raw = await fs.promises.readFile(outputPath);
    return cleanExtractedText(decodeTextBuffer(raw));
  } finally {
    await fs.promises.rm(outputDir, { recursive: true, force: true });
  }
}

function toPowerShellString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function decodeTextBuffer(buffer) {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString("utf16le");
    if (buffer[0] === 0xfe && buffer[1] === 0xff) return buffer.swap16().toString("utf16le");
  }
  return buffer.toString("utf8");
}

async function extractImageText(filePath, buffer) {
  const langPath = path.resolve(process.cwd(), "..");
  const hasLocalLanguage = fs.existsSync(path.join(langPath, "eng.traineddata"));

  const options = hasLocalLanguage
    ? {
        langPath,
        cachePath: langPath,
        gzip: false,
        logger: () => {},
      }
    : {
        logger: () => {},
      };

  const result = await Tesseract.recognize(buffer || filePath, "eng", options);
  return cleanExtractedText(result?.data?.text || "");
}

function extractSvgText(svgContent) {
  const withoutNoise = svgContent
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<defs[\s\S]*?<\/defs>/gi, " ")
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, " ")
    .replace(/<path\b[\s\S]*?\/?>/gi, " ");

  const root = parseHTML(withoutNoise, {
    lowerCaseTagName: true,
    comment: false,
  });
  const items = [];

  for (const node of root.querySelectorAll("text")) {
    const base = getSvgPoint(node);
    const tspans = node.querySelectorAll("tspan");

    if (tspans.length > 0) {
      tspans.forEach((tspan, index) => {
        const point = getSvgPoint(tspan, base);
        addSvgTextItem(items, tspan.text, point.x, point.y, index);
      });
    } else {
      addSvgTextItem(items, node.text, base.x, base.y, 0);
    }
  }

  if (items.length === 0) {
    const fallbackText = cleanExtractedText(root.text);
    return looksLikeSvgNoise(fallbackText) ? "" : fallbackText;
  }

  items.sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > 4) return yDiff;
    const xDiff = a.x - b.x;
    if (Math.abs(xDiff) > 2) return xDiff;
    return a.index - b.index;
  });

  const lines = [];
  let currentLine = [];
  let currentY = null;

  for (const item of items) {
    if (currentY === null || Math.abs(item.y - currentY) <= 4) {
      currentLine.push(item);
      currentY = currentY === null ? item.y : currentY;
    } else {
      lines.push(joinSvgLine(currentLine));
      currentLine = [item];
      currentY = item.y;
    }
  }
  if (currentLine.length > 0) lines.push(joinSvgLine(currentLine));

  return cleanExtractedText(lines.filter(Boolean).join("\n"));
}

function addSvgTextItem(items, rawText, x, y, index) {
  const text = cleanExtractedText(rawText);
  if (!text) return;
  items.push({ text, x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0, index: items.length + index });
}

function joinSvgLine(items) {
  return items
    .sort((a, b) => a.x - b.x)
    .map((item) => item.text)
    .join(" ")
    .replace(/\s+([,.;:])/g, "$1");
}

function getSvgPoint(node, fallback = { x: 0, y: 0 }) {
  const transform = node.getAttribute("transform") || "";
  const matrix = transform.match(/matrix\(([^)]+)\)/i);
  const translate = transform.match(/translate\(([^)]+)\)/i);
  let x = numberAttr(node, "x", fallback.x);
  let y = numberAttr(node, "y", fallback.y);

  if (matrix) {
    const parts = matrix[1].split(/[,\s]+/).map(Number).filter(Number.isFinite);
    if (parts.length >= 6) {
      x = parts[4];
      y = parts[5];
    }
  } else if (translate) {
    const parts = translate[1].split(/[,\s]+/).map(Number).filter(Number.isFinite);
    if (parts.length >= 1) x = parts[0];
    if (parts.length >= 2) y = parts[1];
  }

  return { x, y };
}

function numberAttr(node, attr, fallback) {
  const raw = node.getAttribute(attr);
  if (raw === undefined || raw === null || raw === "") return fallback;
  const first = String(raw).split(/[,\s]+/).find(Boolean);
  const value = Number(first);
  return Number.isFinite(value) ? value : fallback;
}

function looksLikeSvgNoise(text) {
  if (!text) return true;
  const longBase64Runs = (text.match(/[A-Za-z0-9+/=]{200,}/g) || []).length;
  return longBase64Runs > 0 || text.length > 50000;
}

async function extractOdtText(buffer) {
  const unzipper = await import("unzipper");
  return new Promise((resolve, reject) => {
    const readable = Readable.from(buffer);
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
