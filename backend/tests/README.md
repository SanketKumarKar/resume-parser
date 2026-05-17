# Resume Extractor — Test Scripts Guide

This document explains the test scripts in this folder, their purpose, and how to use them to validate and benchmark the resume extraction pipeline.

---

## 1. `validateExtraction.js`
**Purpose:**
- Automated QA for the extraction API across many resumes.
- Checks schema completeness, field recall, and extraction quality.

**Usage:**
```bash
node validateExtraction.js --dir <resumeFolder> [options]
```
**Options:**
- `--dir, -d`      Path to folder containing resume files (**required**)
- `--url, -u`      API base URL (default: http://localhost:5000)
- `--concurrency,-c`  Max parallel requests (default: 2)
- `--batch, -b`    Batch size for progress logging (default: 100)
- `--out, -o`      Output report path (default: ./extraction_report.json)
- `--timeout, -t`  Per-request timeout in ms (default: 60000)
- `--resume-from`  Skip first N files (for resuming interrupted runs)
- `--sample`       Only test a random sample of N files
- `--quiet, -q`    Suppress per-file logs, only show summary

**Example:**
```bash
node validateExtraction.js -d ../../test-resumes -c 10 -o report.json
```

---

## 2. `accuracyTest.js`
**Purpose:**
- Checks the consistency (determinism) of the extraction pipeline.
- Runs extraction twice for each resume and compares the outputs.
- Reports per-file and overall accuracy, highlighting unstable fields.

### Diff Test (Run On `test-resumes/`)
This is the "diff test": it extracts every resume twice (Run 1 + Run 2) and reports what changed between the two JSON outputs.

**Prerequisites**
- Install backend deps: run from `backend/` once: `npm install`
- Ensure your local extraction backend dependencies are available:
  - `accuracyTest.js` runs the extraction pipeline directly (it does not call the HTTP server).
  - It uses the local Ollama endpoint configured in `backend/.env`:
    - `OLLAMA_URL` (default in code: `http://localhost:11434/api/generate`)
    - `OLLAMA_MODEL` (default in code: `gemma4`)
  - Make sure Ollama is running and the model is available locally.

**Run Against The Repo Test Set**
From `backend/`:
```bash
npm run test:accuracy -- -d ../test-resumes -o tests/accuracy_report.json
```
Optional flags:
```bash
npm run test:accuracy -- -d ../test-resumes --timeout 180000 --quiet
```

**What To Look At In The Report**
- `summary.overallAccuracy`: average stability across all resumes (higher is more deterministic).
- `summary.topUnstableFields`: fields that change most often between runs (best place to debug).
- `perFileResults[].diffs`: sample diffs per resume (capped), including:
  - `type: "structural"`: key missing in one run (shape instability)
  - `type: "value_change"`: value changed between runs (content instability)

**Usage:**
```bash
node accuracyTest.js [options]
```
**Options:**
- `--dir, -d`      Resume folder (default: ../../test-resumes)
- `--out, -o`      Output report path (default: ./accuracy_report.json)
- `--timeout`      Per-extraction timeout ms (default: 120000)
- `--quiet, -q`    Suppress per-file logs

**Example:**
```bash
node accuracyTest.js -d ../../test-resumes
```

---

## 3. Other Test Scripts
- `testFallbackMechanism.js`: Tests the fallback parser logic when the AI extraction fails.
- `testLocalParserSingleFile.js`: Runs the local parser on a single file for debugging.
- `analyzeReport.js`: Analyzes and summarizes extraction/accuracy reports.

---

## Notes
- All scripts require Node.js and dependencies installed (see project root for setup).
- For API-based tests, ensure the backend server is running and accessible at the specified URL.
- Output reports are saved as JSON for further analysis.

For more details, see the comments at the top of each script or the main [EXTRACTION_PIPELINE.md](../docs/EXTRACTION_PIPELINE.md).
