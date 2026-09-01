const STRING_FIELDS = Symbol("string-fields");

const RESUME_SCHEMA = {
  is_resume: true,
  personal_info: {
    full_name: null,
    email: null,
    phone: null,
    address: null,
    city: null,
    state: null,
    country: null,
    zip_code: null,
    linkedin: null,
    github: null,
    portfolio: null,
    website: null,
    other_social: [],
  },
  objective: null,
  summary: null,
  education: [],
  work_experience: [],
  technical_skills: {
    programming_languages: [],
    frameworks_libraries: [],
    databases: [],
    cloud_platforms: [],
    tools_software: [],
    operating_systems: [],
    methodologies: [],
    other: [],
  },
  soft_skills: [],
  projects: [],
  certifications: [],
  awards_honors: [],
  publications: [],
  languages: [],
  volunteer_experience: [],
  extracurricular_activities: [],
  interests_hobbies: [],
  references: [],
  additional_sections: {},
};

const ITEM_SCHEMAS = {
  education: {
    degree: null,
    field_of_study: null,
    institution: null,
    location: null,
    start_date: null,
    end_date: null,
    gpa: null,
    honors: null,
    relevant_coursework: [],
  },
  work_experience: {
    job_title: null,
    company: null,
    location: null,
    start_date: null,
    end_date: null,
    is_current: false,
    responsibilities: [],
    achievements: [],
  },
  projects: {
    name: null,
    description: null,
    technologies_used: [],
    start_date: null,
    end_date: null,
    url: null,
    github_link: null,
  },
  certifications: {
    name: null,
    issuing_organization: null,
    issue_date: null,
    expiry_date: null,
    credential_id: null,
    url: null,
  },
  awards_honors: {
    title: null,
    issuer: null,
    date: null,
    description: null,
  },
  publications: {
    title: null,
    publisher: null,
    date: null,
    url: null,
    description: null,
  },
  languages: {
    language: null,
    proficiency: null,
  },
  volunteer_experience: {
    role: null,
    organization: null,
    start_date: null,
    end_date: null,
    description: null,
  },
  references: {
    name: null,
    title: null,
    company: null,
    email: null,
    phone: null,
    relationship: null,
  },
};

const SET_LIKE_ARRAY_PATHS = new Set([
  "personal_info.other_social",
  "technical_skills.programming_languages",
  "technical_skills.frameworks_libraries",
  "technical_skills.databases",
  "technical_skills.cloud_platforms",
  "technical_skills.tools_software",
  "technical_skills.operating_systems",
  "technical_skills.methodologies",
  "technical_skills.other",
  "soft_skills",
  "extracurricular_activities",
  "interests_hobbies",
]);

const CHRONOLOGICAL_ARRAY_PATHS = new Set([
  "education",
  "work_experience",
  "projects",
  "certifications",
  "awards_honors",
  "publications",
  "volunteer_experience",
]);

/**
 * Canonicalizes unstructured or partially structured resume data into the strict JSON schema
 * expected by the application. Enforces types, default values, and structure.
 *
 * @param {Object} input - Raw JSON data from AI or local parser
 * @returns {Object} Canonicalized resume data adhering to RESUME_SCHEMA
 */
export function canonicalizeResumeData(input = {}) {
  const source = isPlainObject(input) ? input : {};
  const result = {};

  for (const [key, defaultValue] of Object.entries(RESUME_SCHEMA)) {
    if (key === "additional_sections") continue;
    result[key] = canonicalizeKnownField(key, source[key], defaultValue);
  }

  result.additional_sections = canonicalizeAdditionalSections(source.additional_sections);

  for (const [key, value] of Object.entries(source)) {
    if (key in RESUME_SCHEMA || value === undefined) continue;
    result.additional_sections[slugifySectionKey(key)] = canonicalizeValue(value, `additional_sections.${key}`);
  }

  normalizeSkillBuckets(result);
  postValidate(result);

  return result;
}

