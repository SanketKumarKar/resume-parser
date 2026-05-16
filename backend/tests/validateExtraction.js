#!/usr/bin/env node
/**
 * ============================================================================
 * Resume Extraction Validator — Automated QA for 10k+ Resumes
 * ============================================================================
 *
 * Usage:
 *   node validateExtraction.js --dir <resumeFolder> [options]
 *
 * Options:
 *   --dir, -d        Path to folder containing resume files (required)
 *   --url, -u        API base URL (default: http://localhost:5000)
 *   --concurrency,-c Max parallel requests (default: 5)
 *   --batch, -b      Batch size for progress logging (default: 100)
 *   --out, -o        Output report path (default: ./extraction_report.json)
 *   --timeout, -t    Per-request timeout in ms (default: 60000)
 *   --resume-from    Skip first N files (for resuming interrupted runs)
 *   --sample         Only test a random sample of N files
 *   --quiet, -q      Suppress per-file logs, only show summary
 *
 * Example:
 *   node validateExtraction.js -d ../../resumes -c 10 -o report.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Arg Parsing ─────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    dir: null,
    url: "http://localhost:5000",
    concurrency: 2,
    batch: 100,
    out: path.join(__dirname, "extraction_report.json"),
    timeout: 60000,
    resumeFrom: 0,
    sample: 0,
    quiet: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dir": case "-d": opts.dir = args[++i]; break;
      case "--url": case "-u": opts.url = args[++i]; break;
      case "--concurrency": case "-c": opts.concurrency = parseInt(args[++i], 10); break;
      case "--batch": case "-b": opts.batch = parseInt(args[++i], 10); break;
      case "--out": case "-o": opts.out = args[++i]; break;
      case "--timeout": case "-t": opts.timeout = parseInt(args[++i], 10); break;
      case "--resume-from": opts.resumeFrom = parseInt(args[++i], 10); break;
      case "--sample": opts.sample = parseInt(args[++i], 10); break;
      case "--quiet": case "-q": opts.quiet = true; break;
    }
  }

  if (!opts.dir) {
    console.error("❌ --dir is required. Pass the folder containing resumes.");
    process.exit(1);
  }
  return opts;
}

// ─── File Discovery ──────────────────────────────────────────────────────────
const SUPPORTED_EXTS = new Set([
  ".pdf", ".docx", ".doc", ".rtf", ".txt", ".html", ".htm",
  ".odt", ".md", ".markdown", ".jpg", ".jpeg", ".png", ".webp", ".svg",
]);

function discoverFiles(dir) {
  const results = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (SUPPORTED_EXTS.has(path.extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

function shuffleAndSample(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return n > 0 && n < copy.length ? copy.slice(0, n) : copy;
}

// ─── Text Extraction (for comparison) ────────────────────────────────────────
async function getRawText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const buffer = fs.readFileSync(filePath);
  try {
    if (ext === ".pdf") {
      const data = await pdfParse(buffer);
      return data.text;
    } else if (ext === ".docx") {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } else if (ext === ".txt" || ext === ".md") {
      return buffer.toString("utf8");
    }
    return "";
  } catch (err) {
    return "";
  }
}

// ─── Schema Validation ──────────────────────────────────────────────────────
// Maps expected top-level keys → what constitutes a "non-empty" value
const SCHEMA_RULES = {
  personal_info: {
    type: "object",
    critical: true,
    fields: {
      full_name: { type: "string", critical: true },
      email:     { type: "string", critical: true },
      phone:     { type: "string", critical: false },
      address:   { type: "string", critical: false },
      city:      { type: "string", critical: false },
      state:     { type: "string", critical: false },
      country:   { type: "string", critical: false },
      zip_code:  { type: "string", critical: false },
      linkedin:  { type: "string", critical: false },
      github:    { type: "string", critical: false },
      portfolio: { type: "string", critical: false },
      website:   { type: "string", critical: false },
    },
  },
  objective:        { type: "string", critical: false },
  summary:          { type: "string", critical: false },
  education:        { type: "array",  critical: true, minItems: 0 },
  work_experience:  { type: "array",  critical: true, minItems: 0 },
  technical_skills: { type: "object", critical: true },
  soft_skills:      { type: "array",  critical: false },
  projects:         { type: "array",  critical: false },
  certifications:   { type: "array",  critical: false },
  awards_honors:    { type: "array",  critical: false },
  publications:     { type: "array",  critical: false },
  languages:        { type: "array",  critical: false },
  volunteer_experience:       { type: "array", critical: false },
  extracurricular_activities: { type: "array", critical: false },
  interests_hobbies:          { type: "array", critical: false },
  references:                 { type: "array", critical: false },
  additional_sections:        { type: "object", critical: false },
};

function isEmpty(val) {
  if (val === null || val === undefined) return true;
  if (typeof val === "string") return val.trim() === "";
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === "object") return Object.keys(val).length === 0;
  return false;
}

function validateExtractedData(data, rawText) {
  const issues = [];
  const fieldStatus = {};
  let criticalMissing = 0;
  let totalFields = 0;
  let populatedFields = 0;

  // ─── 1. Schema Completeness ───
  for (const [key, rule] of Object.entries(SCHEMA_RULES)) {
    totalFields++;
    const val = data?.[key];

    if (val === undefined) {
      issues.push({ field: key, severity: rule.critical ? "CRITICAL" : "WARN", issue: "missing_key" });
      fieldStatus[key] = "missing";
      if (rule.critical) criticalMissing++;
      continue;
    }

    // Type check
    if (rule.type === "array" && !Array.isArray(val)) {
      issues.push({ field: key, severity: "ERROR", issue: `expected_array_got_${typeof val}` });
      fieldStatus[key] = "wrong_type";
      continue;
    }
    if (rule.type === "object" && (typeof val !== "object" || Array.isArray(val) || val === null)) {
      issues.push({ field: key, severity: "ERROR", issue: `expected_object_got_${typeof val}` });
      fieldStatus[key] = "wrong_type";
      continue;
    }

    // Nested personal_info fields
    if (key === "personal_info" && rule.fields) {
      for (const [fk, fr] of Object.entries(rule.fields)) {
        totalFields++;
        const fv = val?.[fk];
        if (isEmpty(fv)) {
          if (fr.critical) {
            issues.push({ field: `personal_info.${fk}`, severity: "CRITICAL", issue: "empty_or_null" });
            criticalMissing++;
          }
          fieldStatus[`personal_info.${fk}`] = "empty";
        } else {
          populatedFields++;
          fieldStatus[`personal_info.${fk}`] = "ok";
        }
      }
    }

    if (!isEmpty(val)) {
      populatedFields++;
      fieldStatus[key] = "ok";
    } else {
      fieldStatus[key] = "empty";
      if (rule.critical) {
        issues.push({ field: key, severity: "CRITICAL", issue: "empty_or_null" });
        criticalMissing++;
      }
    }
  }

  // ─── 2. Cross-Reference (Recall) Check ───
  // We check if data present in raw text is missing in JSON
  const recallResults = {
    missed_emails: [],
    missed_phones: [],
    missed_links: [],
    missed_skills: [],
    score: 100
  };

  if (rawText) {
    const textLower = rawText.toLowerCase();
    const jsonString = JSON.stringify(data).toLowerCase();

    // Check Emails
    const emails = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    [...new Set(emails)].forEach(email => {
      if (!jsonString.includes(email.toLowerCase())) {
        recallResults.missed_emails.push(email);
        issues.push({ field: "personal_info.email", severity: "CRITICAL", issue: `missed_from_text: ${email}` });
      }
    });

    // Check Links
    const links = rawText.match(/(linkedin\.com\/in\/|github\.com\/)[a-zA-Z0-9_-]+/gi) || [];
    [...new Set(links)].forEach(link => {
      if (!jsonString.includes(link.toLowerCase())) {
        recallResults.missed_links.push(link);
        issues.push({ field: "links", severity: "WARN", issue: `missed_from_text: ${link}` });
      }
    });

    // Check common skills (Top 20 most frequent)
    const commonSkills = ["python", "javascript", "react", "node", "aws", "docker", "sql", "java", "c++", "typescript", "angular", "vue", "git", "html", "css", "mongodb", "postgresql", "kubernetes", "express", "flutter"];
    commonSkills.forEach(skill => {
      // Escape special regex characters (like + in C++)
      const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Use a pattern that handles skills with trailing symbols like C++
      const regex = new RegExp(`(?:^|\\s|\\b)${escaped}(?:$|\\s|\\b|[.,;])`, "i");
      
      if (regex.test(rawText) && !jsonString.includes(skill.toLowerCase())) {
        recallResults.missed_skills.push(skill);
      }
    });

    // Simple recall score penalty
    let penalties = (recallResults.missed_emails.length * 20) + 
                    (recallResults.missed_links.length * 10) + 
                    (recallResults.missed_skills.length * 5);
    recallResults.score = Math.max(0, 100 - penalties);
  }

  // Quality score: weighted average of completeness and recall
  const completeness = totalFields > 0 ? Math.round((populatedFields / totalFields) * 100) : 0;
  const qualityScore = Math.round((completeness * 0.4) + (recallResults.score * 0.6));

  return { issues, fieldStatus, completeness, criticalMissing, recall: recallResults, qualityScore };
}

// ─── API Caller ──────────────────────────────────────────────────────────────
async function sendToApi(filePath, apiUrl, timeoutMs) {
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer]);
  formData.append("resume", blob, path.basename(filePath));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${apiUrl}/api/extract`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const body = await res.json();
    return { status: res.status, body, error: null };
  } catch (err) {
    clearTimeout(timer);
    return { status: 0, body: null, error: err.message };
  }
}

// ─── Concurrency Pool ───────────────────────────────────────────────────────
async function runPool(items, concurrency, handler) {
  const results = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await handler(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();
  const resolvedDir = path.resolve(opts.dir);

  console.log("🔍 Discovering resume files...");
  let files = discoverFiles(resolvedDir);
  console.log(`   Found ${files.length} supported files`);

  if (files.length === 0) {
    console.error("❌ No supported files found. Exiting.");
    process.exit(1);
  }

  // Sample / resume-from
  if (opts.sample > 0) {
    files = shuffleAndSample(files, opts.sample);
    console.log(`   Sampled ${files.length} files`);
  }
  if (opts.resumeFrom > 0) {
    files = files.slice(opts.resumeFrom);
    console.log(`   Skipping first ${opts.resumeFrom}, ${files.length} remaining`);
  }

  const total = files.length;
  const startTime = Date.now();

  // Counters
  const stats = {
    total,
    success: 0,
    failed: 0,
    fallback: 0,
    httpErrors: 0,
    timeouts: 0,
    avgCompleteness: 0,
    criticalFailures: 0,
    byExtension: {},
  };

  const fileResults = [];
  let completenessSum = 0;
  let processed = 0;

  console.log(`\n🚀 Starting extraction of ${total} resumes (concurrency: ${opts.concurrency})\n`);

  await runPool(files, opts.concurrency, async (filePath, index) => {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath);
    const fileStart = Date.now();

    // Extension tracking
    if (!stats.byExtension[ext]) {
      stats.byExtension[ext] = { total: 0, success: 0, failed: 0, fallback: 0 };
    }
    stats.byExtension[ext].total++;

    const { status, body, error } = await sendToApi(filePath, opts.url, opts.timeout);
    const elapsed = Date.now() - fileStart;

    const record = { file: basename, path: filePath, ext, elapsed, status };

    if (error) {
      record.result = "ERROR";
      record.error = error;
      stats.failed++;
      stats.byExtension[ext].failed++;
      if (error.includes("abort")) stats.timeouts++;
    } else if (status !== 200 || !body?.success) {
      record.result = "HTTP_ERROR";
      record.error = body?.error || `HTTP ${status}`;
      stats.httpErrors++;
      stats.failed++;
      stats.byExtension[ext].failed++;
    } else {
      // Step 1: Get raw text for comparison
      const rawText = await getRawText(filePath);

      // Step 2: Validate the extracted data vs raw text
      const validation = validateExtractedData(body.data, rawText);
      record.result = (validation.criticalMissing > 0 || validation.recall.score < 80) ? "PARTIAL" : "OK";
      record.completeness = validation.completeness;
      record.recallScore = validation.recall.score;
      record.qualityScore = validation.qualityScore;
      record.issues = validation.issues;
      record.fallback = body.fallback || false;
      record.missed = validation.recall;

      completenessSum += validation.qualityScore; // Using qualityScore for overall avg
      stats.success++;
      stats.byExtension[ext].success++;

      if (body.fallback) {
        stats.fallback++;
        stats.byExtension[ext].fallback++;
      }
      if (validation.criticalMissing > 0) {
        stats.criticalFailures++;
      }
    }

    fileResults.push(record);
    processed++;

    // Progress logging
    if (!opts.quiet && (processed % opts.batch === 0 || processed === total)) {
      const pct = ((processed / total) * 100).toFixed(1);
      const elapsedTotal = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (processed / ((Date.now() - startTime) / 1000)).toFixed(1);
      console.log(
        `   [${pct}%] ${processed}/${total} | ` +
        `✅ ${stats.success} ❌ ${stats.failed} ⚠️ ${stats.fallback} fallback | ` +
        `${rate} files/s | ${elapsedTotal}s elapsed`
      );
    }

    return record;
  });

  // ─── Final Stats ─────────────────────────────────────────────────────────
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  stats.avgCompleteness = stats.success > 0 ? Math.round(completenessSum / stats.success) : 0;

  // Identify top issues
  const issueCounts = {};
  for (const r of fileResults) {
    if (r.issues) {
      for (const iss of r.issues) {
        const key = `${iss.field}:${iss.issue}`;
        issueCounts[key] = (issueCounts[key] || 0) + 1;
      }
    }
  }
  const topIssues = Object.entries(issueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([key, count]) => ({ field_issue: key, count, pct: ((count / stats.success) * 100).toFixed(1) + "%" }));

  // Files with worst completeness
  const worstFiles = fileResults
    .filter(r => r.completeness !== undefined)
    .sort((a, b) => a.completeness - b.completeness)
    .slice(0, 20)
    .map(r => ({ file: r.file, completeness: r.completeness, issues: r.issues?.length || 0 }));

  // ─── Report ──────────────────────────────────────────────────────────────
  const report = {
    meta: {
      timestamp: new Date().toISOString(),
      directory: resolvedDir,
      totalFiles: total,
      elapsedSeconds: parseFloat(totalElapsed),
      concurrency: opts.concurrency,
      apiUrl: opts.url,
    },
    summary: {
      ...stats,
      successRate: ((stats.success / total) * 100).toFixed(1) + "%",
      fallbackRate: stats.success > 0 ? ((stats.fallback / stats.success) * 100).toFixed(1) + "%" : "N/A",
      criticalFailureRate: stats.success > 0 ? ((stats.criticalFailures / stats.success) * 100).toFixed(1) + "%" : "N/A",
    },
    topIssues,
    worstFiles,
    byExtension: stats.byExtension,
    // Only include failed files inline (full results go to report file)
    failedFiles: fileResults.filter(r => r.result === "ERROR" || r.result === "HTTP_ERROR").map(r => ({
      file: r.file, error: r.error, status: r.status,
    })),
  };

  // Write full report
  const fullReport = { ...report, allResults: fileResults };
  fs.writeFileSync(opts.out, JSON.stringify(fullReport, null, 2));

  // ─── Console Summary ────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(70));
  console.log("  EXTRACTION VALIDATION REPORT");
  console.log("═".repeat(70));
  console.log(`  Total files tested:      ${total}`);
  console.log(`  Successful extractions:  ${stats.success} (${report.summary.successRate})`);
  console.log(`  Failed:                  ${stats.failed}`);
  console.log(`  Timeouts:                ${stats.timeouts}`);
  console.log(`  Used fallback parser:    ${stats.fallback} (${report.summary.fallbackRate})`);
  console.log(`  Critical field missing:  ${stats.criticalFailures} (${report.summary.criticalFailureRate})`);
  console.log(`  Avg completeness score:  ${stats.avgCompleteness}%`);
  console.log(`  Time elapsed:            ${totalElapsed}s`);
  console.log(`  Throughput:              ${(total / parseFloat(totalElapsed)).toFixed(1)} files/s`);
  console.log("─".repeat(70));

  console.log("\n  📊 By Extension:");
  for (const [ext, s] of Object.entries(stats.byExtension)) {
    console.log(`    ${ext.padEnd(10)} total: ${s.total}  ok: ${s.success}  fail: ${s.failed}  fallback: ${s.fallback}`);
  }

  if (topIssues.length > 0) {
    console.log("\n  ⚠️  Top Issues:");
    for (const iss of topIssues.slice(0, 10)) {
      console.log(`    ${iss.count.toString().padStart(6)} (${iss.pct.padStart(6)})  ${iss.field_issue}`);
    }
  }

  if (worstFiles.length > 0) {
    console.log("\n  📉 Lowest Completeness:");
    for (const f of worstFiles.slice(0, 5)) {
      console.log(`    ${f.completeness.toString().padStart(3)}%  ${f.file} (${f.issues} issues)`);
    }
  }

  if (report.failedFiles.length > 0) {
    console.log(`\n  ❌ Failed Files (showing first 10 of ${report.failedFiles.length}):`);
    for (const f of report.failedFiles.slice(0, 10)) {
      console.log(`    ${f.file}: ${f.error}`);
    }
  }

  console.log("\n" + "═".repeat(70));
  console.log(`  Full report saved to: ${opts.out}`);
  console.log("═".repeat(70) + "\n");

  // Exit code: non-zero if critical failure rate > 10%
  const critRate = stats.success > 0 ? (stats.criticalFailures / stats.success) : 1;
  process.exit(critRate > 0.1 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
