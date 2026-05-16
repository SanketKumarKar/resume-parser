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