export function normalizeTextValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  const normalized = String(value)
    .replace(/\u00a0/g, " ")
    .replace(/â€¢|•|·|▪|◦|●/g, "-")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized || /^null|undefined|n\/a|na$/i.test(normalized)) return null;
  return normalized;
}

export function slugifySectionKey(key) {
  const normalized = normalizeTextValue(key) || "section";
  return normalized
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "section";
}

function canonicalizeKnownField(key, value, defaultValue) {
  if (Array.isArray(defaultValue)) {
    return canonicalizeArray(Array.isArray(value) ? value : [], key);
  }
  if (isPlainObject(defaultValue)) {
    return canonicalizeObjectWithDefaults(value, defaultValue, key);
  }
  if (typeof defaultValue === "boolean") {
    if (value === undefined || value === null) return defaultValue;
    return typeof value === "boolean" ? value : Boolean(value && String(value).toLowerCase() === "true");
  }
  return normalizeTextValue(value);
}

function canonicalizeObjectWithDefaults(value, defaults, path) {
  const source = isPlainObject(value) ? value : {};
  const result = {};

  for (const [key, defaultValue] of Object.entries(defaults)) {
    const childPath = `${path}.${key}`;
    if (Array.isArray(defaultValue)) {
      result[key] = canonicalizeArray(Array.isArray(source[key]) ? source[key] : [], childPath);
    } else if (isPlainObject(defaultValue)) {
      result[key] = canonicalizeObjectWithDefaults(source[key], defaultValue, childPath);
    } else if (typeof defaultValue === "boolean") {
      result[key] = typeof source[key] === "boolean" ? source[key] : Boolean(source[key] && String(source[key]).toLowerCase() === "true");
    } else {
      result[key] = normalizeTextValue(source[key]);
    }
  }

  for (const [key, extraValue] of Object.entries(source)) {
    if (key in defaults || extraValue === undefined) continue;
    result[slugifySectionKey(key)] = canonicalizeValue(extraValue, `${path}.${key}`);
  }

  return result;
}

function canonicalizeArray(value, path) {
  const arr = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
  const itemSchema = ITEM_SCHEMAS[path];
  let canonical = arr
    .map((item, index) => {
      if (itemSchema) {
        const canonicalItem = canonicalizeObjectWithDefaults(item, itemSchema, `${path}[]`);
        return {
          ...normalizeStructuredItem(path, canonicalItem),
          [STRING_FIELDS]: { originalIndex: index },
        };
      }
      return canonicalizeValue(item, `${path}[]`);
    })
    .filter((item) => !isEmptyCanonicalValue(item));

  canonical = dedupeArray(canonical);

  if (SET_LIKE_ARRAY_PATHS.has(path) || path.startsWith("additional_sections.")) {
    canonical.sort(compareStableValues);
  } else if (CHRONOLOGICAL_ARRAY_PATHS.has(path)) {
    canonical.sort(compareChronologicalItems);
  }

  return canonical.map((item) => {
    if (isPlainObject(item) && item[STRING_FIELDS]) {
      const { [STRING_FIELDS]: _meta, ...clean } = item;
      return clean;
    }
    return item;
  });
}

function normalizeStructuredItem(path, item) {
  if (path === "education" && item.degree && !item.field_of_study && item.degree.includes(":")) {
    const [degree, ...fieldParts] = item.degree.split(":");
    const field = fieldParts.join(":").trim();
    if (degree.trim() && field) {
      return {
        ...item,
        degree: normalizeTextValue(degree),
        field_of_study: normalizeTextValue(field),
      };
    }
  }
  return item;
}

function canonicalizeAdditionalSections(value) {
  const source = isPlainObject(value) ? value : {};
  const result = {};
  for (const [key, sectionValue] of Object.entries(source)) {
    if (sectionValue === undefined) continue;
    const normalizedKey = slugifySectionKey(key);
    const canonicalValue = canonicalizeValue(sectionValue, `additional_sections.${normalizedKey}`);
    if (!isEmptyCanonicalValue(canonicalValue)) {
      result[normalizedKey] = canonicalValue;
    }
  }
  return result;
}

