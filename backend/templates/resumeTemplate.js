/**
 * resumeTemplate.js
 * Formats extracted resume data into a clean, structured resume object
 * This object is used to generate PDF and other formats
 */

export function formatResumeData(extractedData) {
  if (!extractedData) return {};

  const {
    personal_info = {},
    professional_summary = "",
    objective = "",
    work_experience = [],
    education = [],
    skills = {},
    projects = [],
    certifications = [],
    awards = [],
    publications = [],
    languages = [],
    volunteer = [],
    references = [],
    hobbies = [],
  } = extractedData;

  // Personal info
  const {
    full_name = "",
    email = "",
    phone = "",
    address = "",
    city = "",
    state = "",
    country = "",
    linkedin_url = "",
    github_url = "",
    portfolio_url = "",
  } = personal_info;

  // Combine location into one string
  const location = [city, state, country]
    .filter((x) => x && x.trim())
    .join(", ");

  // Format work experience
  const formattedWorkExp = (work_experience || [])
    .filter((exp) => exp && Object.keys(exp).length > 0)
    .map((exp) => ({
      company: exp.company || "",
      job_title: exp.job_title || exp.position || exp.title || "",
      location: exp.location || "",
      start_date: exp.start_date || exp.from || "",
      end_date: exp.end_date || exp.to || exp.present ? "Present" : "",
      responsibilities: Array.isArray(exp.responsibilities) ? exp.responsibilities : [],
      achievements: Array.isArray(exp.achievements) ? exp.achievements : [],
      description: exp.description || "",
    }));

  // Format education
  const formattedEducation = (education || [])
    .filter((edu) => edu && Object.keys(edu).length > 0)
    .map((edu) => ({
      institution: edu.institution || edu.university || edu.school || "",
      degree: edu.degree || edu.qualification || "",
      field_of_study: edu.field_of_study || edu.major || edu.specialization || "",
      location: edu.location || "",
      start_date: edu.start_date || edu.from || "",
      end_date: edu.end_date || edu.to || "",
      gpa: edu.gpa || edu.cgpa || "",
      honors: edu.honors || edu.achievements || "",
    }));

  // Format skills (flatten nested categories)
  const formattedSkills = formatSkills(skills);

  // Format projects
  const formattedProjects = (projects || [])
    .filter((proj) => proj && Object.keys(proj).length > 0)
    .map((proj) => ({
      name: proj.name || proj.title || "",
      description: proj.description || "",
      technologies: Array.isArray(proj.technologies_used) ? proj.technologies_used : [],
      start_date: proj.start_date || proj.from || "",
      end_date: proj.end_date || proj.to || "",
      url: proj.url || proj.link || "",
      github: proj.github_url || proj.github || "",
    }));

  // Format certifications
  const formattedCertifications = (certifications || [])
    .filter((cert) => cert && Object.keys(cert).length > 0)
    .map((cert) => ({
      name: cert.name || cert.certification_name || "",
      issuer: cert.issuing_organization || cert.issuer || "",
      issue_date: cert.issue_date || cert.date || "",
      expiry_date: cert.expiry_date || "",
      credential_id: cert.credential_id || cert.credential_url || "",
      url: cert.url || "",
    }));

  // Format languages
  const formattedLanguages = (languages || [])
    .filter((lang) => lang && Object.keys(lang).length > 0)
    .map((lang) => ({
      language: lang.language || lang.name || "",
      proficiency: lang.proficiency || lang.level || "",
    }));

  return {
    // Personal
    full_name: (full_name || "").trim(),
    email: (email || "").trim(),
    phone: (phone || "").trim(),
    address: [address, city, state, country]
      .filter((x) => x && x.trim())
      .join(", ")||"",
    linkedin_url: (linkedin_url || "").trim(),
    github_url: (github_url || "").trim(),
    portfolio_url: (portfolio_url || "").trim(),

    // Summary
    professional_summary: (professional_summary || "").trim(),
    objective: (objective || "").trim(),

    // Sections
    work_experience: formattedWorkExp,
    education: formattedEducation,
    skills: formattedSkills,
    projects: formattedProjects,
    certifications: formattedCertifications,
    languages: formattedLanguages,
    awards: awards || [],
    publications: publications || [],
    volunteer: volunteer || [],
    references: references || [],
    hobbies: hobbies || [],
  };
}

function formatSkills(skillsObj) {
  if (!skillsObj || typeof skillsObj !== "object") return [];

  const allSkills = [];

  // Handle both array and object formats
  if (Array.isArray(skillsObj)) {
    return skillsObj.map((skill) => ({
      name: typeof skill === "string" ? skill : skill.name || "",
      category: skill.category || "other",
    }));
  }

  // If it's an object with categories
  Object.entries(skillsObj).forEach(([category, skills]) => {
    if (Array.isArray(skills)) {
      skills.forEach((skill) => {
        allSkills.push({
          name: skill,
          category: normalizeCategoryName(category),
        });
      });
    } else if (typeof skills === "string") {
      allSkills.push({
        name: skills,
        category: normalizeCategoryName(category),
      });
    }
  });

  return allSkills;
}

function normalizeCategoryName(category) {
  const mapping = {
    programming_languages: "Programming Languages",
    languages: "Programming Languages",
    frameworks_libraries: "Frameworks & Libraries",
    frameworks: "Frameworks & Libraries",
    databases: "Databases",
    cloud_platforms: "Cloud Platforms",
    cloud: "Cloud Platforms",
    tools_software: "Tools & Software",
    tools: "Tools & Software",
    operating_systems: "Operating Systems",
    os: "Operating Systems",
    methodologies: "Methodologies",
    soft_skills: "Soft Skills",
    other: "Other",
  };

  const key = category.toLowerCase().replace(/\s+/g, "_");
  return mapping[key] || category;
}
