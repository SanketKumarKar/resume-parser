#!/usr/bin/env node
/**
 * ============================================================================
 * Resume Parser Accuracy Test — Consistency / Determinism Checker
 * ============================================================================
 *
 * Measures how consistent (deterministic) the parser is by:
 *   1. Extracting every resume → JSON (Run 1)
 *   2. Extracting every resume → JSON again (Run 2)
 *   3. Deep-comparing the two outputs for each resume
 *   4. Scoring accuracy per file and overall
 *
 * Accuracy scoring:
 *   - Each resume's JSON is flattened into leaf-level key-value pairs
 *   - Each matching pair = +1 point, each differing pair = +0 (or partial)
 *   - Minor word differences (typos, whitespace) count as partial matches
 *   - Per-file accuracy = matching leaves / total leaves
 *   - Overall accuracy = average of all per-file accuracies
 *
 * Usage:
 *   node tests/accuracyTest.js [options]
 *
 * Options:
 *   --dir, -d    Resume folder (default: ../../test-resumes)
 *   --out, -o    Output report path (default: ./accuracy_report.json)
 *   --timeout    Per-extraction timeout ms (default: 120000)
 *   --quiet, -q  Suppress per-file logs
 *
 * Example:
 *   node tests/accuracyTest.js -d ../../test-resumes
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { extractTextFromFile } from "../fileParser.js";
import { extractResumeData } from "../geminiService.js";
import { canonicalizeResumeData } from "../resumeCanonicalizer.js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from backend/.env
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ─── Arg Parsing ─────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    dir: path.resolve(__dirname, "..", "..", "test-resumes"),
    out: path.join(__dirname, "accuracy_report.json"),
    timeout: 120000,
    quiet: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dir": case "-d": opts.dir = path.resolve(args[++i]); break;
      case "--out": case "-o": opts.out = args[++i]; break;
      case "--timeout": case "-t": opts.timeout = parseInt(args[++i], 10); break;
      case "--quiet": case "-q": opts.quiet = true; break;
    }
  }
  return opts;
}

// ─── File Discovery ──────────────────────────────────────────────────────────
const SUPPORTED_EXTS = new Set([
  ".pdf", ".docx", ".doc", ".rtf", ".txt", ".html", ".htm",
  ".odt", ".md", ".markdown", ".jpg", ".jpeg", ".png", ".webp", ".svg",
]);

// Skip temp files like ~$filename.doc
function isTemporaryFile(name) {
  return name.startsWith("~$");
}

function discoverFiles(dir) {
  const results = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (isTemporaryFile(entry.name)) continue;
      if (SUPPORTED_EXTS.has(path.extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

// ─── JSON Deep Flattening ────────────────────────────────────────────────────
// Flattens nested JSON into dot-notation key → leaf value pairs
// e.g. { personal_info: { name: "John" } } → { "personal_info.name": "John" }
function flattenJSON(obj, prefix = "") {
  const result = {};

  if (obj === null || obj === undefined) {
    result[prefix || "(root)"] = null;
    return result;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      result[prefix || "(root)"] = "[]";
    } else {
      obj.forEach((item, idx) => {
        const childPrefix = prefix ? `${prefix}[${idx}]` : `[${idx}]`;
        Object.assign(result, flattenJSON(item, childPrefix));
      });
    }
    return result;
  }

  if (typeof obj === "object") {
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      result[prefix || "(root)"] = "{}";
    } else {
      for (const key of keys) {
        const childPrefix = prefix ? `${prefix}.${key}` : key;
        Object.assign(result, flattenJSON(obj[key], childPrefix));
      }
    }
    return result;
  }

  // Primitive (string, number, boolean)
  result[prefix || "(root)"] = String(obj);
  return result;
}

// ─── Similarity Scoring ─────────────────────────────────────────────────────
// Normalise a string for "fuzzy" comparison: lowercase, collapse whitespace,
// strip punctuation. Two strings that match after normalisation are treated
// as identical (covers minor word/spacing differences).
function normalise(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .toLowerCase()
    .replace(/[\s\r\n]+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

/**
 * Compares two flattened JSON maps.
 * Returns { matchedKeys, totalKeys, diffs[], accuracy }
 */
