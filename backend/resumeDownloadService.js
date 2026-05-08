/**
 * resumeDownloadService.js
 * Generates ATS-friendly PDF resumes from extracted resume data
 * Uses pdfkit for PDF generation with ATS compliance
 */

import PDFDocument from "pdfkit";
import { formatResumeData } from "./resumeTemplate.js";

// ATS-FRIENDLY STYLING (No fancy colors, simple fonts)
const ATS_COLORS = {
  black: "#000000",
  darkgray: "#333333",
};

const ATS_FONTS = {
  heading: "Helvetica-Bold",
  normal: "Helvetica",
  italic: "Helvetica-Oblique",
};

/**
 * Generate an ATS-friendly PDF resume
 * @param {Object} extractedData - Raw extracted resume data
 * @returns {Stream} PDF stream
 */
export function generateResumePDF(extractedData) {
  const doc = new PDFDocument({
    size: "Letter",
    margin: 0.5 * 72, // 0.5 inch margins (standard for ATS)
    bufferPages: true,
  });

  const resumeData = formatResumeData(extractedData);

  // Set default font for ATS compliance
  doc.font(ATS_FONTS.normal).fontSize(11);

  // Render sections
  renderATSHeader(doc, resumeData);
  renderATSContactInfo(doc, resumeData);
  renderATSSummary(doc, resumeData);
  renderATSWorkExperience(doc, resumeData);
  renderATSEducation(doc, resumeData);
  renderATSSkills(doc, resumeData);
  renderATSCertifications(doc, resumeData);
  renderATSProjects(doc, resumeData);
  renderATSLanguages(doc, resumeData);
  renderATSVolunteer(doc, resumeData);

  doc.end();
  return doc;
}

function renderATSHeader(doc, data) {
  const { full_name } = data;

  if (!full_name) return;

  // Name - centered, bold, slightly larger
  doc
    .font(ATS_FONTS.heading)
    .fontSize(14)
    .text(full_name, { align: "center" })
    .moveDown(0.2);

  doc.fontSize(11).font(ATS_FONTS.normal);
}

function renderATSContactInfo(doc, data) {
  const { email, phone, address, linkedin_url, github_url } = data;

  const contactInfo = [];
  if (email) contactInfo.push(email);
  if (phone) contactInfo.push(phone);
  if (address) contactInfo.push(address);
  if (linkedin_url) contactInfo.push(linkedin_url);
  if (github_url) contactInfo.push(github_url);

  if (contactInfo.length > 0) {
    doc
      .font(ATS_FONTS.normal)
      .fontSize(10)
      .text(contactInfo.filter(Boolean).join(" | "), { align: "center" })
      .moveDown(0.4);
  }
}

function renderATSSummary(doc, data) {
  const { professional_summary, objective } = data;
  const summary = (professional_summary || objective || "").trim();

  if (!summary) return;

  renderATSSectionTitle(doc, "PROFESSIONAL SUMMARY");
  doc
    .font(ATS_FONTS.normal)
    .fontSize(11)
    .text(summary, { align: "left" })
    .moveDown(0.4);
}

function renderATSWorkExperience(doc, data) {
  const { work_experience } = data;

  if (!work_experience || work_experience.length === 0) return;

  renderATSSectionTitle(doc, "EXPERIENCE");

  work_experience.forEach((job, idx) => {
    const { company, job_title, location, start_date, end_date, responsibilities } = job;

    if (!company && !job_title) return;

    // Job Title - bold
    if (job_title) {
      doc
        .font(ATS_FONTS.heading)
        .fontSize(11)
        .text(job_title);
    }

    // Company, Location, Dates - single line for ATS scanning
    const meta = [company, location].filter(Boolean).join(" | ");
    if (meta) {
      doc.font(ATS_FONTS.normal).fontSize(11).text(meta);
    }

    // Dates on separate line
    if (start_date || end_date) {
      const dateStr = `${start_date || ""} - ${end_date || ""}`.trim();
      doc.fontSize(10).text(dateStr);
    }

    // Responsibilities as plain bullet points
    if (responsibilities && responsibilities.length > 0) {
      doc.moveDown(0.15);
      responsibilities.slice(0, 6).forEach((resp) => {
        // Limit to 6 bullets per job for readability
        doc
          .font(ATS_FONTS.normal)
          .fontSize(11)
          .text(`• ${resp}`, { indent: 20 });
      });
    }

    doc.moveDown(0.3);
  });

  doc.moveDown(0.2);
}