function normalizeSkillBuckets(resume) {
  const tech = resume.technical_skills || {};
  tech.other = Array.isArray(tech.other) ? tech.other : [];
  resume.soft_skills = Array.isArray(resume.soft_skills) ? resume.soft_skills : [];

  const genericSkills = takeAdditionalSectionArray(resume.additional_sections, "skills");
  for (const skill of genericSkills) {
    addSkillToDeterministicBucket(resume, skill);
  }

  const stableOther = [];
  for (const skill of tech.other) {
    if (isSoftSkill(skill)) addUnique(resume.soft_skills, skill);
    else stableOther.push(skill);
  }
  tech.other = stableOther;

  const stableSoft = [];
  for (const skill of resume.soft_skills) {
    if (isClearlyTechnicalSkill(skill)) addUnique(tech.other, skill);
    else stableSoft.push(skill);
  }
  resume.soft_skills = stableSoft;

  tech.other = dedupeArray(tech.other).sort(compareStableValues);
  resume.soft_skills = dedupeArray(resume.soft_skills).sort(compareStableValues);
}

function takeAdditionalSectionArray(sections, key) {
  if (!isPlainObject(sections) || !(key in sections)) return [];
  const value = sections[key];
  delete sections[key];
  if (Array.isArray(value)) return value.filter((item) => !isEmptyCanonicalValue(item));
  if (typeof value === "string") return splitSkillList(value);
  return [];
}

function splitSkillList(value) {
  return String(value)
    .split(/\n|;|\s+\|\s+/)
    .map((item) => normalizeTextValue(item))
    .filter(Boolean);
}

function addSkillToDeterministicBucket(resume, skill) {
  if (isEmptyCanonicalValue(skill)) return;
  const target = isSoftSkill(skill) && !isClearlyTechnicalSkill(skill)
    ? resume.soft_skills
    : resume.technical_skills.other;
  addUnique(target, skill);
}

function addUnique(arr, value) {
  const normalized = normalizeTextValue(value);
  if (!normalized) return;
  const key = normalized.toLowerCase();
  if (!arr.some((item) => normalizeTextValue(item)?.toLowerCase() === key)) {
    arr.push(normalized);
  }
}

function isSoftSkill(value) {
  const text = String(value || "").toLowerCase();
  return /\b(communication|communicator|interpersonal|presentation|negotiation|leadership|team|collaboration|customer|client relationship|organizational|organisation|time management|detail[- ]oriented|attention to detail|problem[- ]solving|analytical|analytic|decision[- ]making|adaptability|flexibility|mentoring|training|spoken|written|english|mandarin|people manager|tenacity|results oriented)\b/.test(text);
}