function compareFlat(flat1, flat2) {
  const allKeys = new Set([...Object.keys(flat1), ...Object.keys(flat2)]);
  const totalKeys = allKeys.size;
  let matchedKeys = 0;
  const diffs = [];

  for (const key of allKeys) {
    const v1 = flat1[key];
    const v2 = flat2[key];

    // Both missing → match
    if (v1 === undefined && v2 === undefined) {
      matchedKeys++;
      continue;
    }

    // Exact string match
    if (v1 === v2) {
      matchedKeys++;
      continue;
    }

    // Both null
    if (v1 === null && v2 === null) {
      matchedKeys++;
      continue;
    }

    // Normalised fuzzy match (handles minor word/spacing/punctuation diffs)
    if (normalise(v1) === normalise(v2)) {
      matchedKeys++;
      continue;
    }

    // Key exists in one run but not the other (structural difference)
    if (v1 === undefined || v2 === undefined) {
      diffs.push({
        key,
        run1: v1 === undefined ? "(missing)" : v1,
        run2: v2 === undefined ? "(missing)" : v2,
        type: "structural",
      });
      continue;
    }

    // Value mismatch
    diffs.push({
      key,
      run1: v1,
      run2: v2,
      type: "value_change",
    });
  }

  const accuracy = totalKeys > 0 ? (matchedKeys / totalKeys) * 100 : 100;

  return { matchedKeys, totalKeys, diffs, accuracy };
}

// ─── Single Resume Extraction ────────────────────────────────────────────────
async function extractOnce(filePath, apiKey, timeoutMs) {
  const originalName = path.basename(filePath);
  const ext = path.extname(originalName).toLowerCase();

  // Determine MIME type from extension
  const mimeMap = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".rtf": "application/rtf",
    ".txt": "text/plain",
    ".html": "text/html", ".htm": "text/html",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".md": "text/markdown", ".markdown": "text/markdown",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  const mimeType = mimeMap[ext] || "application/octet-stream";

  // Wrap in a timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Step 1: Extract text/image data from file
    const parseResult = await extractTextFromFile(filePath, mimeType, originalName);
    const { text, isPdf, isImage, sourceType, warnings = [] } = parseResult;

    if (!text && !isPdf && !isImage) {
      throw new Error("Could not extract text or image from file.");
    }

    // Step 2: Send to Ollama/Gemma4 for AI extraction
    const resumeData = await extractResumeData(
      apiKey,
      text,
      isPdf,
      isImage,
      mimeType,
      filePath,
      originalName
    );

    clearTimeout(timer);
    return {
      success: true,
      data: canonicalizeResumeData(resumeData),
      sourceType,
      textLength: text ? text.length : 0,
      warnings,
    };
  } catch (err) {
    clearTimeout(timer);
    return { success: false, error: err.message };
  }
}

// ─── Box Drawing Helpers ─────────────────────────────────────────────────────
const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgGreen: "\x1b[42m",
  bgRed: "\x1b[41m",
  bgYellow: "\x1b[43m",
};

function colorAccuracy(pct) {
  if (pct >= 95) return `${COLORS.green}${pct.toFixed(1)}%${COLORS.reset}`;
  if (pct >= 80) return `${COLORS.yellow}${pct.toFixed(1)}%${COLORS.reset}`;
  return `${COLORS.red}${pct.toFixed(1)}%${COLORS.reset}`;
}

