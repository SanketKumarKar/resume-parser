/**
 * Single file test for local parser
 * Tests extraction of a single resume file using local parser as fallback
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Tesseract from 'tesseract.js';
import { extractTextOrOcr } from '../utils/pdfTextOrOcr.js';
import { extractLocalData } from '../localParser.js';
import logger from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Test a single resume file with local parser
 * @param {string} filePath - Path to the resume file
 * @param {boolean} useOCR - Whether to use Tesseract OCR for images
 */
async function testLocalParserSingleFile(filePath, useOCR = true) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing Local Parser: ${path.basename(filePath)}`);
  console.log(`${'='.repeat(60)}\n`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    return { success: false, error: 'File not found' };
  }

  try {
    const originalname = path.basename(filePath);
    const mimetype = getMimeType(originalname);

    console.log(`📄 File: ${originalname}`);
    console.log(`📋 MIME Type: ${mimetype}`);

    // Step 1: Extract text from file
    console.log(`\n⏳ Step 1: Extracting text from file...`);
    const startExtract = Date.now();
    
    let extractedText = '';
    const isImage = /\.(jpg|jpeg|png|webp)$/i.test(originalname);
    
    if (isImage && useOCR) {
      console.log(`🖼️  Image detected - performing OCR extraction...`);
      try {
        const buffer = fs.readFileSync(filePath);
        const { data: { text } } = await Tesseract.recognize(buffer, 'eng');
        extractedText = text;
        console.log(`✅ OCR successful - extracted ${text.length} characters`);
      } catch (ocrErr) {
        console.error(`⚠️  OCR failed: ${ocrErr.message}`);
        console.log(`🔄 Trying alternative extraction method...`);
        try {
          const result = await extractTextOrOcr(filePath, mimetype, originalname);
          extractedText = result.text || '';
          if (extractedText) {
            console.log(`✅ Alternative extraction successful - ${extractedText.length} characters`);
          }
        } catch (altErr) {
          console.error(`❌ Alternative extraction failed: ${altErr.message}`);
        }
      }
    } else {
      try {
        const result = await extractTextOrOcr(filePath, mimetype, originalname);
        extractedText = result.text || '';
        console.log(`✅ Text extraction successful - ${extractedText.length} characters`);
      } catch (err) {
        console.error(`❌ Text extraction failed: ${err.message}`);
      }
    }

    const extractTime = Date.now() - startExtract;
    console.log(`⏱️  Extraction time: ${extractTime}ms\n`);

    if (!extractedText || extractedText.trim().length === 0) {
      console.error(`❌ No text could be extracted from the file`);
      return { success: false, error: 'No text extracted', filename: originalname };
    }

    // Step 2: Parse with local parser
    console.log(`📊 Step 2: Parsing with local parser...`);
    console.log(`📝 Text preview (first 300 chars):`);
    console.log(`"${extractedText.substring(0, 300).replace(/\n/g, ' ')}..."\n`);

    const startParse = Date.now();
    const resumeData = extractLocalData(extractedText);
    const parseTime = Date.now() - startParse;

    console.log(`✅ Parsing complete in ${parseTime}ms\n`);

    // Step 3: Display results
    console.log(`${'='.repeat(60)}`);
    console.log(`📋 EXTRACTION RESULTS`);
    console.log(`${'='.repeat(60)}\n`);

    if (resumeData.personal_info) {
      console.log(`👤 Personal Information:`);
      console.log(`   Name: ${resumeData.personal_info.full_name || 'N/A'}`);
      console.log(`   Email: ${resumeData.personal_info.email || 'N/A'}`);
      console.log(`   Phone: ${resumeData.personal_info.phone || 'N/A'}\n`);
    }

    if (resumeData.education && resumeData.education.length > 0) {
      console.log(`🎓 Education (${resumeData.education.length} entries):`);
      resumeData.education.forEach((edu, i) => {
        console.log(`   ${i + 1}. ${edu.degree || 'N/A'} - ${edu.institution || 'N/A'}`);
      });
      console.log();
    }

    if (resumeData.work_experience && resumeData.work_experience.length > 0) {
      console.log(`💼 Work Experience (${resumeData.work_experience.length} entries):`);
      resumeData.work_experience.forEach((exp, i) => {
        console.log(`   ${i + 1}. ${exp.job_title || 'N/A'} at ${exp.company || 'N/A'}`);
      });
      console.log();
    }

    if (resumeData.technical_skills) {
      const skillCount = Object.values(resumeData.technical_skills).reduce((acc, arr) => {
        return acc + (Array.isArray(arr) ? arr.length : 0);
      }, 0);
      if (skillCount > 0) {
        console.log(`🛠️  Technical Skills (${skillCount} total):`);
        Object.entries(resumeData.technical_skills).forEach(([category, skills]) => {
          if (Array.isArray(skills) && skills.length > 0) {
            console.log(`   ${category}: ${skills.slice(0, 3).join(', ')}${skills.length > 3 ? '...' : ''}`);
          }
        });
        console.log();
      }
    }

    console.log(`${'='.repeat(60)}`);
    console.log(`✅ TEST PASSED - Local parser worked successfully!\n`);

    return {
      success: true,
      filename: originalname,
      extractedTextLength: extractedText.length,
      extractTime,
      parseTime,
      data: resumeData,
    };
  } catch (err) {
    console.error(`\n❌ TEST FAILED - ${err.message}`);
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
Usage: node testLocalParserSingleFile.js <file-path> [--no-ocr]

Examples:
  node testLocalParserSingleFile.js test-resumes/Resume\ sample/jpg/IT1.png
  node testLocalParserSingleFile.js test-resumes/Resume\ sample/word/Sales/resume.docx
  node testLocalParserSingleFile.js /path/to/resume.pdf

Options:
  --no-ocr    Skip OCR and try direct extraction
    `);
    return;
  }

  const filePath = args[0];
  const useOCR = !args.includes('--no-ocr');

  const result = await testLocalParserSingleFile(filePath, useOCR);
  
  if (result.success) {
    console.log(`\n✅ Summary: Successfully parsed "${result.filename}"`);
    console.log(`   - Extracted: ${result.extractedTextLength} characters`);
    console.log(`   - Extraction time: ${result.extractTime}ms`);
    console.log(`   - Parse time: ${result.parseTime}ms`);
  } else {
    console.log(`\n❌ Summary: Failed to parse "${result.filename}"`);
    console.log(`   Error: ${result.error}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

export { testLocalParserSingleFile };
