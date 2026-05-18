#!/usr/bin/env node
/**
 * Batch QA for final /api/extract JSON output.
 *
 * Usage:
 *   node tests/validateExtraction.js --dir <resumeFolder> [options]
 *
 * Options include:
 *   --sample, -s  Randomly validate N files
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  EXPECTED_SCHEMA,
  average,
  countPopulatedFields,
  discoverFiles,
  extractSignals,
  flattenSchemaPaths,
  getPath,
  getRawTextInfo,
  isEmpty,
  parseBatchArgs,
  pct,
  printTableRow,
  runPool,
  sendResumeToApi,
  shuffleAndSample,
  typeOfRule,
  valueAppearsInJson,
} from "./batchResumeHelpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CRITICAL_FIELDS = [
  "personal_info.full_name",
  "personal_info.email",
  "personal_info.phone",
];

const CONDITIONAL_FIELDS = [
  "education",
  "work_experience",
  "projects",
  "technical_skills",
  "certifications",
  "summary",
];

function parseArgs() {
  return parseBatchArgs({
    out: path.join(__dirname, "extraction_report.json"),
  });
}

function validateSchema(data) {
  const issues = [];
  const fieldStatus = {};

  for (const [key, rule] of Object.entries(EXPECTED_SCHEMA)) {
    const value = data?.[key];
    if (value === undefined) {
      issues.push(issue(key, "ERROR", "missing_key", "Expected top-level key is absent."));
      fieldStatus[key] = "missing";
      continue;
    }

    const actualType = typeOfRule(value);
    if (actualType !== rule.type && !(rule.type === "string" && actualType === "null")) {
      issues.push(issue(key, "ERROR", "wrong_type", `Expected ${rule.type}, got ${actualType}.`));
      fieldStatus[key] = "wrong_type";
      continue;
    }

    fieldStatus[key] = isEmpty(value) ? "empty" : "ok";

    if (rule.fields && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [field, expectedType] of Object.entries(rule.fields)) {
        const childPath = `${key}.${field}`;
        const childValue = value[field];
        const childType = typeOfRule(childValue);

        if (childValue === undefined) {
          issues.push(issue(childPath, "ERROR", "missing_key", "Expected nested key is absent."));
          fieldStatus[childPath] = "missing";
          continue;
        }

        if (childType !== expectedType && !(expectedType === "string" && childType === "null")) {
          issues.push(issue(childPath, "ERROR", "wrong_type", `Expected ${expectedType}, got ${childType}.`));
          fieldStatus[childPath] = "wrong_type";
          continue;
        }

        fieldStatus[childPath] = isEmpty(childValue) ? "empty" : "ok";
      }
    }
  }

  return { issues, fieldStatus };
}

function validateCriticalFields(data, signals) {
  const issues = [];

  for (const field of CRITICAL_FIELDS) {
    if (isEmpty(getPath(data, field))) {
      issues.push(issue(field, "CRITICAL", "empty_critical_field", "Critical contact field is empty."));
    }
  }

  for (const field of CONDITIONAL_FIELDS) {
    if (signals.sections[field] && isEmpty(getPath(data, field))) {
      issues.push(issue(field, "CRITICAL", "section_seen_in_text_but_empty", "Raw text suggests this section exists."));
    }
  }

  if (signals.skills.length > 0 && countSkills(data) === 0) {
    issues.push(issue("technical_skills", "CRITICAL", "skills_seen_in_text_but_empty", "Skills were detected in raw text."));
  }

  return issues;
}

function validateRecall(data, signals) {
  const missed = {
    emails: [],
    phones: [],
    links: [],
    dates: [],
    skills: [],
    sections: [],
  };
  const issues = [];

  for (const email of signals.emails) {
    if (!valueAppearsInJson(email, data)) missed.emails.push(email);
  }

  for (const phone of signals.phones) {
    const compactPhone = phone.replace(/\D/g, "");
    const jsonDigits = JSON.stringify(data || {}).replace(/\D/g, "");
    if (compactPhone.length >= 8 && !jsonDigits.includes(compactPhone.slice(-8))) {
      missed.phones.push(phone);
    }
  }

  for (const link of signals.links) {
    if (!valueAppearsInJson(link, data)) missed.links.push(link);
  }

  for (const date of signals.dates) {
    if (!valueAppearsInJson(date, data)) missed.dates.push(date);
  }

  for (const skill of signals.skills) {
    if (!valueAppearsInJson(skill, data)) missed.skills.push(skill);
  }

  for (const [section, seen] of Object.entries(signals.sections)) {
    if (seen && isEmpty(getPath(data, section))) missed.sections.push(section);
  }

  addMissedIssues(issues, "personal_info.email", "CRITICAL", "missed_email_from_text", missed.emails);
  addMissedIssues(issues, "personal_info.phone", "CRITICAL", "missed_phone_from_text", missed.phones);
  addMissedIssues(issues, "links", "WARN", "missed_link_from_text", missed.links);
  addMissedIssues(issues, "dates", "WARN", "missed_date_from_text", missed.dates.slice(0, 10));
  addMissedIssues(issues, "technical_skills", "WARN", "missed_skill_from_text", missed.skills);
  addMissedIssues(issues, "sections", "CRITICAL", "missed_section_from_text", missed.sections);

  const recallScore = Math.max(0, 100
    - missed.emails.length * 20
    - missed.phones.length * 15
    - missed.sections.length * 12
    - missed.links.length * 8
    - missed.skills.length * 5
    - Math.min(missed.dates.length, 10) * 2);

  return { missed, issues, recallScore };
}

function addMissedIssues(issues, field, severity, code, values) {
  for (const value of values) {
    issues.push(issue(field, severity, code, String(value)));
  }
}

function scoreValidation({ schemaIssues, criticalIssues, recall, rawInfo, apiBody, coverage }) {
  const schemaPenalty = schemaIssues.filter((item) => item.severity === "ERROR").length * 5;
  const criticalPenalty = criticalIssues.filter((item) => item.severity === "CRITICAL").length * 12;
  const metadataPenalty = [
    rawInfo.parseError ? 8 : 0,
    rawInfo.textLength > 0 && rawInfo.textLength < 250 ? 6 : 0,
    apiBody?.fallback ? 5 : 0,
    (apiBody?.warnings || []).length * 2,
  ].reduce((sum, value) => sum + value, 0);

  const schemaScore = Math.max(0, 100 - schemaPenalty);
  const criticalScore = Math.max(0, 100 - criticalPenalty);
  const metadataScore = Math.max(0, 100 - metadataPenalty);

  return Math.round(
    schemaScore * 0.25 +
    criticalScore * 0.25 +
    recall.recallScore * 0.35 +
    coverage.percent * 0.10 +
    metadataScore * 0.05
  );
}

async function validateFile(filePath, opts, baseDir) {
  const started = Date.now();
  const relativePath = path.relative(baseDir, filePath);
  const ext = path.extname(filePath).toLowerCase();
  const rawInfo = await getRawTextInfo(filePath);
  const signals = extractSignals(rawInfo.text);
  const apiResult = await sendResumeToApi(filePath, opts.url, opts.timeout);

  const record = {
    file: path.basename(filePath),
    path: filePath,
    relativePath,
    ext,
    elapsed: Date.now() - started,
    status: apiResult.status,
    sourceType: rawInfo.sourceType,
    textLength: rawInfo.textLength,
    parseError: rawInfo.parseError,
    warnings: rawInfo.warnings,
  };

  if (apiResult.error) {
    return {
      ...record,
      result: apiResult.error === "request_timeout" ? "TIMEOUT" : "ERROR",
      error: apiResult.error,
      qualityScore: 0,
    };
  }

  if (apiResult.status !== 200 || !apiResult.body?.success) {
    return {
      ...record,
      result: "HTTP_ERROR",
      error: apiResult.body?.error || `HTTP ${apiResult.status}`,
      qualityScore: 0,
    };
  }

  const data = apiResult.body.data || {};
  const schema = validateSchema(data);
  const criticalIssues = validateCriticalFields(data, signals);
  const recall = validateRecall(data, signals);
  const coverage = countPopulatedFields(data);
  const issues = [...schema.issues, ...criticalIssues, ...recall.issues];
  const qualityScore = scoreValidation({
    schemaIssues: schema.issues,
    criticalIssues,
    recall,
    rawInfo,
    apiBody: apiResult.body,
    coverage,
  });
  const criticalCount = issues.filter((item) => item.severity === "CRITICAL").length;

  return {
    ...record,
    result: criticalCount > 0 || qualityScore < 80 ? "PARTIAL" : "OK",
    fallback: Boolean(apiResult.body.fallback),
    apiSourceType: apiResult.body.sourceType,
    apiTextLength: apiResult.body.textLength,
    apiWarnings: apiResult.body.warnings || [],
    completeness: coverage.percent,
    recallScore: recall.recallScore,
    qualityScore,
    criticalCount,
    issueCount: issues.length,
    issues,
    fieldStatus: schema.fieldStatus,
    missed: recall.missed,
    detected: {
      emails: signals.emails.length,
      phones: signals.phones.length,
      links: signals.links.length,
      dates: signals.dates.length,
      skills: signals.skills,
      sections: Object.entries(signals.sections).filter(([, seen]) => seen).map(([key]) => key),
    },
  };
}

function buildReport({ opts, files, results, elapsedSeconds }) {
  const successful = results.filter((result) => ["OK", "PARTIAL"].includes(result.result));
  const failed = results.filter((result) => !["OK", "PARTIAL"].includes(result.result));
  const partial = results.filter((result) => result.result === "PARTIAL");
  const ok = results.filter((result) => result.result === "OK");
  const fallback = successful.filter((result) => result.fallback).length;
  const criticalFailures = successful.filter((result) => result.criticalCount > 0).length;

  const summary = {
    total: files.length,
    ok: ok.length,
    partial: partial.length,
    success: successful.length,
    failed: failed.length,
    fallback,
    httpErrors: results.filter((result) => result.result === "HTTP_ERROR").length,
    timeouts: results.filter((result) => result.result === "TIMEOUT").length,
    criticalFailures,
    avgCompleteness: Math.round(average(successful.map((result) => result.completeness))),
    avgRecallScore: Math.round(average(successful.map((result) => result.recallScore))),
    avgQualityScore: Math.round(average(successful.map((result) => result.qualityScore))),
    successRate: `${pct(successful.length, files.length)}%`,
    criticalFailureRate: `${pct(criticalFailures, successful.length)}%`,
    fallbackRate: `${pct(fallback, successful.length)}%`,
  };

  return {
    meta: {
      timestamp: new Date().toISOString(),
      directory: opts.dir,
      totalFiles: files.length,
      elapsedSeconds,
      concurrency: opts.concurrency,
      apiUrl: opts.url,
    },
    summary,
    byExtension: buildExtensionSummary(results),
    topIssues: buildTopIssues(results, successful.length),
    fieldCoverage: buildFieldCoverage(results),
    worstFiles: successful
      .slice()
      .sort((a, b) => a.qualityScore - b.qualityScore)
      .slice(0, 20)
      .map((result) => ({
        file: result.relativePath,
        qualityScore: result.qualityScore,
        completeness: result.completeness,
        recallScore: result.recallScore,
        criticalCount: result.criticalCount,
        issueCount: result.issueCount,
      })),
    failedFiles: failed.map((result) => ({
      file: result.relativePath,
      result: result.result,
      status: result.status,
      error: result.error,
    })),
    allResults: results,
  };
}

function buildExtensionSummary(results) {
  const byExtension = {};
  for (const result of results) {
    if (!byExtension[result.ext]) {
      byExtension[result.ext] = {
        total: 0,
        ok: 0,
        partial: 0,
        failed: 0,
        fallback: 0,
        averageQualityScore: 0,
      };
    }
    const bucket = byExtension[result.ext];
    bucket.total++;
    if (result.result === "OK") bucket.ok++;
    else if (result.result === "PARTIAL") bucket.partial++;
    else bucket.failed++;
    if (result.fallback) bucket.fallback++;
    if (typeof result.qualityScore === "number") bucket.averageQualityScore += result.qualityScore;
  }

  for (const bucket of Object.values(byExtension)) {
    const scored = bucket.ok + bucket.partial;
    bucket.averageQualityScore = scored ? Math.round(bucket.averageQualityScore / scored) : 0;
  }
  return byExtension;
}

function buildTopIssues(results, successCount) {
  const counts = {};
  for (const result of results) {
    for (const item of result.issues || []) {
      const key = `${item.field}:${item.code}`;
      counts[key] = (counts[key] || 0) + 1;
    }
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([fieldIssue, count]) => ({
      fieldIssue,
      count,
      pct: `${pct(count, successCount)}%`,
    }));
}

function buildFieldCoverage(results) {
  const fields = flattenSchemaPaths(EXPECTED_SCHEMA);
  const successful = results.filter((result) => ["OK", "PARTIAL"].includes(result.result));
  const coverage = {};

  for (const field of fields) {
    let ok = 0;
    let empty = 0;
    let missing = 0;
    let wrongType = 0;

    for (const result of successful) {
      const status = result.fieldStatus?.[field];
      if (status === "ok") ok++;
      else if (status === "empty") empty++;
      else if (status === "wrong_type") wrongType++;
      else missing++;
    }

    coverage[field] = {
      ok,
      empty,
      missing,
      wrongType,
      populatedRate: `${pct(ok, successful.length)}%`,
    };
  }

  return coverage;
}

function issue(field, severity, code, detail) {
  return { field, severity, code, detail };
}

function countSkills(data) {
  const skills = data?.technical_skills;
  if (!skills || typeof skills !== "object" || Array.isArray(skills)) return 0;
  return Object.values(skills).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0);
}

function prepareFiles(opts) {
  if (!fs.existsSync(opts.dir)) {
    throw new Error(`Directory does not exist: ${opts.dir}`);
  }

  let files = discoverFiles(opts.dir);
  if (opts.sample > 0) files = shuffleAndSample(files, opts.sample);
  if (opts.resumeFrom > 0) files = files.slice(opts.resumeFrom);
  return files;
}

async function main() {
  const opts = parseArgs();
  const files = prepareFiles(opts);

  if (files.length === 0) {
    console.error(`No supported resume files found in ${opts.dir}`);
    process.exit(1);
  }

  const start = Date.now();
  let processed = 0;

  console.log(`\nValidating ${files.length} resumes through ${opts.url}/api/extract`);
  console.log(`Directory: ${opts.dir}`);
  console.log(`Concurrency: ${opts.concurrency}\n`);

  if (!opts.quiet) {
    console.log(printTableRow(["#", "File", "Result", "Quality", "Recall", "Issues"], [5, 42, 10, 8, 8, 8]));
    console.log("-".repeat(91));
  }

  const results = await runPool(files, opts.concurrency, async (filePath, index) => {
    const result = await validateFile(filePath, opts, opts.dir);
    processed++;

    if (!opts.quiet) {
      console.log(printTableRow([
        index + 1,
        result.relativePath,
        result.result,
        result.qualityScore ?? 0,
        result.recallScore ?? 0,
        result.issueCount ?? result.error ?? 0,
      ], [5, 42, 10, 8, 8, 8]));
    } else if (processed % opts.batch === 0 || processed === files.length) {
      const rate = processed / ((Date.now() - start) / 1000);
      console.log(`Processed ${processed}/${files.length} (${rate.toFixed(1)} files/s)`);
    }

    return result;
  });

  const elapsedSeconds = Number(((Date.now() - start) / 1000).toFixed(1));
  const report = buildReport({ opts, files, results, elapsedSeconds });

  fs.writeFileSync(opts.out, JSON.stringify(report, null, 2));

  console.log("\nExtraction Validation Summary");
  console.log("-".repeat(58));
  console.log(`Total files:           ${report.summary.total}`);
  console.log(`OK / Partial / Failed: ${report.summary.ok} / ${report.summary.partial} / ${report.summary.failed}`);
  console.log(`Average quality:       ${report.summary.avgQualityScore}`);
  console.log(`Average completeness:  ${report.summary.avgCompleteness}`);
  console.log(`Average recall:        ${report.summary.avgRecallScore}`);
  console.log(`Critical failures:     ${report.summary.criticalFailures} (${report.summary.criticalFailureRate})`);
  console.log(`Fallback parser:       ${report.summary.fallback} (${report.summary.fallbackRate})`);
  console.log(`Elapsed:               ${elapsedSeconds}s`);
  console.log(`Report saved to:       ${opts.out}`);

  if (report.topIssues.length > 0) {
    console.log("\nTop Issues");
    for (const item of report.topIssues.slice(0, 10)) {
      console.log(`- ${item.count} (${item.pct}) ${item.fieldIssue}`);
    }
  }

  const shouldFail = report.summary.failed > 0 || report.summary.avgQualityScore < 75;
  process.exit(shouldFail ? 1 : 0);
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(2);
});