function getAccuracyBar(pct, width = 30) {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  let color = COLORS.green;
  if (pct < 95) color = COLORS.yellow;
  if (pct < 80) color = COLORS.red;
  return `${color}${"█".repeat(filled)}${COLORS.dim}${"░".repeat(empty)}${COLORS.reset}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();
  const apiKey = process.env.GEMINI_API_KEY;

  console.log(`\n${COLORS.bold}${COLORS.cyan}╔${"═".repeat(68)}╗${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}║${COLORS.reset}  ${COLORS.bold}🔬 RESUME PARSER ACCURACY TEST — Consistency Checker${COLORS.reset}             ${COLORS.bold}${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}╚${"═".repeat(68)}╝${COLORS.reset}\n`);

  // Discover files
  console.log(`${COLORS.cyan}📂 Scanning:${COLORS.reset} ${opts.dir}`);
  const files = discoverFiles(opts.dir);
  console.log(`${COLORS.cyan}📋 Found:${COLORS.reset}    ${files.length} supported resume files\n`);

  if (files.length === 0) {
    console.error(`${COLORS.red}❌ No supported files found. Exiting.${COLORS.reset}`);
    process.exit(1);
  }

  const startTime = Date.now();
  const results = [];
  let totalAccuracy = 0;
  let successCount = 0;
  let failedRun1 = 0;
  let failedRun2 = 0;
  let perfectCount = 0; // 100% accuracy

  console.log(`${COLORS.bold}${"─".repeat(70)}${COLORS.reset}`);
  console.log(`${COLORS.bold}  #   File                                         Run1  Run2  Accuracy${COLORS.reset}`);
  console.log(`${COLORS.bold}${"─".repeat(70)}${COLORS.reset}`);

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const relativePath = path.relative(opts.dir, filePath);
    const displayName = relativePath.length > 42
      ? "…" + relativePath.slice(-41)
      : relativePath.padEnd(42);

    const idx = `${(i + 1).toString().padStart(3)}`;

    // ── Run 1 ──
    process.stdout.write(`  ${COLORS.dim}${idx}${COLORS.reset}  ${displayName}  `);
    const run1 = await extractOnce(filePath, apiKey, opts.timeout);

    if (!run1.success) {
      process.stdout.write(`${COLORS.red}FAIL${COLORS.reset}  ----  ----\n`);
      failedRun1++;
      results.push({
        file: relativePath,
        status: "run1_failed",
        error: run1.error,
        accuracy: null,
      });
      if (!opts.quiet) {
        console.log(`       ${COLORS.dim}└─ Run 1 error: ${run1.error}${COLORS.reset}`);
      }
      continue;
    }
    process.stdout.write(`${COLORS.green} ✓  ${COLORS.reset}  `);

    // ── Run 2 ──
    const run2 = await extractOnce(filePath, apiKey, opts.timeout);

    if (!run2.success) {
      process.stdout.write(`${COLORS.red}FAIL${COLORS.reset}  ----\n`);
      failedRun2++;
      results.push({
        file: relativePath,
        status: "run2_failed",
        error: run2.error,
        accuracy: null,
      });
      if (!opts.quiet) {
        console.log(`       ${COLORS.dim}└─ Run 2 error: ${run2.error}${COLORS.reset}`);
      }
      continue;
    }
    process.stdout.write(`${COLORS.green} ✓  ${COLORS.reset}  `);

    // ── Compare ──
    const flat1 = flattenJSON(canonicalizeResumeData(run1.data));
    const flat2 = flattenJSON(canonicalizeResumeData(run2.data));
    const comparison = compareFlat(flat1, flat2);

    process.stdout.write(`${colorAccuracy(comparison.accuracy)}\n`);

    if (comparison.accuracy >= 99.99) perfectCount++;
    totalAccuracy += comparison.accuracy;
    successCount++;

    const result = {
      file: relativePath,
      status: "compared",
      accuracy: parseFloat(comparison.accuracy.toFixed(2)),
      matchedKeys: comparison.matchedKeys,
      totalKeys: comparison.totalKeys,
      diffCount: comparison.diffs.length,
      diffs: comparison.diffs.slice(0, 20), // Cap stored diffs for report size
      sourceTypeRun1: run1.sourceType,
      sourceTypeRun2: run2.sourceType,
      textLengthRun1: run1.textLength,
      textLengthRun2: run2.textLength,
      warnings: [...new Set([...(run1.warnings || []), ...(run2.warnings || [])])],
    };
    results.push(result);

    // Show diffs for non-perfect files
    if (!opts.quiet && comparison.diffs.length > 0) {
      const shown = comparison.diffs.slice(0, 5);
      for (const d of shown) {
        const typeLabel = d.type === "structural"
          ? `${COLORS.red}MISSING${COLORS.reset}`
          : `${COLORS.yellow}CHANGED${COLORS.reset}`;
        console.log(`       ${COLORS.dim}└─${COLORS.reset} ${typeLabel} ${COLORS.dim}${d.key}${COLORS.reset}`);
        console.log(`          ${COLORS.dim}Run1: ${COLORS.reset}${truncate(d.run1, 60)}`);
        console.log(`          ${COLORS.dim}Run2: ${COLORS.reset}${truncate(d.run2, 60)}`);
      }
      if (comparison.diffs.length > 5) {
        console.log(`       ${COLORS.dim}└─ … and ${comparison.diffs.length - 5} more differences${COLORS.reset}`);
      }
    }
  }

  // ─── Overall Summary ─────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const overallAccuracy = successCount > 0 ? totalAccuracy / successCount : 0;

  console.log(`\n${COLORS.bold}${COLORS.cyan}╔${"═".repeat(68)}╗${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}║${COLORS.reset}  ${COLORS.bold}📊 OVERALL ACCURACY REPORT${COLORS.reset}                                          ${COLORS.bold}${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}╠${"═".repeat(68)}╣${COLORS.reset}`);

  console.log(`${COLORS.bold}${COLORS.cyan}║${COLORS.reset}                                                                    ${COLORS.bold}${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}║${COLORS.reset}  ${COLORS.bold}Overall Accuracy:${COLORS.reset}  ${getAccuracyBar(overallAccuracy)}  ${colorAccuracy(overallAccuracy)}     ${COLORS.bold}${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}║${COLORS.reset}                                                                    ${COLORS.bold}${COLORS.cyan}║${COLORS.reset}`);

  console.log(`${COLORS.bold}${COLORS.cyan}╠${"═".repeat(68)}╣${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}║${COLORS.reset}  Total resumes tested:     ${String(files.length).padStart(5)}                                 ${COLORS.bold}${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}║${COLORS.reset}  Successfully compared:    ${String(successCount).padStart(5)}                                 ${COLORS.bold}${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}║${COLORS.reset}  Perfect (100%) matches:   ${String(perfectCount).padStart(5)}                                 ${COLORS.bold}${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}║${COLORS.reset}  Run 1 failures:           ${String(failedRun1).padStart(5)}                                 ${COLORS.bold}${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}║${COLORS.reset}  Run 2 failures:           ${String(failedRun2).padStart(5)}                                 ${COLORS.bold}${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}║${COLORS.reset}  Time elapsed:           ${elapsed.padStart(6)}s                                ${COLORS.bold}${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}╠${"═".repeat(68)}╣${COLORS.reset}`);

  // Per-file breakdown sorted by accuracy (worst first)
  const compared = results.filter(r => r.status === "compared");
  const sorted = [...compared].sort((a, b) => a.accuracy - b.accuracy);

  if (sorted.length > 0) {
    console.log(`${COLORS.bold}${COLORS.cyan}║${COLORS.reset}                                                                    ${COLORS.bold}${COLORS.cyan}║${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.cyan}║${COLORS.reset}  ${COLORS.bold}Per-File Breakdown (worst first):${COLORS.reset}                               ${COLORS.bold}${COLORS.cyan}║${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.cyan}║${COLORS.reset}                                                                    ${COLORS.bold}${COLORS.cyan}║${COLORS.reset}`);

    for (const r of sorted) {
      const name = r.file.length > 40 ? "…" + r.file.slice(-39) : r.file;
      const bar = getAccuracyBar(r.accuracy, 15);
      const diffsLabel = r.diffCount > 0
        ? `${COLORS.yellow}${r.diffCount} diffs${COLORS.reset}`
        : `${COLORS.green}perfect${COLORS.reset}`;
      console.log(`${COLORS.bold}${COLORS.cyan}║${COLORS.reset}  ${name.padEnd(42)} ${bar} ${colorAccuracy(r.accuracy).padEnd(18)} ${diffsLabel.padEnd(5)}`);
    }

    console.log(`${COLORS.bold}${COLORS.cyan}║${COLORS.reset}                                                                    ${COLORS.bold}${COLORS.cyan}║${COLORS.reset}`);
  }

  // Show failed files
  const failedFiles = results.filter(r => r.status !== "compared");
  if (failedFiles.length > 0) {
    console.log(`${COLORS.bold}${COLORS.cyan}╠${"═".repeat(68)}╣${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.cyan}║${COLORS.reset}  ${COLORS.bold}${COLORS.red}Failed Files:${COLORS.reset}                                                   ${COLORS.bold}${COLORS.cyan}║${COLORS.reset}`);
    for (const f of failedFiles) {
      console.log(`${COLORS.bold}${COLORS.cyan}║${COLORS.reset}  ${COLORS.red}✗${COLORS.reset} ${f.file} — ${f.status}: ${truncate(f.error, 35)}`);
    }
  }

  console.log(`${COLORS.bold}${COLORS.cyan}╚${"═".repeat(68)}╝${COLORS.reset}\n`);

  // ─── Save JSON Report ──────────────────────────────────────────────────
  const byExtension = buildExtensionSummary(results);
  const topUnstableFields = buildTopUnstableFields(results);

  const report = {
    meta: {
      timestamp: new Date().toISOString(),
      directory: opts.dir,
      totalFiles: files.length,
      elapsedSeconds: parseFloat(elapsed),
    },
    summary: {
      overallAccuracy: parseFloat(overallAccuracy.toFixed(2)),
      totalTested: files.length,
      successfullyCompared: successCount,
      perfectMatches: perfectCount,
      run1Failures: failedRun1,
      run2Failures: failedRun2,
      byExtension,
      topUnstableFields,
    },
    perFileResults: results,
  };

  fs.writeFileSync(opts.out, JSON.stringify(report, null, 2));
  console.log(`${COLORS.dim}📄 Full report saved to: ${opts.out}${COLORS.reset}\n`);

  // Exit code based on accuracy
  process.exit(overallAccuracy >= 90 ? 0 : 1);
}

