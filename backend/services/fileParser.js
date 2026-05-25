import fs from "fs";
import os from "os";
import path from "path";
import mammoth from "mammoth";//docx parser
import pdfParse from "pdf-parse";
import AdmZip from "adm-zip";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { parse as parseHTML } from "node-html-parser";
import WordExtractor from "word-extractor"; //doc parser for older .doc files
import Tesseract from "tesseract.js"; // OCR for images
import { Readable } from "stream";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath, pathToFileURL } from "url";

const MIN_USABLE_TEXT_LENGTH = 80; // Minimum length of text to consider it a successful extraction, otherwise fallback to OCR or vision.
const MAX_PDF_OCR_PAGES = 5;
const MAX_PDF_VISION_PAGES = 10; // Maximum pages to render as images for direct vision
const PDF_OCR_VIEWPORT_SCALE = 2;
const PDF_VISION_VIEWPORT_SCALE = 1.5; // Lower scale for vision (model can read fine, saves memory)
const execFileAsync = promisify(execFile);

/**
 * Extracts text from various file formats (PDF, DOCX, DOC, RTF, HTML, MD, Images, etc.).
 * Implements fallback mechanisms like OCR or spatial text extraction depending on file type and initial extraction success.
 * 
 * @param {string} filePath - Absolute or relative path to the uploaded file.
 * @param {string} mimeType - MIME type of the file.
 * @param {string} originalName - Original filename.
 * @returns {Promise<Object>} An object containing the extracted text, file metadata, and extraction warnings.
 */