function isClearlyTechnicalSkill(value) {
  const text = String(value || "").toLowerCase();
  return /\b(javascript|typescript|python|java|php|c\+\+|c#|sql|mysql|postgres|mongodb|react|angular|vue|node|express|laravel|spring|django|flask|aws|azure|gcp|docker|kubernetes|jenkins|jira|git|linux|unix|windows|html|css|api|rest|graphql|sap|autocad|ptc|creo|solidworks|matlab|oracle|server|network|tcp\/ip|devops|agile|scrum|sdlc|database|software|hardware|testing|automation|scripting|excel|powerpoint|ms office)\b/.test(text);
}

function canonicalizeValue(value, path) {
  if (Array.isArray(value)) return canonicalizeArray(value, path);
  if (isPlainObject(value)) {
    const result = {};
    for (const [key, childValue] of Object.entries(value)) {
      if (childValue === undefined) continue;
      const normalizedKey = path.startsWith("additional_sections") ? slugifySectionKey(key) : key;
      const canonicalChild = canonicalizeValue(childValue, `${path}.${normalizedKey}`);
      if (!isEmptyCanonicalValue(canonicalChild)) result[normalizedKey] = canonicalChild;
    }
    return result;
  }
  return normalizeTextValue(value);
}

function dedupeArray(arr) {
  const seen = new Set();
  const deduped = [];
  for (const item of arr) {
    const key = JSON.stringify(stripMeta(item)).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function compareChronologicalItems(a, b) {
  const dateA = bestDateScore(a);
  const dateB = bestDateScore(b);
  if (dateA !== dateB) return dateB - dateA;

  const originalA = a?.[STRING_FIELDS]?.originalIndex ?? 0;
  const originalB = b?.[STRING_FIELDS]?.originalIndex ?? 0;
  if (originalA !== originalB) return originalA - originalB;

  return compareStableValues(a, b);
}

function bestDateScore(item) {
  if (!isPlainObject(item)) return 0;
  const candidates = [
    item.end_date,
    item.issue_date,
    item.date,
    item.start_date,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (/present|current|now/i.test(candidate)) return 999999;
    const year = String(candidate).match(/\b(19|20)\d{2}\b/);
    if (!year) continue;
    const month = monthScore(candidate);
    return Number(year[0]) * 100 + month;
  }
  return 0;
}

function monthScore(value) {
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const lowered = String(value).toLowerCase();
  const named = months.findIndex((m) => lowered.includes(m));
  if (named >= 0) return named + 1;
  const numeric = lowered.match(/\b(0?[1-9]|1[0-2])\b/);
  return numeric ? Number(numeric[1]) : 0;
}

function compareStableValues(a, b) {
  return JSON.stringify(stripMeta(a)).localeCompare(JSON.stringify(stripMeta(b)), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function stripMeta(value) {
  if (Array.isArray(value)) return value.map(stripMeta);
  if (!isPlainObject(value)) return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === STRING_FIELDS.toString()) continue;
    result[key] = stripMeta(child);
  }
  return result;
}

function isEmptyCanonicalValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "boolean") return value === false;
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) {
    return Object.entries(value)
      .filter(([key]) => key !== STRING_FIELDS.toString())
      .every(([, child]) => isEmptyCanonicalValue(child));
  }
  return false;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Post-processing validation — catch common multi-column parsing artifacts
// ---------------------------------------------------------------------------

function postValidate(resume) {
  cleanPersonalInfoArtifacts(resume.personal_info);
  deduplicateWorkResponsibilities(resume.work_experience);
}

/**
 * Clean stray leading digits, isolated characters, and layout artifacts from
 * personal_info fields like address, city, state, country.
 */
function cleanPersonalInfoArtifacts(info) {
  if (!isPlainObject(info)) return;

  const fieldsToClean = ["address", "city", "state", "country", "zip_code", "full_name"];
  for (const field of fieldsToClean) {
    if (typeof info[field] !== "string") continue;
    // Remove stray leading single digits/characters that are layout artifacts (e.g. "9 Chennai" → "Chennai")
    info[field] = info[field]
      .replace(/^\d\s+/, "")  // Leading single digit + space
      .replace(/^[^a-zA-Z0-9]+/, "") // Leading non-alphanumeric junk
      .trim();
    if (!info[field]) info[field] = null;
  }
}

/**
 * If the same responsibility/achievement bullet appears in multiple work entries,
 * keep it only in the first (most recent) entry where it appears.
 */
function deduplicateWorkResponsibilities(workExperience) {
  if (!Array.isArray(workExperience) || workExperience.length < 2) return;

  const seenResponsibilities = new Set();
  const seenAchievements = new Set();

  for (const job of workExperience) {
    if (Array.isArray(job.responsibilities)) {
      job.responsibilities = job.responsibilities.filter((r) => {
        const key = normalizeTextValue(r)?.toLowerCase();
        if (!key || seenResponsibilities.has(key)) return false;
        seenResponsibilities.add(key);
        return true;
      });
    }
    if (Array.isArray(job.achievements)) {
      job.achievements = job.achievements.filter((a) => {
        const key = normalizeTextValue(a)?.toLowerCase();
        if (!key || seenAchievements.has(key)) return false;
        seenAchievements.add(key);
        return true;
      }); 
    }
  }
}
