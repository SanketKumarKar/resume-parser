const STRING_FIELDS = Symbol("string-fields");

const RESUME_SCHEMA = {
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

  return sortObjectKeys(result);
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

  return sortObjectKeys(result);
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
  return sortObjectKeys(result);
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
    return sortObjectKeys(result);
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

function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!isPlainObject(value)) return value;
  const result = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    result[key] = sortObjectKeys(value[key]);
  }
  return result;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
