-- ============================================================================
-- Resume Extractor - PostgreSQL Schema
-- Strategy: Hybrid Relational + JSONB
--   • Relational tables for core, searchable data
--   • JSONB columns on every table for overflow/extra fields
--   • A generic `resume_sections` table for truly unknown sections
--   • Full raw JSON stored for audit/replay
-- ============================================================================

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- for gen_random_uuid()

-- ============================================================================
-- 1. RESUMES — Master table (one row per uploaded resume)
-- ============================================================================
CREATE TABLE resumes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Upload metadata
    filename        TEXT NOT NULL,                -- server-side temp name
    original_name   TEXT NOT NULL,                -- user's original filename
    mime_type       TEXT,                         -- e.g. application/pdf
    file_size_bytes INTEGER,

    -- Processing metadata
    is_fallback     BOOLEAN NOT NULL DEFAULT false,  -- true = local parser was used
    parse_source    TEXT NOT NULL DEFAULT 'gemini',  -- 'gemini' | 'local'

    -- ── Core searchable fields (promoted from JSON) ──
    full_name       TEXT,
    email           TEXT,
    phone           TEXT,
    address         TEXT,
    city            TEXT,
    state           TEXT,
    country         TEXT,
    zip_code        TEXT,
    linkedin        TEXT,
    github          TEXT,
    portfolio       TEXT,
    website         TEXT,

    objective       TEXT,
    summary         TEXT,

    -- ── FLEXIBILITY: The entire raw JSON blob ──
    -- This is the single source of truth. Even if we forget to map a field
    -- into a relational column, it lives here and is queryable via JSONB ops.
    raw_extracted_data  JSONB NOT NULL,

    -- ── Catch-all for custom / unknown sections ──
    additional_data     JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 2. EDUCATION
-- ============================================================================
CREATE TABLE education (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id       UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    sort_order      SMALLINT DEFAULT 0,           -- preserve resume ordering

    institution     TEXT,
    degree          TEXT,
    field_of_study  TEXT,
    location        TEXT,
    start_date      TEXT,
    end_date        TEXT,
    gpa             TEXT,
    honors          TEXT,
    relevant_coursework TEXT[],                    -- array of course names

    -- Overflow: any extra education-specific fields
    extra           JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 3. WORK EXPERIENCE
-- ============================================================================
CREATE TABLE work_experience (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id       UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    sort_order      SMALLINT DEFAULT 0,

    company         TEXT,
    job_title       TEXT,
    location        TEXT,
    start_date      TEXT,
    end_date        TEXT,
    is_current      BOOLEAN DEFAULT false,
    responsibilities TEXT[],
    achievements    TEXT[],

    extra           JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 4. SKILLS  (flat table — one row per skill for easy filtering)
-- ============================================================================
CREATE TABLE skills (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id       UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,

    skill_name      TEXT NOT NULL,
    -- Category matches the JSON keys:
    -- programming_languages, frameworks_libraries, databases,
    -- cloud_platforms, tools_software, operating_systems,
    -- methodologies, soft_skills, other
    category        TEXT NOT NULL DEFAULT 'other',

    extra           JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 5. PROJECTS
-- ============================================================================
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id       UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    sort_order      SMALLINT DEFAULT 0,

    name            TEXT,
    description     TEXT,
    technologies_used TEXT[],
    start_date      TEXT,
    end_date        TEXT,
    url             TEXT,
    github_link     TEXT,

    extra           JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 6. CERTIFICATIONS
-- ============================================================================
CREATE TABLE certifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id           UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    sort_order          SMALLINT DEFAULT 0,

    name                TEXT,
    issuing_organization TEXT,
    issue_date          TEXT,
    expiry_date         TEXT,
    credential_id       TEXT,
    url                 TEXT,

    extra               JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 7. AWARDS & HONORS
-- ============================================================================
CREATE TABLE awards_honors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id       UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    sort_order      SMALLINT DEFAULT 0,

    title           TEXT,
    issuer          TEXT,
    date            TEXT,
    description     TEXT,

    extra           JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 8. PUBLICATIONS
-- ============================================================================
CREATE TABLE publications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id       UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    sort_order      SMALLINT DEFAULT 0,

    title           TEXT,
    publisher       TEXT,
    date            TEXT,
    url             TEXT,
    description     TEXT,

    extra           JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 9. LANGUAGES (spoken/written, not programming)
-- ============================================================================
CREATE TABLE languages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id       UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,

    language        TEXT NOT NULL,
    proficiency     TEXT,           -- e.g. Native, Fluent, Intermediate

    extra           JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 10. VOLUNTEER EXPERIENCE
-- ============================================================================
CREATE TABLE volunteer_experience (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id       UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    sort_order      SMALLINT DEFAULT 0,

    role            TEXT,
    organization    TEXT,
    start_date      TEXT,
    end_date        TEXT,
    description     TEXT,

    extra           JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 11. REFERENCES
-- ============================================================================
CREATE TABLE resume_references (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id       UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,

    name            TEXT,
    title           TEXT,
    company         TEXT,
    email           TEXT,
    phone           TEXT,
    relationship    TEXT,

    extra           JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 12. GENERIC SECTIONS  — The "handle ANY situation" table
--     If Gemini extracts a section we never planned for (e.g. "Military Service",
--     "Patents", "Speaking Engagements"), it gets stored here as a JSONB blob
--     keyed by section name. No schema migration needed.
-- ============================================================================
CREATE TABLE resume_sections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id       UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,

    section_key     TEXT NOT NULL,       -- e.g. 'military_service', 'patents'
    section_label   TEXT,                -- human-readable: 'Military Service'
    section_data    JSONB NOT NULL,      -- the actual content (array or object)

    UNIQUE (resume_id, section_key)
);

-- ============================================================================
-- 13. INDEXES — Performance tuning
-- ============================================================================

-- Fast lookups by candidate identity
CREATE INDEX idx_resumes_email       ON resumes (email);
CREATE INDEX idx_resumes_full_name   ON resumes (full_name);
CREATE INDEX idx_resumes_created     ON resumes (created_at DESC);

-- Full-text search inside JSONB (find candidates by any keyword in their data)
CREATE INDEX idx_resumes_raw_gin     ON resumes USING gin (raw_extracted_data);

-- Skills search  (e.g. "find all candidates who know React")
CREATE INDEX idx_skills_name         ON skills (skill_name);
CREATE INDEX idx_skills_category     ON skills (category);
CREATE INDEX idx_skills_resume       ON skills (resume_id);

-- Generic sections lookup
CREATE INDEX idx_sections_key        ON resume_sections (section_key);
CREATE INDEX idx_sections_resume     ON resume_sections (resume_id);

-- Foreign key indexes for fast JOINs
CREATE INDEX idx_education_resume    ON education (resume_id);
CREATE INDEX idx_experience_resume   ON work_experience (resume_id);
CREATE INDEX idx_projects_resume     ON projects (resume_id);
CREATE INDEX idx_certs_resume        ON certifications (resume_id);

-- ============================================================================
-- 14. HELPER: Auto-update `updated_at` on resumes table
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_resumes_updated_at
    BEFORE UPDATE ON resumes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
