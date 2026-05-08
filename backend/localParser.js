/**
 * A basic local resume parser that uses regular expressions and keyword matching
 * to extract information from raw text. This serves as a fallback when the
 * AI-based extraction fails.
 */

export function extractLocalData(text) {
  if (!text) return createEmptyResume();

  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  
  const data = createEmptyResume();

  // 1. Try to extract Name (usually the first non-empty line)
  if (lines.length > 0) {
    data.personal_info.full_name = lines[0].substring(0, 50); // Sanity check length
  }

  // 2. Extract Email
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    data.personal_info.email = emailMatch[0];
  }

  // 3. Extract Phone
  const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) {
    data.personal_info.phone = phoneMatch[0];
  }

  // 4. Extract Social Links
  const linkedinMatch = text.match(/linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);
  if (linkedinMatch) data.personal_info.linkedin = "https://www." + linkedinMatch[0];

  const githubMatch = text.match(/github\.com\/[a-zA-Z0-9_-]+/i);
  if (githubMatch) data.personal_info.github = "https://www." + githubMatch[0];

  // 5. Extract Skills (Keyword Matching)
  const commonSkills = [
    "JavaScript", "Python", "Java", "C\\+\\+", "React", "Node\\.js", "Express", 
    "SQL", "MongoDB", "AWS", "Docker", "Kubernetes", "TypeScript", "Angular",
    "Vue", "HTML", "CSS", "Git", "PHP", "Ruby", "Swift", "Kotlin", "Go"
  ];
  
  commonSkills.forEach(skill => {
    const regex = new RegExp(`\\b${skill}\\b`, "i");
    if (regex.test(text)) {
      data.technical_skills.other.push(skill.replace(/\\/g, ""));
    }
  });

  // 6. Summary / Objective (Heuristic: look for those headers)
  const summaryHeaderMatch = text.match(/(?:SUMMARY|OBJECTIVE|PROFILE)[:\s]+([\s\S]+?)(?=\n[A-Z\s]{5,}|$)/i);
  if (summaryHeaderMatch) {
    data.summary = summaryHeaderMatch[1].trim();
  }

  return data;
}

function createEmptyResume() {
  return {
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
      other_social: []
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
      other: []
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
    is_fallback: true // Flag to indicate this is not AI-generated
  };
}
