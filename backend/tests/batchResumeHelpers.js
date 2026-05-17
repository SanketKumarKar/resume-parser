import fs from "fs";
import path from "path";
import { extractTextFromFile } from "../fileParser.js";

export const SUPPORTED_EXTS = new Set([
  ".pdf", ".docx", ".doc", ".rtf", ".txt", ".html", ".htm",
  ".odt", ".md", ".markdown", ".jpg", ".jpeg", ".png", ".webp", ".svg",
]);

export const MIME_TYPES = {
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

export const COMMON_SKILLS = [
  "python", "javascript", "typescript", "java", "c++", "c#", "sql", "html", "css",
  "react", "angular", "vue", "node", "express", "django", "flask", "spring",
  "aws", "azure", "gcp", "docker", "kubernetes", "git", "github", "mongodb",
  "postgresql", "mysql", "excel", "power bi", "tableau", "figma", "jira",
  "selenium", "cypress", "pytest", "linux", "agile", "scrum",
];

export const SECTION_PATTERNS = {
  education: /\b(education|academic|qualification|degree|university|college)\b/i,
  work_experience: /\b(experience|employment|work history|professional experience|internship)\b/i,
  projects: /\b(projects?|portfolio)\b/i,
  technical_skills: /\b(skills?|technical skills|technologies|tools|programming)\b/i,
  certifications: /\b(certifications?|licenses?)\b/i,
  summary: /\b(summary|profile|objective|about)\b/i,
};

export const EXPECTED_SCHEMA = {
  personal_info: {
    type: "object",
    fields: {
      full_name: "string",
      email: "string",
      phone: "string",
      address: "string",
      city: "string",
      state: "string",
      country: "string",
      zip_code: "string",
      linkedin: "string",
      github: "string",
      portfolio: "string",
      website: "string",
      other_social: "array",
    },
  },
  objective: { type: "string" },
  summary: { type: "string" },
  education: { type: "array" },
  work_experience: { type: "array" },
  technical_skills: {
    type: "object",
    fields: {
      programming_languages: "array",
      frameworks_libraries: "array",
      databases: "array",
      cloud_platforms: "array",
      tools_software: "array",
      operating_systems: "array",
      methodologies: "array",
      other: "array",
    },
  },
  soft_skills: { type: "array" },
  projects: { type: "array" },
  certifications: { type: "array" },
  awards_honors: { type: "array" },
  publications: { type: "array" },
  languages: { type: "array" },
  volunteer_experience: { type: "array" },
  extracurricular_activities: { type: "array" },
  interests_hobbies: { type: "array" },
  references: { type: "array" },
  additional_sections: { type: "object" },
};

export function parseBatchArgs(defaults = {}) {
  const args = process.argv.slice(2);
  const opts = {
    dir: null,
    url: "http://localhost:5000",
    concurrency: 2,
    batch: 100,
    out: defaults.out,
    timeout: 60000,
    resumeFrom: 0,
    sample: 0,
    quiet: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dir":
      case "-d":
        opts.dir = args[++i];
        break;
      case "--url":
      case "-u":
        opts.url = args[++i];
        break;
      case "--concurrency":
      case "-c":
        opts.concurrency = Number.parseInt(args[++i], 10);
        break;
      case "--batch":
      case "-b":
        opts.batch = Number.parseInt(args[++i], 10);
        break;
      case "--out":
      case "-o":
        opts.out = args[++i];
        break;
      case "--timeout":
      case "-t":
        opts.timeout = Number.parseInt(args[++i], 10);
        break;
      case "--resume-from":
        opts.resumeFrom = Number.parseInt(args[++i], 10);
        break;
      case "--sample":
        opts.sample = Number.parseInt(args[++i], 10);
        break;
      case "--quiet":
      case "-q":
        opts.quiet = true;
        break;
      default:
        break;
    }
  }

  opts.concurrency = Number.isFinite(opts.concurrency) && opts.concurrency > 0 ? opts.concurrency : 2;
  opts.batch = Number.isFinite(opts.batch) && opts.batch > 0 ? opts.batch : 100;
  opts.timeout = Number.isFinite(opts.timeout) && opts.timeout > 0 ? opts.timeout : 60000;
  opts.resumeFrom = Number.isFinite(opts.resumeFrom) && opts.resumeFrom > 0 ? opts.resumeFrom : 0;
  opts.sample = Number.isFinite(opts.sample) && opts.sample > 0 ? opts.sample : 0;

  if (!opts.dir) {
    throw new Error("--dir is required. Pass the folder containing resumes.");
  }
  if (!opts.out) {
    throw new Error("--out default was not configured.");
  }

  opts.dir = path.resolve(opts.dir);
  opts.out = path.resolve(opts.out);
  opts.url = opts.url.replace(/\/+$/, "");
  return opts;
}