function renderATSEducation(doc, data) {
  const { education } = data;

  if (!education || education.length === 0) return;

  renderATSSectionTitle(doc, "EDUCATION");

  education.forEach((edu) => {
    const { degree, field_of_study, institution, location, start_date, end_date, gpa } = edu;

    if (!institution && !degree) return;

    // Degree and Field
    if (degree) {
      doc.font(ATS_FONTS.heading).fontSize(11);
      const degreeText =
        field_of_study && field_of_study.trim() ? `${degree} in ${field_of_study}` : degree;
      doc.text(degreeText);
    }

    // Institution and location
    const meta = [institution, location].filter(Boolean).join(" | ");
    if (meta) {
      doc.font(ATS_FONTS.normal).fontSize(11).text(meta);
    }

    // Dates
    if (start_date || end_date) {
      const dateStr = `${start_date || ""} - ${end_date || ""}`.trim();
      doc.fontSize(10).text(dateStr);
    }

    // GPA (if present)
    if (gpa) {
      doc.fontSize(10).text(`GPA: ${gpa}`);
    }

    doc.moveDown(0.3);
  });

  doc.moveDown(0.2);
}

function renderATSSkills(doc, data) {
  const { skills } = data;

  if (!skills || skills.length === 0) return;

  renderATSSectionTitle(doc, "SKILLS");

  // Group skills by category
  const grouped = {};
  skills.forEach((skill) => {
    const category = skill.category || "Other";
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(skill.name);
  });

  // Render skills in a simple, ATS-friendly format
  Object.entries(grouped).forEach(([category, skillList]) => {
    if (skillList.length === 0) return;

    const skillText = skillList.join(", ");
    doc
      .font(ATS_FONTS.heading)
      .fontSize(11)
      .text(`${category}:`, { continued: true })
      .font(ATS_FONTS.normal)
      .text(` ${skillText}`);

    doc.moveDown(0.15);
  });

  doc.moveDown(0.2);
}

function renderATSCertifications(doc, data) {
  const { certifications } = data;

  if (!certifications || certifications.length === 0) return;

  renderATSSectionTitle(doc, "CERTIFICATIONS");

  certifications.forEach((cert) => {
    const { name, issuer, issue_date } = cert;

    if (!name) return;

    const certText = issuer ? `${name} - ${issuer}` : name;
    doc.font(ATS_FONTS.heading).fontSize(11).text(certText);

    if (issue_date) {
      doc.font(ATS_FONTS.normal).fontSize(10).text(`Issued: ${issue_date}`);
    }

    doc.moveDown(0.2);
  });

  doc.moveDown(0.2);
}

function renderATSProjects(doc, data) {
  const { projects } = data;

  if (!projects || projects.length === 0) return;

  renderATSSectionTitle(doc, "PROJECTS");

  projects.forEach((proj) => {
    const { name, description, technologies } = proj;

    if (!name) return;

    doc.font(ATS_FONTS.heading).fontSize(11).text(name);

    if (description) {
      doc.font(ATS_FONTS.normal).fontSize(11).text(description);
    }

    if (technologies && technologies.length > 0) {
      doc.fontSize(10).text(`Technologies: ${technologies.join(", ")}`);
    }

    doc.moveDown(0.2);
  });

  doc.moveDown(0.2);
}

function renderATSLanguages(doc, data) {
  const { languages } = data;

  if (!languages || languages.length === 0) return;

  renderATSSectionTitle(doc, "LANGUAGES");

  languages.forEach((lang) => {
    const { language, proficiency } = lang;

    if (!language) return;

    const profText = proficiency ? ` - ${proficiency}` : "";
    doc.font(ATS_FONTS.normal).fontSize(11).text(`${language}${profText}`);
  });

  doc.moveDown(0.2);
}

function renderATSVolunteer(doc, data) {
  const { volunteer } = data;

  if (!volunteer || volunteer.length === 0) return;

  renderATSSectionTitle(doc, "VOLUNTEER EXPERIENCE");

  volunteer.forEach((vol) => {
    const { role, organization, description } = vol;

    if (!role && !organization) return;

    if (role) {
      doc.font(ATS_FONTS.heading).fontSize(11).text(role);
    }

    if (organization) {
      doc.font(ATS_FONTS.normal).fontSize(11).text(organization);
    }

    if (description) {
      doc.fontSize(10).text(description);
    }

    doc.moveDown(0.2);
  });

  doc.moveDown(0.2);
}

function renderATSSectionTitle(doc, title) {
  doc
    .font(ATS_FONTS.heading)
    .fontSize(12)
    .text(title, { underline: true })
    .moveDown(0.2);
}
