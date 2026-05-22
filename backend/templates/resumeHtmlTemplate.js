/**
 * resumeHtmlTemplate.js
 * Generates HTML resume from extracted data
 */

import { formatResumeData } from "./resumeTemplate.js";

export function generateResumeHTML(extractedData) {
  const data = formatResumeData(extractedData);

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.full_name || "Resume"} - Resume</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
        }

        .container {
            max-width: 8.5in;
            height: auto;
            margin: 0.5in auto;
            padding: 1in;
            background: white;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }

        .header {
            text-align: center;
            margin-bottom: 0.3in;
            border-bottom: 2px solid #0066cc;
            padding-bottom: 0.2in;
        }

        .name {
            font-size: 24px;
            font-weight: bold;
            color: #1a1a1a;
            margin-bottom: 0.1in;
        }

        .contact {
            font-size: 10px;
            color: #666;
            margin-bottom: 0.1in;
        }

        .links {
            font-size: 9px;
            color: #0066cc;
        }

        .section {
            margin-bottom: 0.3in;
        }

        .section-title {
            font-size: 12px;
            font-weight: bold;
            color: #0066cc;
            border-bottom: 1px solid #0066cc;
            padding-bottom: 0.05in;
            margin-bottom: 0.15in;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .entry {
            margin-bottom: 0.15in;
        }

        .job-title {
            font-weight: bold;
            font-size: 11px;
            color: #1a1a1a;
        }

        .company {
            font-size: 10px;
            color: #666;
            font-style: italic;
        }

        .dates {
            font-size: 9px;
            color: #999;
        }

        .description {
            font-size: 10px;
            margin-top: 0.05in;
            line-height: 1.4;
        }

        .bullet {
            margin-left: 0.2in;
            font-size: 10px;
            line-height: 1.4;
        }

        .skill-category {
            margin-bottom: 0.1in;
        }

        .skill-category-title {
            font-weight: bold;
            font-size: 10px;
            display: inline-block;
            margin-right: 0.1in;
        }

        .skill-list {
            font-size: 10px;
            display: inline-block;
        }

        .degree {
            font-weight: bold;
            font-size: 11px;
        }

        .institution {
            font-size: 10px;
            color: #666;
            font-style: italic;
        }

        @media print {
            body {
                background: white;
            }
            .container {
                margin: 0;
                box-shadow: none;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="name">${escapeHtml(data.full_name)}</div>
            <div class="contact">
                ${[data.email, data.phone].filter(Boolean).map(escapeHtml).join(" | ")}
            </div>
            ${
              data.address
                ? `<div class="contact">${escapeHtml(data.address)}</div>`
                : ""
            }
            <div class="links">
                ${[
                  data.linkedin_url &&
                    `<a href="${escapeHtml(data.linkedin_url)}" style="color: #0066cc; text-decoration: none;">LinkedIn</a>`,
                  data.github_url &&
                    `<a href="${escapeHtml(data.github_url)}" style="color: #0066cc; text-decoration: none;">GitHub</a>`,
                  data.portfolio_url &&
                    `<a href="${escapeHtml(data.portfolio_url)}" style="color: #0066cc; text-decoration: none;">Portfolio</a>`,
                ]
                  .filter(Boolean)
                  .join(" | ")}
            </div>
        </div>

        <!-- Professional Summary -->
        ${
          data.professional_summary || data.objective
            ? `
        <div class="section">
            <div class="section-title">Professional Summary</div>
            <div class="description">${escapeHtml(
              data.professional_summary || data.objective
            )}</div>
        </div>
        `
            : ""
        }

        <!-- Work Experience -->
        ${
          data.work_experience && data.work_experience.length > 0
            ? `
        <div class="section">
            <div class="section-title">Work Experience</div>
            ${data.work_experience
              .map(
                (job) => `
                <div class="entry">
                    <div class="job-title">${escapeHtml(job.job_title || "")}</div>
                    <div class="company">${escapeHtml(job.company || "")}${
                  job.location ? ` | ${escapeHtml(job.location)}` : ""
                }</div>
                    ${
                      job.start_date || job.end_date
                        ? `<div class="dates">${escapeHtml(job.start_date || "")} - ${escapeHtml(
                            job.end_date || ""
                          )}</div>`
                        : ""
                    }
                    ${
                      job.responsibilities && job.responsibilities.length > 0
                        ? job.responsibilities
                            .map(
                              (r) =>
                                `<div class="bullet">• ${escapeHtml(r)}</div>`
                            )
                            .join("")
                        : ""
                    }
                </div>
            `
              )
              .join("")}
        </div>
        `
            : ""
        }

        <!-- Education -->
        ${
          data.education && data.education.length > 0
            ? `
        <div class="section">
            <div class="section-title">Education</div>
            ${data.education
              .map(
                (edu) => `
                <div class="entry">
                    <div class="degree">${escapeHtml(
                      edu.degree || ""
                    )}${
                  edu.field_of_study
                    ? ` in ${escapeHtml(edu.field_of_study)}`
                    : ""
                }</div>
                    <div class="institution">${escapeHtml(edu.institution || "")}${
                  edu.location ? `, ${escapeHtml(edu.location)}` : ""
                }</div>
                    ${
                      edu.start_date || edu.end_date
                        ? `<div class="dates">${escapeHtml(edu.start_date || "")} - ${escapeHtml(
                            edu.end_date || ""
                          )}</div>`
                        : ""
                    }
                    ${edu.gpa ? `<div class="description">GPA: ${escapeHtml(edu.gpa)}</div>` : ""}
                </div>
            `
              )
              .join("")}
        </div>
        `
            : ""
        }

        <!-- Skills -->
        ${
          data.skills && data.skills.length > 0
            ? `
        <div class="section">
            <div class="section-title">Skills</div>
            ${
              Object.entries(
                data.skills.reduce((acc, skill) => {
                  const cat = skill.category || "Other";
                  if (!acc[cat]) acc[cat] = [];
                  acc[cat].push(skill.name);
                  return acc;
                }, {})
              )
                .map(
                  ([category, skills]) => `
                <div class="skill-category">
                    <span class="skill-category-title">${escapeHtml(category)}:</span>
                    <span class="skill-list">${skills.map(escapeHtml).join(", ")}</span>
                </div>
            `
                )
                .join("")
            }
        </div>
        `
            : ""
        }

        <!-- Projects -->
        ${
          data.projects && data.projects.length > 0
            ? `
        <div class="section">
            <div class="section-title">Projects</div>
            ${data.projects
              .map(
                (proj) => `
                <div class="entry">
                    <div class="job-title">${escapeHtml(proj.name || "")}</div>
                    ${
                      proj.description
                        ? `<div class="description">${escapeHtml(proj.description)}</div>`
                        : ""
                    }
                    ${
                      proj.technologies && proj.technologies.length > 0
                        ? `<div class="description"><strong>Tech:</strong> ${proj.technologies
                            .map(escapeHtml)
                            .join(", ")}</div>`
                        : ""
                    }
                </div>
            `
              )
              .join("")}
        </div>
        `
            : ""
        }

        <!-- Certifications -->
        ${
          data.certifications && data.certifications.length > 0
            ? `
        <div class="section">
            <div class="section-title">Certifications</div>
            ${data.certifications
              .map(
                (cert) => `
                <div class="entry">
                    <div class="job-title">${escapeHtml(cert.name || "")}</div>
                    <div class="company">${escapeHtml(cert.issuer || "")}</div>
                    ${cert.issue_date ? `<div class="dates">Issued: ${escapeHtml(cert.issue_date)}</div>` : ""}
                </div>
            `
              )
              .join("")}
        </div>
        `
            : ""
        }

        <!-- Languages -->
        ${
          data.languages && data.languages.length > 0
            ? `
        <div class="section">
            <div class="section-title">Languages</div>
            ${data.languages
              .map(
                (lang) => `
                <div class="description">
                    • ${escapeHtml(lang.language)}${
                  lang.proficiency ? ` - ${escapeHtml(lang.proficiency)}` : ""
                }
                </div>
            `
              )
              .join("")}
        </div>
        `
            : ""
        }

        <!-- Volunteer Experience -->
        ${
          data.volunteer && data.volunteer.length > 0
            ? `
        <div class="section">
            <div class="section-title">Volunteer Experience</div>
            ${data.volunteer
              .map(
                (vol) => `
                <div class="entry">
                    <div class="job-title">${escapeHtml(vol.role || "")}</div>
                    <div class="company">${escapeHtml(vol.organization || "")}</div>
                    ${vol.description ? `<div class="description">${escapeHtml(vol.description)}</div>` : ""}
                </div>
            `
              )
              .join("")}
        </div>
        `
            : ""
        }
    </div>
</body>
</html>
  `;

  return htmlContent;
}

function escapeHtml(text) {
  if (!text) return "";
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return String(text).replace(/[&<>"']/g, (s) => map[s]);
}
