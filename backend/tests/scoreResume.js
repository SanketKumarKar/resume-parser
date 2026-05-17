#!/usr/bin/env node
/**
 * Practical ATS friendliness scorer for batches of resumes.
 *
 * Usage:
 *   node tests/scoreResume.js --dir <resumeFolder> [options]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  average,
  discoverFiles,
  extractSignals,
  flattenValues,
  getRawTextInfo,
  isEmpty,
  parseBatchArgs,
  pct,
  printTableRow,
  runPool,
  sendResumeToApi,
  shuffleAndSample,
} from "./batchResumeHelpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCORE_WEIGHTS = {
  parseability: 20,
  contactInfo: 15,
  sectionCompleteness: 20,
  skillsClarity: 15,
  experienceQuality: 15,
  dateStructure: 10,
  linksCleanup: 5,
};

function parseArgs() {
  return parseBatchArgs({
    out: path.join(__dirname, "ats_score_report.json"),
  });
}

function scoreResumeData(data, rawInfo, apiBody, signals) {
  const reasons = [];
  const blockers = [];

  const parseability = scoreParseability(rawInfo, apiBody, reasons, blockers);
  const contactInfo = scoreContactInfo(data, signals, reasons, blockers);
  const sectionCompleteness = scoreSections(data, signals, reasons, blockers);
  const skillsClarity = scoreSkills(data, signals, reasons);
  const experienceQuality = scoreExperience(data, signals, reasons);
  const dateStructure = scoreDates(data, signals, reasons);
  const linksCleanup = scoreLinksAndCleanup(data, rawInfo, apiBody, signals, reasons);

  const categories = {
    parseability,
    contactInfo,
    sectionCompleteness,
    skillsClarity,
    experienceQuality,
    dateStructure,
    linksCleanup,
  };

  const score = Object.entries(categories).reduce((sum, [key, value]) => {
    return sum + value.score;
  }, 0);

  const rounded = Math.max(0, Math.min(100, Math.round(score)));
  const classification = classify(rounded, blockers);

  return {
    score: rounded,
    classification,
    categories,
    blockers,
    reasons: uniqueReasons(reasons),
  };
}

function scoreParseability(rawInfo, apiBody, reasons, blockers) {
  let score = SCORE_WEIGHTS.parseability;

  if (rawInfo.parseError) {
    score -= 12;
    blockers.push("raw_text_parse_failed");
    reasons.push(`Raw text parse failed: ${rawInfo.parseError}`);
  }

  if (rawInfo.textLength === 0) {
    score = 0;
    blockers.push("no_machine_readable_text");
    reasons.push("No machine-readable text was available for ATS checks.");
  } else if (rawInfo.textLength < 250) {
    score -= 8;
    reasons.push("Very low extracted text length; ATS systems may miss content.");
  } else if (rawInfo.textLength < 700) {
    score -= 3;
    reasons.push("Extracted text is short; verify that sections were parsed correctly.");
  }

  if (/image|ocr|svg/.test(rawInfo.sourceType || "")) {
    score -= 3;
    reasons.push(`Parsed through ${rawInfo.sourceType}; image-heavy resumes are higher risk for ATS.`);
  }

  if (apiBody?.fallback) {
    score -= 4;
    reasons.push("API used fallback parsing, so structured extraction confidence is lower.");
  }

  return category(score, SCORE_WEIGHTS.parseability);
}

function scoreContactInfo(data, signals, reasons, blockers) {
  let score = SCORE_WEIGHTS.contactInfo;
  const personal = data?.personal_info || {};

  if (isEmpty(personal.full_name)) {
    score -= 5;
    blockers.push("missing_name");
    reasons.push("Missing candidate full name.");
  }

  if (isEmpty(personal.email)) {
    score -= 5;
    blockers.push("missing_email");
    reasons.push("Missing email address.");
  }

  if (isEmpty(personal.phone)) {
    score -= 3;
    reasons.push("Missing phone number.");
  }

  if (signals.emails.length > 0 && isEmpty(personal.email)) {
    blockers.push("email_seen_but_not_extracted");
    reasons.push("Email appears in raw text but was not extracted.");
  }

  const hasProfessionalLink = !isEmpty(personal.linkedin) || !isEmpty(personal.github) || !isEmpty(personal.portfolio) || !isEmpty(personal.website);
  if (!hasProfessionalLink && signals.links.length > 0) {
    score -= 2;
    reasons.push("Professional links appear in text but are not structured.");
  }

  return category(score, SCORE_WEIGHTS.contactInfo);
}

function scoreSections(data, signals, reasons, blockers) {
  let score = SCORE_WEIGHTS.sectionCompleteness;
  const hasSummary = !isEmpty(data?.summary) || !isEmpty(data?.objective);
  const hasEducation = Array.isArray(data?.education) && data.education.length > 0;
  const hasExperience = Array.isArray(data?.work_experience) && data.work_experience.length > 0;
  const hasProjects = Array.isArray(data?.projects) && data.projects.length > 0;
  const hasSkills = countSkills(data) > 0;

  if (!hasSummary) {
    score -= 3;
    reasons.push("Missing summary or objective section.");
  }

  if (!hasSkills) {
    score -= 5;
    blockers.push("missing_skills_section");
    reasons.push("Missing structured skills section.");
  }

  if (!hasExperience && !hasProjects) {
    score -= 6;
    blockers.push("missing_experience_and_projects");
    reasons.push("Missing both work experience and projects.");
  }

  if (!hasEducation) {
    score -= 3;
    reasons.push("Missing education section.");
  }

  for (const [section, seen] of Object.entries(signals.sections)) {
    if (seen && section !== "summary" && isEmpty(data?.[section])) {
      score -= 2;
      reasons.push(`Raw text has a ${section} section, but JSON output is empty.`);
    }
  }

  return category(score, SCORE_WEIGHTS.sectionCompleteness);
}

function scoreSkills(data, signals, reasons) {
  let score = SCORE_WEIGHTS.skillsClarity;
  const totalSkills = countSkills(data);
  const skillCategories = Object.values(data?.technical_skills || {}).filter((value) => Array.isArray(value) && value.length > 0).length;

  if (totalSkills === 0) {
    score = 0;
    reasons.push("No technical skills were extracted.");
  } else if (totalSkills < 5) {
    score -= 6;
    reasons.push("Few technical skills extracted; ATS keyword matching may be weak.");
  }

  if (skillCategories < 2 && totalSkills > 0) {
    score -= 3;
    reasons.push("Skills are not spread across clear categories.");
  }

  if (signals.skills.length >= 5 && totalSkills < signals.skills.length / 2) {
    score -= 4;
    reasons.push("Many skills appear in raw text but few were captured in JSON.");
  }

  return category(score, SCORE_WEIGHTS.skillsClarity);
}

function scoreExperience(data, signals, reasons) {
  let score = SCORE_WEIGHTS.experienceQuality;
  const experiences = Array.isArray(data?.work_experience) ? data.work_experience : [];
  const projects = Array.isArray(data?.projects) ? data.projects : [];
  const bullets = experiences.reduce((sum, item) => {
    return sum + arrayLength(item.responsibilities) + arrayLength(item.achievements);
  }, 0);
  const projectDescriptions = projects.filter((item) => !isEmpty(item.description)).length;

  if (experiences.length === 0 && projects.length === 0) {
    score = 0;
    reasons.push("No work experience or project entries were extracted.");
  } else {
    if (experiences.length > 0 && bullets === 0) {
      score -= 7;
      reasons.push("Experience entries do not contain responsibility or achievement bullets.");
    } else if (bullets < experiences.length * 2 && experiences.length > 0) {
      score -= 3;
      reasons.push("Experience entries have limited bullet detail.");
    }

    if (projects.length > 0 && projectDescriptions === 0) {
      score -= 3;
      reasons.push("Projects are listed without descriptions.");
    }
  }

  if (signals.hasBullets && bullets === 0 && experiences.length > 0) {
    score -= 3;
    reasons.push("Raw text contains bullets, but experience bullets were not structured.");
  }

  return category(score, SCORE_WEIGHTS.experienceQuality);
}

function scoreDates(data, signals, reasons) {
  let score = SCORE_WEIGHTS.dateStructure;
  const dateValues = flattenValues({
    education: data?.education,
    work_experience: data?.work_experience,
    projects: data?.projects,
    certifications: data?.certifications,
  }).filter((value) => /\b(?:19|20)\d{2}\b|present|current|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(value));

  if (signals.dates.length > 0 && dateValues.length === 0) {
    score -= 6;
    reasons.push("Dates appear in raw text but are not structured in JSON.");
  }

  const educationMissingDates = (data?.education || []).some((item) => isEmpty(item.start_date) && isEmpty(item.end_date));
  const experienceMissingDates = (data?.work_experience || []).some((item) => isEmpty(item.start_date) && isEmpty(item.end_date));

  if (educationMissingDates) {
    score -= 2;
    reasons.push("At least one education entry is missing dates.");
  }
  if (experienceMissingDates) {
    score -= 2;
    reasons.push("At least one experience entry is missing dates.");
  }

  return category(score, SCORE_WEIGHTS.dateStructure);
}

function scoreLinksAndCleanup(data, rawInfo, apiBody, signals, reasons) {
  let score = SCORE_WEIGHTS.linksCleanup;
  const personal = data?.personal_info || {};
  const hasLink = !isEmpty(personal.linkedin) || !isEmpty(personal.github) || !isEmpty(personal.portfolio) || !isEmpty(personal.website);

  if (signals.links.length > 0 && !hasLink) {
    score -= 2;
    reasons.push("Links were detected in raw text but not structured under personal_info.");
  }

  const warningCount = (rawInfo.warnings || []).length + (apiBody?.warnings || []).length;
  if (warningCount > 0) {
    score -= Math.min(2, warningCount);
    reasons.push("Parser warnings were emitted; inspect the report before trusting ATS score.");
  }

  if (/metadata|base64|xml|style/i.test(JSON.stringify(data || {}))) {
    score -= 2;
    reasons.push("Output may contain document artifacts or metadata-like content.");
  }

  return category(score, SCORE_WEIGHTS.linksCleanup);
}

async function scoreFile(filePath, opts, baseDir) {
  const started = Date.now();
  const relativePath = path.relative(baseDir, filePath);
  const rawInfo = await getRawTextInfo(filePath);
  const signals = extractSignals(rawInfo.text);
  const apiResult = await sendResumeToApi(filePath, opts.url, opts.timeout);
  const baseRecord = {
    file: path.basename(filePath),
    path: filePath,
    relativePath,
    ext: path.extname(filePath).toLowerCase(),
    elapsed: Date.now() - started,
    status: apiResult.status,
    sourceType: rawInfo.sourceType,
    textLength: rawInfo.textLength,
    parseError: rawInfo.parseError,
  };

  if (apiResult.error) {
    return {
      ...baseRecord,
      result: apiResult.error === "request_timeout" ? "TIMEOUT" : "ERROR",
      score: 0,
      classification: "NOT_ATS_FRIENDLY",
      blockers: [apiResult.error],
      reasons: [`API request failed: ${apiResult.error}`],
    };
  }

  if (apiResult.status !== 200 || !apiResult.body?.success) {
    return {
      ...baseRecord,
      result: "HTTP_ERROR",
      score: 0,
      classification: "NOT_ATS_FRIENDLY",
      blockers: ["api_extraction_failed"],
      reasons: [apiResult.body?.error || `API returned HTTP ${apiResult.status}`],
    };
  }

  const scored = scoreResumeData(apiResult.body.data || {}, rawInfo, apiResult.body, signals);
  return {
    ...baseRecord,
    result: "SCORED",
    fallback: Boolean(apiResult.body.fallback),
    apiSourceType: apiResult.body.sourceType,
    apiTextLength: apiResult.body.textLength,
    score: scored.score,
    classification: scored.classification,
    categories: scored.categories,
    blockers: scored.blockers,
    reasons: scored.reasons,
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

function classify(score, blockers) {
  if (score >= 80 && blockers.length === 0) return "ATS_FRIENDLY";
  if (score >= 60 && blockers.length <= 1) return "NEEDS_IMPROVEMENT";
  return "NOT_ATS_FRIENDLY";
}

function category(score, max) {
  const bounded = Math.max(0, Math.min(max, score));
  return {
    score: Number(bounded.toFixed(1)),
    max,
    pct: Math.round((bounded / max) * 100),
  };
}

function buildReport({ opts, files, results, elapsedSeconds }) {
  const scored = results.filter((result) => result.result === "SCORED");
  const failed = results.filter((result) => result.result !== "SCORED");
  const classifications = {
    ATS_FRIENDLY: scored.filter((result) => result.classification === "ATS_FRIENDLY").length,
    NEEDS_IMPROVEMENT: scored.filter((result) => result.classification === "NEEDS_IMPROVEMENT").length,
    NOT_ATS_FRIENDLY: scored.filter((result) => result.classification === "NOT_ATS_FRIENDLY").length,
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
    summary: {
      total: files.length,
      scored: scored.length,
      failed: failed.length,
      averageScore: Math.round(average(scored.map((result) => result.score))),
      classifications,
      atsFriendlyRate: `${pct(classifications.ATS_FRIENDLY, scored.length)}%`,
      needsImprovementRate: `${pct(classifications.NEEDS_IMPROVEMENT, scored.length)}%`,
      notFriendlyRate: `${pct(classifications.NOT_ATS_FRIENDLY, scored.length)}%`,
      topReasons: buildTopReasons(scored),
      byExtension: buildExtensionSummary(results),
    },
    bestFiles: scored
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(compactResult),
    worstFiles: scored
      .slice()
      .sort((a, b) => a.score - b.score)
      .slice(0, 20)
      .map(compactResult),
    failedFiles: failed.map((result) => ({
      file: result.relativePath,
      result: result.result,
      status: result.status,
      reasons: result.reasons,
    })),
    allResults: results,
  };
}

function compactResult(result) {
  return {
    file: result.relativePath,
    score: result.score,
    classification: result.classification,
    blockers: result.blockers,
    reasons: result.reasons.slice(0, 8),
  };
}

function buildTopReasons(results) {
  const counts = {};
  for (const result of results) {
    for (const reason of result.reasons || []) {
      counts[reason] = (counts[reason] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([reason, count]) => ({ reason, count }));
}

function buildExtensionSummary(results) {
  const byExtension = {};
  for (const result of results) {
    if (!byExtension[result.ext]) {
      byExtension[result.ext] = {
        total: 0,
        scored: 0,
        failed: 0,
        averageScore: 0,
        atsFriendly: 0,
        needsImprovement: 0,
        notFriendly: 0,
      };
    }

    const bucket = byExtension[result.ext];
    bucket.total++;
    if (result.result === "SCORED") {
      bucket.scored++;
      bucket.averageScore += result.score;
      if (result.classification === "ATS_FRIENDLY") bucket.atsFriendly++;
      if (result.classification === "NEEDS_IMPROVEMENT") bucket.needsImprovement++;
      if (result.classification === "NOT_ATS_FRIENDLY") bucket.notFriendly++;
    } else {
      bucket.failed++;
    }
  }

  for (const bucket of Object.values(byExtension)) {
    bucket.averageScore = bucket.scored ? Math.round(bucket.averageScore / bucket.scored) : 0;
  }
  return byExtension;
}

function countSkills(data) {
  const skills = data?.technical_skills;
  if (!skills || typeof skills !== "object" || Array.isArray(skills)) return 0;
  return Object.values(skills).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0);
}

function arrayLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

function uniqueReasons(reasons) {
  return [...new Set(reasons)].slice(0, 25);
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

  console.log(`\nScoring ${files.length} resumes for practical ATS friendliness`);
  console.log(`API: ${opts.url}/api/extract`);
  console.log(`Directory: ${opts.dir}\n`);

  if (!opts.quiet) {
    console.log(printTableRow(["#", "File", "Class", "Score", "Reasons"], [5, 42, 20, 7, 8]));
    console.log("-".repeat(90));
  }

  const results = await runPool(files, opts.concurrency, async (filePath, index) => {
    const result = await scoreFile(filePath, opts, opts.dir);
    processed++;

    if (!opts.quiet) {
      console.log(printTableRow([
        index + 1,
        result.relativePath,
        result.classification,
        result.score,
        result.reasons?.length || 0,
      ], [5, 42, 20, 7, 8]));
    } else if (processed % opts.batch === 0 || processed === files.length) {
      const rate = processed / ((Date.now() - start) / 1000);
      console.log(`Processed ${processed}/${files.length} (${rate.toFixed(1)} files/s)`);
    }

    return result;
  });

  const elapsedSeconds = Number(((Date.now() - start) / 1000).toFixed(1));
  const report = buildReport({ opts, files, results, elapsedSeconds });
  fs.writeFileSync(opts.out, JSON.stringify(report, null, 2));

  console.log("\nATS Score Summary");
  console.log("-".repeat(52));
  console.log(`Total files:           ${report.summary.total}`);
  console.log(`Scored / Failed:       ${report.summary.scored} / ${report.summary.failed}`);
  console.log(`Average score:         ${report.summary.averageScore}`);
  console.log(`ATS friendly:          ${report.summary.classifications.ATS_FRIENDLY} (${report.summary.atsFriendlyRate})`);
  console.log(`Needs improvement:     ${report.summary.classifications.NEEDS_IMPROVEMENT} (${report.summary.needsImprovementRate})`);
  console.log(`Not ATS friendly:      ${report.summary.classifications.NOT_ATS_FRIENDLY} (${report.summary.notFriendlyRate})`);
  console.log(`Elapsed:               ${elapsedSeconds}s`);
  console.log(`Report saved to:       ${opts.out}`);

  if (report.summary.topReasons.length > 0) {
    console.log("\nTop Reasons");
    for (const item of report.summary.topReasons.slice(0, 10)) {
      console.log(`- ${item.count} ${item.reason}`);
    }
  }

  process.exit(report.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(2);
});