export function discoverFiles(dir) {
  const results = [];

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.name.startsWith("~$")) continue;
      if (SUPPORTED_EXTS.has(path.extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results.sort((a, b) => a.localeCompare(b));
}

export function shuffleAndSample(files, sampleSize) {
  const copy = [...files];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return sampleSize > 0 && sampleSize < copy.length ? copy.slice(0, sampleSize) : copy;
}

export function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

export async function getRawTextInfo(filePath) {
  try {
    const parsed = await extractTextFromFile(filePath, getMimeType(filePath), path.basename(filePath));
    const text = parsed.text || "";
    return {
      text,
      textLength: text.length,
      sourceType: parsed.sourceType || "unknown",
      warnings: parsed.warnings || [],
      parseError: null,
    };
  } catch (err) {
    return {
      text: "",
      textLength: 0,
      sourceType: "parse_failed",
      warnings: [],
      parseError: err.message,
    };
  }
}

export async function sendResumeToApi(filePath, apiUrl, timeoutMs) {
  const formData = new FormData();
  const buffer = fs.readFileSync(filePath);
  formData.append("resume", new Blob([buffer]), path.basename(filePath));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${apiUrl}/api/extract`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timer);

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = { error: "API returned non-JSON response." };
    }

    return { status: response.status, body, error: null };
  } catch (err) {
    clearTimeout(timer);
    return { status: 0, body: null, error: err.name === "AbortError" ? "request_timeout" : err.message };
  }
}

export async function runPool(items, concurrency, handler) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await handler(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

export function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[^a-z0-9+#.@:/ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function jsonText(value) {
  return normalizeText(JSON.stringify(value || {}));
}

export function flattenValues(value) {
  const out = [];
  function visit(node) {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node === "object") {
      Object.values(node).forEach(visit);
      return;
    }
    out.push(String(node));
  }
  visit(value);
  return out;
}

export function extractSignals(rawText) {
  const text = rawText || "";
  const normalized = normalizeText(text);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const emails = unique(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []);
  const phones = unique(text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || []).map((phone) => phone.trim());
  const links = unique(text.match(/(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/[^\s),;]+|github\.com\/[^\s),;]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\/[^\s),;]+)/gi) || []);
  const dates = unique(text.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}|\b(?:19|20)\d{2}\b/gi) || []);
  const skills = COMMON_SKILLS.filter((skill) => includesTerm(normalized, skill));
  const sections = {};

  for (const [key, pattern] of Object.entries(SECTION_PATTERNS)) {
    sections[key] = pattern.test(text);
  }

  return {
    emails,
    phones,
    links,
    dates,
    skills,
    sections,
    lineCount: lines.length,
    hasBullets: /(^|\n)\s*(?:[-*\u2022]|\d+[.)])\s+\S/.test(text),
    normalized,
  };
}

export function includesTerm(normalizedHaystack, term) {
  const normalizedTerm = normalizeText(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9+#])${normalizedTerm}([^a-z0-9+#]|$)`, "i").test(normalizedHaystack);
}

export function valueAppearsInJson(value, data) {
  const needle = normalizeText(value);
  if (!needle) return true;
  return jsonText(data).includes(needle);
}

export function hasAnyValue(values, data) {
  return values.some((value) => valueAppearsInJson(value, data));
}

export function unique(values) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

export function average(values) {
  const nums = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

export function pct(part, total) {
  return total > 0 ? Number(((part / total) * 100).toFixed(1)) : 0;
}

export function countPopulatedFields(data) {
  const fields = flattenSchemaPaths(EXPECTED_SCHEMA);
  let populated = 0;
  for (const field of fields) {
    if (!isEmpty(getPath(data, field))) populated++;
  }
  return { populated, total: fields.length, percent: Math.round((populated / fields.length) * 100) };
}

export function flattenSchemaPaths(schema, prefix = "") {
  const fields = [];
  for (const [key, rule] of Object.entries(schema)) {
    const full = prefix ? `${prefix}.${key}` : key;
    fields.push(full);
    if (rule.fields) {
      for (const childKey of Object.keys(rule.fields)) {
        fields.push(`${full}.${childKey}`);
      }
    }
  }
  return fields;
}

export function getPath(obj, dotPath) {
  return dotPath.split(".").reduce((current, part) => current?.[part], obj);
}

export function typeOfRule(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

export function printTableRow(columns, widths) {
  return columns.map((col, index) => truncate(String(col), widths[index]).padEnd(widths[index])).join("  ");
}

export function truncate(value, maxLength) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}~` : text;
}
