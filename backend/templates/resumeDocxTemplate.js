/**
 * resumeDocxTemplate.js
 * Generates DOCX (Word) format resumes from extracted resume data
 * Uses docx library for proper DOCX file generation
 */

import { Document, Packer, Paragraph } from "docx";
import { formatResumeData } from "./resumeTemplate.js";

/**
 * Generate a DOCX resume file
 * @param {Object} extractedData - Raw extracted resume data
 * @returns {Promise<Buffer>} DOCX file as buffer
 */
export async function generateResumeDocx(extractedData) {
  const data = formatResumeData(extractedData);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margins: {
              top: 720, // 0.5 inch
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children: [
          // Header with name
          new Paragraph({
            text: data.full_name || "",
            style: "Heading1",
            alignment: "center",
            spacing: { after: 100 },
            run: {
              size: 28, // 14pt
              bold: true,
            },
          }),

          // Contact info
          new Paragraph({
            text: [
              data.email ? `Email: ${data.email}` : "",
              data.phone ? `Phone: ${data.phone}` : "",
              data.address ? `Address: ${data.address}` : "",
            ]
              .filter(Boolean)
              .join(" | "),
            alignment: "center",
            spacing: { after: 200 },
            run: {
              size: 20, // 10pt
            },
          }),

          // Professional Summary
          ...(data.professional_summary || data.objective
            ? [
                createSectionHeading("PROFESSIONAL SUMMARY"),
                new Paragraph({
                  text: data.professional_summary || data.objective || "",
                  spacing: { after: 200, line: 240 },
                  run: { size: 22 }, // 11pt
                }),
              ]
            : []),

          // Work Experience
          ...(data.work_experience && data.work_experience.length > 0
            ? [
                createSectionHeading("EXPERIENCE"),
                ...data.work_experience.flatMap((job) =>
                  getWorkExperienceParagraphs(job)
                ),
              ]
            : []),

          // Education
          ...(data.education && data.education.length > 0
            ? [
                createSectionHeading("EDUCATION"),
                ...data.education.flatMap((edu) => getEducationParagraphs(edu)),
              ]
            : []),

          // Skills
          ...(data.skills && data.skills.length > 0
            ? [
                createSectionHeading("SKILLS"),
                ...getSkillsParagraphs(data.skills),
              ]
            : []),

          // Certifications
          ...(data.certifications && data.certifications.length > 0
            ? [
                createSectionHeading("CERTIFICATIONS"),
                ...data.certifications.flatMap((cert) =>
                  getCertificationParagraphs(cert)
                ),
              ]
            : []),

          // Projects
          ...(data.projects && data.projects.length > 0
            ? [
                createSectionHeading("PROJECTS"),
                ...data.projects.flatMap((proj) => getProjectParagraphs(proj)),
              ]
            : []),

          // Languages
          ...(data.languages && data.languages.length > 0
            ? [
                createSectionHeading("LANGUAGES"),
                ...data.languages.map(
                  (lang) =>
                    new Paragraph({
                      text: `${lang.language}${lang.proficiency ? ` - ${lang.proficiency}` : ""}`,
                      spacing: { after: 100, line: 240 },
                      run: { size: 22 }, // 11pt
                    })
                ),
              ]
            : []),

          // Volunteer Experience
          ...(data.volunteer && data.volunteer.length > 0
            ? [
                createSectionHeading("VOLUNTEER EXPERIENCE"),
                ...data.volunteer.flatMap((vol) =>
                  getVolunteerParagraphs(vol)
                ),
              ]
            : []),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

function createSectionHeading(text) {
  return new Paragraph({
    text: text,
    spacing: { before: 100, after: 100, line: 240 },
    border: {
      bottom: {
        color: "000000",
        space: 1,
        style: "single",
        size: 6,
      },
    },
    run: {
      bold: true,
      size: 24, // 12pt
    },
  });
}

function getWorkExperienceParagraphs(job) {
  const paragraphs = [];

  // Job Title - bold
  if (job.job_title) {
    paragraphs.push(
      new Paragraph({
        text: job.job_title,
        spacing: { after: 50, line: 240 },
        run: { bold: true, size: 22 }, // 11pt
      })
    );
  }

  // Company, Location, Dates
  const meta = [job.company, job.location].filter(Boolean).join(" | ");
  if (meta) {
    paragraphs.push(
      new Paragraph({
        text: meta,
        spacing: { after: 50, line: 240 },
        run: { size: 22 }, // 11pt
      })
    );
  }

  if (job.start_date || job.end_date) {
    paragraphs.push(
      new Paragraph({
        text: `${job.start_date || ""} - ${job.end_date || ""}`,
        spacing: { after: 50, line: 240 },
        run: { size: 20 }, // 10pt
      })
    );
  }

  // Responsibilities as bullets
  if (job.responsibilities && job.responsibilities.length > 0) {
    job.responsibilities.slice(0, 6).forEach((resp) => {
      paragraphs.push(
        new Paragraph({
          text: resp,
          spacing: { after: 50, line: 240 },
          bullet: { level: 0 },
          run: { size: 22 }, // 11pt
        })
      );
    });
  }

  paragraphs.push(
    new Paragraph({
      text: "",
      spacing: { after: 100 },
    })
  );

  return paragraphs;
}

function getEducationParagraphs(edu) {
  const paragraphs = [];

  // Degree
  if (edu.degree) {
    const degreeText =
      edu.field_of_study && edu.field_of_study.trim()
        ? `${edu.degree} in ${edu.field_of_study}`
        : edu.degree;

    paragraphs.push(
      new Paragraph({
        text: degreeText,
        spacing: { after: 50, line: 240 },
        run: { bold: true, size: 22 }, // 11pt
      })
    );
  }

  // Institution
  const meta = [edu.institution, edu.location].filter(Boolean).join(" | ");
  if (meta) {
    paragraphs.push(
      new Paragraph({
        text: meta,
        spacing: { after: 50, line: 240 },
        run: { size: 22 }, // 11pt
      })
    );
  }

  // Dates
  if (edu.start_date || edu.end_date) {
    paragraphs.push(
      new Paragraph({
        text: `${edu.start_date || ""} - ${edu.end_date || ""}`,
        spacing: { after: 50, line: 240 },
        run: { size: 20 }, // 10pt
      })
    );
  }

  // GPA
  if (edu.gpa) {
    paragraphs.push(
      new Paragraph({
        text: `GPA: ${edu.gpa}`,
        spacing: { after: 50, line: 240 },
        run: { size: 22 }, // 11pt
      })
    );
  }

  paragraphs.push(
    new Paragraph({
      text: "",
      spacing: { after: 100 },
    })
  );

  return paragraphs;
}

function getSkillsParagraphs(skills) {
  const paragraphs = [];

  // Group skills by category
  const grouped = {};
  skills.forEach((skill) => {
    const category = skill.category || "Other";
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(skill.name);
  });

  Object.entries(grouped).forEach(([category, skillList]) => {
    if (skillList.length > 0) {
      paragraphs.push(
        new Paragraph({
          text: `${category}: ${skillList.join(", ")}`,
          spacing: { after: 100, line: 240 },
          run: { size: 22 }, // 11pt
        })
      );
    }
  });

  paragraphs.push(
    new Paragraph({
      text: "",
      spacing: { after: 100 },
    })
  );

  return paragraphs;
}

function getCertificationParagraphs(cert) {
  const paragraphs = [];

  const certText = cert.issuer ? `${cert.name} - ${cert.issuer}` : cert.name;

  paragraphs.push(
    new Paragraph({
      text: certText,
      spacing: { after: 50, line: 240 },
      run: { bold: true, size: 22 }, // 11pt
    })
  );

  if (cert.issue_date) {
    paragraphs.push(
      new Paragraph({
        text: `Issued: ${cert.issue_date}`,
        spacing: { after: 50, line: 240 },
        run: { size: 20 }, // 10pt
      })
    );
  }

  paragraphs.push(
    new Paragraph({
      text: "",
      spacing: { after: 100 },
    })
  );

  return paragraphs;
}

function getProjectParagraphs(proj) {
  const paragraphs = [];

  if (proj.name) {
    paragraphs.push(
      new Paragraph({
        text: proj.name,
        spacing: { after: 50, line: 240 },
        run: { bold: true, size: 22 }, // 11pt
      })
    );
  }

  if (proj.description) {
    paragraphs.push(
      new Paragraph({
        text: proj.description,
        spacing: { after: 50, line: 240 },
        run: { size: 22 }, // 11pt
      })
    );
  }

  if (proj.technologies && proj.technologies.length > 0) {
    paragraphs.push(
      new Paragraph({
        text: `Technologies: ${proj.technologies.join(", ")}`,
        spacing: { after: 50, line: 240 },
        run: { size: 20 }, // 10pt
      })
    );
  }

  paragraphs.push(
    new Paragraph({
      text: "",
      spacing: { after: 100 },
    })
  );

  return paragraphs;
}

function getVolunteerParagraphs(vol) {
  const paragraphs = [];

  if (vol.role) {
    paragraphs.push(
      new Paragraph({
        text: vol.role,
        spacing: { after: 50, line: 240 },
        run: { bold: true, size: 22 }, // 11pt
      })
    );
  }

  if (vol.organization) {
    paragraphs.push(
      new Paragraph({
        text: vol.organization,
        spacing: { after: 50, line: 240 },
        run: { size: 22 }, // 11pt
      })
    );
  }

  if (vol.description) {
    paragraphs.push(
      new Paragraph({
        text: vol.description,
        spacing: { after: 50, line: 240 },
        run: { size: 22 }, // 11pt
      })
    );
  }

  paragraphs.push(
    new Paragraph({
      text: "",
      spacing: { after: 100 },
    })
  );

  return paragraphs;
}