export async function extractTextFromFile(filePath, mimeType, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const buffer = fs.readFileSync(filePath);
  const warnings = [];

  try {
    // PDF — Use spatial text reconstruction for proper multi-column reading order
    if (ext === ".pdf" || mimeType === "application/pdf") {
      // Get page count early using pdfjs
      let pageCount = 0;
      try {
        const quickDoc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
        pageCount = quickDoc.numPages;
        await quickDoc.destroy();
      } catch { /* ignore — pageCount stays 0 */ }

      // Primary: spatial reconstruction via pdfjs-dist (handles multi-column layouts)
      let spatialText = "";
      try {
        spatialText = await extractPdfTextSpatial(buffer, warnings);
      } catch (err) {
        warnings.push(`Spatial PDF extraction failed: ${err.message}; falling back to pdf-parse.`);
      }

      if (spatialText && spatialText.length >= MIN_USABLE_TEXT_LENGTH) {
        return {
          text: spatialText,
          isPdf: true,
          isImage: false,
          buffer,
          pageCount,
          sourceType: "pdf_spatial",
          warnings,
        };
      }

      // Fallback: simple pdf-parse stream-order extraction
      const data = await pdfParse(buffer);
      const parsedText = cleanExtractedText(data.text);
      if (parsedText.length >= MIN_USABLE_TEXT_LENGTH) {
        if (spatialText) warnings.push("Spatial extraction produced less text than pdf-parse; using pdf-parse output.");
        return {
          text: parsedText,
          isPdf: true,
          isImage: false,
          buffer,
          pageCount,
          sourceType: "pdf_text",
          warnings,
        };
      }

      warnings.push("PDF did not contain enough embedded text; attempting OCR on rendered pages.");
      const ocrText = await extractPdfTextWithOcr(filePath, buffer, warnings);
      return {
        text: ocrText || parsedText || spatialText,
        isPdf: true,
        isImage: false,
        buffer,
        pageCount,
        sourceType: ocrText.length >= MIN_USABLE_TEXT_LENGTH ? "pdf_ocr" : "pdf_text",
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

    // Raster image: send directly to vision LLM, but run local OCR as supplementary context + local fallback
    if (
      ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp" ||
      mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp"
    ) {
      let ocrText = null;
      try {
        ocrText = await extractImageText(filePath, buffer);
      } catch (ocrErr) {
        warnings.push(`Image OCR fallback extraction failed: ${ocrErr.message}`);
      }

      return {
        text: ocrText,
        isPdf: false,
        isImage: true,
        buffer,
        sourceType: "image_direct_vision",
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
      const bodyText = cleanExtractedText(result.value);
      const headersFooters = cleanExtractedText(extractDocxHeadersFooters(buffer));
      const combinedText = headersFooters 
        ? `${headersFooters}\n\n${bodyText}` 
        : bodyText;

      const docxImages = extractDocxImages(buffer);

      return {
        text: combinedText,
        isPdf: false,
        isImage: false,
        buffer,
        images: docxImages,
        sourceType: "docx_text",
        warnings,
      };
    }

    // DOC (older Word)
    if (ext === ".doc" || mimeType === "application/msword") {
      const { text, sourceType, warning, images: docImages } = await extractDocText(filePath);
      if (warning) warnings.push(warning);
      return {
        text,
        isPdf: false,
        isImage: false,
        buffer,
        images: docImages || [],
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

// ---------------------------------------------------------------------------
// Spatial PDF text extraction — handles multi-column layouts correctly
// ---------------------------------------------------------------------------
// Instead of trusting the raw PDF text stream order (which interleaves columns),
// this reads every text item's (x, y) position from pdfjs-dist and reconstructs
// the text in visual reading order: top-to-bottom within each column, left column
// before right column.
// ---------------------------------------------------------------------------

const SPATIAL_LINE_Y_TOLERANCE = 3;   // pts — items within this y-range are on the same line
const SPATIAL_COLUMN_GAP_RATIO = 0.15; // minimum gap between columns as fraction of page width
const SPATIAL_MIN_COLUMN_ITEMS = 5;   // minimum items to consider a cluster a real column

async function extractPdfTextSpatial(buffer, warnings) {
  const pdfjsDir = path.dirname(requireResolve("pdfjs-dist/package.json"));
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    cMapUrl: toDirectoryFileUrl(path.join(pdfjsDir, "cmaps")),
    cMapPacked: true,
    standardFontDataUrl: toDirectoryFileUrl(path.join(pdfjsDir, "standard_fonts")),
    disableFontFace: false,
    useSystemFonts: true,
  });

  let pdfDocument;
  try {
    pdfDocument = await loadingTask.promise;
    const pageTexts = [];

    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();

      // Collect all positioned text items
      const items = [];
      for (const item of textContent.items) {
        if (!item.str || !item.str.trim()) continue;
        // item.transform = [scaleX, skewX, skewY, scaleY, translateX, translateY]
        const x = item.transform[4];
        // PDF y-coordinates increase upward; flip to top-down
        const y = viewport.height - item.transform[5];
        const width = item.width || 0;
        const height = Math.abs(item.transform[3]) || item.height || 12;
        items.push({ str: item.str, x, y, width, height });
      }

      if (items.length === 0) continue;

      // Reconstruct text with column awareness
      const pageText = reconstructPageText(items, viewport.width, warnings);
      if (pageText) pageTexts.push(pageText);

      page.cleanup();
    }

    return cleanExtractedText(pageTexts.join("\n\n"));
  } finally {
    await pdfDocument?.destroy?.();
  }
}

/**
 * Given a list of positioned text items from a single PDF page, reconstruct
 * the text in visual reading order. Detects multi-column layouts and processes
 * each column independently.
 */
function reconstructPageText(items, pageWidth, warnings) {
  // Step 1: Group items into lines by y-coordinate proximity
  const lines = groupIntoLines(items);

  // Step 2: Detect columns by analyzing x-coordinate distribution
  const columns = detectColumns(items, pageWidth);

  if (columns.length <= 1) {
    // Single-column layout: simple top-to-bottom, left-to-right
    return lines
      .sort((a, b) => a.y - b.y)
      .map((line) => lineToString(line))
      .filter(Boolean)
      .join("\n");
  }

  // Multi-column layout detected
  if (warnings) {
    warnings.push(`Detected ${columns.length}-column layout; reconstructing in reading order.`);
  }

  // Step 3: Assign each line to a column based on its items' x-coordinates
  const columnTexts = columns.map(() => []);

  for (const line of lines) {
    // Determine which column this line primarily belongs to
    const avgX = line.items.reduce((sum, it) => sum + it.x, 0) / line.items.length;
    let bestCol = 0;
    let bestDist = Infinity;
    for (let i = 0; i < columns.length; i++) {
      const dist = Math.abs(avgX - columns[i].center);
      if (dist < bestDist) {
        bestDist = dist;
        bestCol = i;
      }
    }
    columnTexts[bestCol].push(line);
  }

  // Step 4: Sort lines within each column by y, then concatenate columns left-to-right
  const result = [];
  for (let i = 0; i < columns.length; i++) {
    const colLines = columnTexts[i]
      .sort((a, b) => a.y - b.y)
      .map((line) => lineToString(line))
      .filter(Boolean);

    if (colLines.length > 0) {
      if (i > 0) result.push("---"); // Visual separator between columns
      result.push(...colLines);
    }
  }

  return result.join("\n");
}

/**
 * Group positioned text items into logical lines based on y-coordinate proximity.
 */
function groupIntoLines(items) {
  // Sort by y first, then x
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  let currentLine = null;

  for (const item of sorted) {
    if (!currentLine || Math.abs(item.y - currentLine.y) > SPATIAL_LINE_Y_TOLERANCE) {
      currentLine = { y: item.y, items: [item] };
      lines.push(currentLine);
    } else {
      currentLine.items.push(item);
      // Update line y to weighted average for stability
      const totalItems = currentLine.items.length;
      currentLine.y = currentLine.items.reduce((s, it) => s + it.y, 0) / totalItems;
    }
  }

  return lines;
}

/**
 * Detect column boundaries by analyzing the x-coordinate distribution of text items.
 * Uses a histogram/gap-based approach: find large horizontal gaps that split the page.
 */
function detectColumns(items, pageWidth) {
  if (items.length < SPATIAL_MIN_COLUMN_ITEMS * 2) {
    // Too few items to be multi-column
    return [{ left: 0, right: pageWidth, center: pageWidth / 2 }];
  }

  // Build a histogram of x-start positions
  const xPositions = items.map((it) => it.x).sort((a, b) => a - b);

  // Find significant gaps in x-positions
  const minGap = pageWidth * SPATIAL_COLUMN_GAP_RATIO;
  const gaps = [];

  // Use x-coordinate clusters: group items by x-proximity, then find gaps between groups
  const xClusters = [];
  let clusterStart = xPositions[0];
  let clusterEnd = xPositions[0];

  for (let i = 1; i < xPositions.length; i++) {
    if (xPositions[i] - clusterEnd > minGap) {
      xClusters.push({ start: clusterStart, end: clusterEnd });
      clusterStart = xPositions[i];
    }
    clusterEnd = xPositions[i];
  }
  xClusters.push({ start: clusterStart, end: clusterEnd });

  if (xClusters.length <= 1) {
    return [{ left: 0, right: pageWidth, center: pageWidth / 2 }];
  }

  // Verify each cluster has enough items to be a real column
  const validClusters = xClusters.filter((cluster) => {
    const count = items.filter(
      (it) => it.x >= cluster.start - 5 && it.x <= cluster.end + 5
    ).length;
    return count >= SPATIAL_MIN_COLUMN_ITEMS;
  });

  if (validClusters.length <= 1) {
    return [{ left: 0, right: pageWidth, center: pageWidth / 2 }];
  }

  // Build column definitions from valid clusters
  return validClusters.map((cluster, i) => {
    const left = cluster.start;
    const right = i < validClusters.length - 1
      ? (cluster.end + validClusters[i + 1].start) / 2
      : pageWidth;
    return { left, right, center: (left + right) / 2 };
  });
}

/**
 * Convert a line of positioned items into a string, sorted left-to-right.
 */
function lineToString(line) {
  const sorted = line.items.sort((a, b) => a.x - b.x);
  const parts = [];

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const text = item.str.trim();
    if (!text) continue;

    // Detect gaps between items that imply a tab/column separator
    if (i > 0) {
      const prev = sorted[i - 1];
      const gap = item.x - (prev.x + prev.width);
      if (gap > prev.height * 2) {
        // Large gap — insert a tab-like separator
        parts.push("  |  ");
      } else if (gap > prev.height * 0.3) {
        // Medium gap — insert a space
        parts.push(" ");
      }
    }
    parts.push(text);
  }

  return parts.join("").trim();
}

function extractDocxHeadersFooters(buffer) {
  try {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    let extractedText = "";

    for (const entry of zipEntries) {
      const name = entry.entryName.toLowerCase();
      if (name.startsWith("word/header") || name.startsWith("word/footer")) {
        const xml = entry.getData().toString("utf8");
        // Strip XML tags to get raw text
        const text = xml
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (text) {
          extractedText += "\n" + text;
        }
      }
    }
    return extractedText.trim();
  } catch (err) {
    console.warn("Failed to extract headers/footers from docx ZIP:", err.message);
    return "";
  }
}

async function extractDocText(filePath) {
  const errors = [];
  let extractedImagesBase64 = [];

  try {
    const images = extractEmbeddedImages(fs.readFileSync(filePath));
    extractedImagesBase64 = images.map(img => img.toString("base64"));
  } catch (err) {
    errors.push(`Failed to extract embedded images: ${err.message}`);
  }

  try {
    const extractor = new WordExtractor();
    const doc = await extractor.extract(filePath);
    const text = cleanExtractedText([
      doc.getHeaders(),
      doc.getBody(),
      doc.getFooters()
    ].filter(Boolean).join("\n\n"));
    if (text.length >= MIN_USABLE_TEXT_LENGTH) {
      return { text, sourceType: "doc_text", images: extractedImagesBase64 };
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
        images: extractedImagesBase64
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
        images: extractedImagesBase64
      };
    }
    errors.push("Microsoft Word conversion returned empty text");
  } catch (err) {
    errors.push(`Microsoft Word conversion failed: ${err.message}`);
  }

  throw new Error(`Legacy .doc extraction failed: ${errors.join("; ")}`);
}

function extractDocxImages(buffer) {
  try {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    const images = [];

    for (const entry of zipEntries) {
      const name = entry.entryName.toLowerCase();
      if (name.startsWith("word/media/") && (name.endsWith(".jpeg") || name.endsWith(".jpg") || name.endsWith(".png"))) {
        images.push(entry.getData().toString("base64"));
      }
    }
    return images;
  } catch (err) {
    console.warn("Failed to extract images from docx ZIP:", err.message);
    return [];
  }
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

async function extractPdfTextWithOcr(filePath, buffer, warnings) {
  let pdfDocument;
  try {
    const pdfjsDir = path.dirname(requireResolve("pdfjs-dist/package.json"));
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      cMapUrl: toDirectoryFileUrl(path.join(pdfjsDir, "cmaps")),
      cMapPacked: true,
      standardFontDataUrl: toDirectoryFileUrl(path.join(pdfjsDir, "standard_fonts")),
      disableFontFace: false,
      useSystemFonts: true,
    });

    pdfDocument = await loadingTask.promise;
    const pagesToProcess = Array.from(
      { length: Math.min(pdfDocument.numPages, MAX_PDF_OCR_PAGES) },
      (_, index) => index + 1
    );

    if (pagesToProcess.length === 0) {
      warnings.push("PDF OCR skipped because no renderable pages were found.");
      return "";
    }

    const textParts = [];
    for (const pageNumber of pagesToProcess) {
      const imageBuffer = await renderPdfPageToPng(pdfDocument, pageNumber);
      const pageText = await extractImageText(filePath, imageBuffer);
      if (pageText) textParts.push(pageText);
    }

    const text = cleanExtractedText(textParts.join("\n\n"));
    if (text.length < MIN_USABLE_TEXT_LENGTH) {
      warnings.push("PDF OCR completed but did not produce enough usable text.");
    }
    if (pdfDocument.numPages > MAX_PDF_OCR_PAGES) {
      warnings.push(`PDF OCR was limited to the first ${MAX_PDF_OCR_PAGES} pages.`);
    }
    return text;
  } catch (err) {
    warnings.push(`PDF OCR failed: ${err.message}`);
    return "";
  } finally {
    await pdfDocument?.destroy?.();
  }
}

async function renderPdfPageToPng(pdfDocument, pageNumber, scale = PDF_OCR_VIEWPORT_SCALE) {
  const page = await pdfDocument.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");

  await page.render({
    canvasContext: context,
    viewport,
    canvas,
  }).promise;

  page.cleanup();
  return canvas.toBuffer("image/png");
}

/**
 * Render all (or up to MAX_PDF_VISION_PAGES) pages of a PDF to PNG images.
 * Returns an array of base64-encoded PNG strings for direct model vision input.
 * Exported so aiService.js can send PDF pages as images to the AI model.
 */
export async function renderPdfPagesToImages(buffer, maxPages = MAX_PDF_VISION_PAGES) {
  const pdfjsDir = path.dirname(requireResolve("pdfjs-dist/package.json"));
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    cMapUrl: toDirectoryFileUrl(path.join(pdfjsDir, "cmaps")),
    cMapPacked: true,
    standardFontDataUrl: toDirectoryFileUrl(path.join(pdfjsDir, "standard_fonts")),
    disableFontFace: false,
    useSystemFonts: true,
  });

  let pdfDocument;
  try {
    pdfDocument = await loadingTask.promise;
    const pagesToRender = Math.min(pdfDocument.numPages, maxPages);
    const images = [];

    for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
      const imageBuffer = await renderPdfPageToPng(pdfDocument, pageNum, PDF_VISION_VIEWPORT_SCALE);
      images.push(imageBuffer.toString("base64"));
    }

    return images;
  } finally {
    await pdfDocument?.destroy?.();
  }
}

function toDirectoryFileUrl(dirPath) {
  const url = pathToFileURL(path.resolve(dirPath)).href;
  return url.endsWith("/") ? url : `${url}/`;
}

function requireResolve(specifier) {
  return fileURLToPath(import.meta.resolve(specifier));
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
