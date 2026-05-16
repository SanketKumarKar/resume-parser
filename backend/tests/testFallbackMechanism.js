/**
 * Test the fallback mechanism: API fails → local parser works
 * This simulates a Gemini API failure and verifies the system falls back to local parsing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractTextOrOcr } from '../utils/pdfTextOrOcr.js';
import { extractLocalData } from '../localParser.js';
import logger from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Simulate the server's extraction flow with fallback
 */
async function testFallbackMechanism(filePath) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TESTING FALLBACK MECHANISM: API Failure → Local Parser`);
  console.log(`File: ${path.basename(filePath)}`);
  console.log(`${'='.repeat(70)}\n`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    return { success: false, error: 'File not found' };
  }

  try {
    const originalname = path.basename(filePath);
    const mimetype = getMimeType(originalname);

    // Step 1: Extract text from file (same as server.js)
    console.log(`📄 Step 1: Extract text from file`);
    console.log(`   File: ${originalname}`);
    console.log(`   MIME: ${mimetype}\n`);

    const startExtract = Date.now();
    const { text, isPdf, isImage, buffer } = await extractTextOrOcr(
      filePath,
      mimetype,
      originalname
    );
    const extractTime = Date.now() - startExtract;

    if (!text && !isPdf && !isImage) {
      console.error(`❌ Could not extract text or image from file`);
      return { success: false, error: 'Text extraction failed' };
    }

    console.log(`✅ Text extraction successful`);
    console.log(`   Duration: ${extractTime}ms`);
    console.log(`   Extracted: ${text ? text.length : 0} characters`);
    console.log(`   Is PDF: ${isPdf}, Is Image: ${isImage}\n`);

    // Step 2: Simulate Gemini API failure
    console.log(`📡 Step 2: Simulate Gemini API call (WILL FAIL)`);
    console.log(`   Attempting to call Gemini API...`);
    console.log(`   ❌ API ERROR: Connection timeout\n`);

    const apiError = new Error('Gemini API connection timeout - simulated failure');
    let resumeData;
    let usedFallback = false;

    // Step 3: Fallback to local parser (same as server.js)
    console.log(`⚠️  Step 3: API failed! Attempting fallback...`);

    try {
      // This would normally be: await extractResumeData(...)
      // But we're simulating an API error
      throw apiError;
    } catch (apiFailure) {
      console.log(`   ⚠️  Caught API error: "${apiFailure.message}"`);

      if (text) {
        console.log(`   ✅ Fallback available: text extraction successful`);
        console.log(`   🔄 Falling back to local parser...\n`);

        const startFallback = Date.now();
        resumeData = extractLocalData(text);
        const fallbackTime = Date.now() - startFallback;

        usedFallback = true;

        console.log(`✅ Fallback parsing successful!`);
        console.log(`   Duration: ${fallbackTime}ms\n`);
      } else {
        console.error(`   ❌ No fallback available: text extraction failed`);
        throw new Error(`API failed and no local text available for fallback`);
      }
    }

    // Step 4: Display results
    console.log(`${'='.repeat(70)}`);
    console.log(`📊 EXTRACTION RESULTS (Using Fallback)`);
    console.log(`${'='.repeat(70)}\n`);

    if (resumeData.personal_info) {
      console.log(`👤 Personal Information:`);
      console.log(`   Name: ${resumeData.personal_info.full_name || '(not extracted)'}`);
      console.log(`   Email: ${resumeData.personal_info.email || '(not extracted)'}`);
      console.log(`   Phone: ${resumeData.personal_info.phone || '(not extracted)'}\n`);
    }

    if (resumeData.education && resumeData.education.length > 0) {
      console.log(`🎓 Education (${resumeData.education.length} entries):`);
      resumeData.education.slice(0, 3).forEach((edu, i) => {
        console.log(`   ${i + 1}. ${edu.degree || '(degree)'} - ${edu.institution || '(institution)'}`);
      });
      if (resumeData.education.length > 3) {
        console.log(`   ... and ${resumeData.education.length - 3} more`);
      }
      console.log();
    }

    if (resumeData.work_experience && resumeData.work_experience.length > 0) {
      console.log(`💼 Work Experience (${resumeData.work_experience.length} entries):`);
      resumeData.work_experience.slice(0, 3).forEach((exp, i) => {
        console.log(`   ${i + 1}. ${exp.job_title || '(title)'} at ${exp.company || '(company)'}`);
      });
      if (resumeData.work_experience.length > 3) {
        console.log(`   ... and ${resumeData.work_experience.length - 3} more`);
      }
      console.log();
    }

    if (resumeData.projects && resumeData.projects.length > 0) {
      console.log(`📋 Projects (${resumeData.projects.length} entries):`);
      resumeData.projects.slice(0, 3).forEach((proj, i) => {
        console.log(`   ${i + 1}. ${proj.name || '(project name)'}`);
      });
      if (resumeData.projects.length > 3) {
        console.log(`   ... and ${resumeData.projects.length - 3} more`);
      }
      console.log();
    }

    const skillCount = resumeData.technical_skills ? 
      Object.values(resumeData.technical_skills).reduce((acc, arr) => {
        return acc + (Array.isArray(arr) ? arr.length : 0);
      }, 0) : 0;

    if (skillCount > 0) {
      console.log(`🛠️  Technical Skills (${skillCount} total):`);
      const categories = Object.entries(resumeData.technical_skills)
        .filter(([_, skills]) => Array.isArray(skills) && skills.length > 0)
        .slice(0, 3);
      categories.forEach(([category, skills]) => {
        console.log(`   ${category}: ${skills.slice(0, 2).join(', ')}${skills.length > 2 ? '...' : ''}`);
      });
      if (Object.entries(resumeData.technical_skills).length > 3) {
        console.log(`   ... and more categories`);
      }
      console.log();
    }

    console.log(`${'='.repeat(70)}`);
    console.log(`✅ FALLBACK TEST PASSED!\n`);
    console.log(`🎯 Summary:`);
    console.log(`   - API failed successfully (simulated)`);
    console.log(`   - Fallback mechanism triggered`);
    console.log(`   - Local parser extracted data successfully`);
    console.log(`   - System recovered gracefully\n`);

    return {
      success: true,
      filename: originalname,
      usedFallback: true,
      data: resumeData,
    };
  } catch (err) {
    console.error(`\n❌ FALLBACK TEST FAILED - ${err.message}`);
    console.error(err.stack);
    return { success: false, error: err.message, filename: path.basename(filePath) };
  }
}

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.txt': 'text/plain',
    '.html': 'text/html',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: node testFallbackMechanism.js <file-path>

This test simulates:
1. Extract text from file
2. Gemini API fails
3. System falls back to local parser
4. Local parser successfully extracts data

Examples:
  node testFallbackMechanism.js test-resumes/Resume\\ sample/word/IT/IT1.png
  node testFallbackMechanism.js test-resumes/Resume\\ sample/word/IT/IT2.png
  node testFallbackMechanism.js /path/to/resume.pdf
    `);
    return;
  }

  const filePath = args[0];
  const result = await testFallbackMechanism(filePath);

  if (!result.success) {
    console.error(`\n❌ Test failed: ${result.error}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

export { testFallbackMechanism };