function truncate(s, maxLen) {
  if (s === null || s === undefined) return "(null)";
  const str = String(s);
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str;
}

function buildExtensionSummary(results) {
  const summary = {};
  for (const result of results) {
    const ext = path.extname(result.file || "").toLowerCase() || "(none)";
    if (!summary[ext]) {
      summary[ext] = { total: 0, compared: 0, averageAccuracy: 0, perfectMatches: 0, diffCount: 0 };
    }
    summary[ext].total++;
    if (typeof result.accuracy === "number") {
      summary[ext].compared++;
      summary[ext].averageAccuracy += result.accuracy;
      summary[ext].diffCount += result.diffCount || 0;
      if (result.accuracy >= 99.99) summary[ext].perfectMatches++;
    }
  }

  for (const item of Object.values(summary)) {
    item.averageAccuracy = item.compared > 0
      ? parseFloat((item.averageAccuracy / item.compared).toFixed(2))
      : 0;
  }
  return summary;
}

function buildTopUnstableFields(results) {
  const counts = {};
  for (const result of results) {
    for (const diff of result.diffs || []) {
      const field = diff.key.replace(/\[\d+\]/g, "[]");
      counts[field] = (counts[field] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([field, count]) => ({ field, count }));
}

main().catch((err) => {
  console.error(`${COLORS.red}Fatal error:${COLORS.reset}`, err);
  process.exit(2);
});
