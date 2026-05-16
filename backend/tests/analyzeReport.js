import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const r = JSON.parse(fs.readFileSync(path.join(__dirname, "accuracy_report.json"), "utf8"));

console.log("=== SUMMARY ===");
console.log(JSON.stringify(r.summary, null, 2));

console.log("\n=== PER-FILE ACCURACY (sorted worst→best) ===");
const sorted = [...r.perFileResults]
  .filter(f => f.accuracy !== null)
  .sort((a, b) => a.accuracy - b.accuracy);

sorted.forEach(f => {
  const acc = f.accuracy.toFixed(1).padStart(6) + "%";
  const diffs = (f.diffCount || 0).toString().padStart(3);
  const ext = path.extname(f.file).toLowerCase();
  console.log("  " + acc + " | diffs: " + diffs + " | " + ext.padEnd(6) + " | " + f.file);
});

console.log("\n=== ACCURACY BY FILE TYPE ===");
const byExt = {};
r.perFileResults.filter(f => f.accuracy !== null).forEach(f => {
  const ext = path.extname(f.file).toLowerCase();
  if (!byExt[ext]) byExt[ext] = { count: 0, totalAcc: 0, perfect: 0 };
  byExt[ext].count++;
  byExt[ext].totalAcc += f.accuracy;
  if (f.accuracy >= 99.9) byExt[ext].perfect++;
});
Object.entries(byExt).sort((a, b) => (a[1].totalAcc / a[1].count) - (b[1].totalAcc / b[1].count)).forEach(([ext, s]) => {
  const avg = (s.totalAcc / s.count).toFixed(1);
  console.log("  " + ext.padEnd(8) + " avg: " + avg + "% | count: " + s.count + " | perfect: " + s.perfect);
});

console.log("\n=== DIFF TYPE BREAKDOWN ===");
const diffTypes = {};
const fieldDiffs = {};
const sampleDiffs = {}; // field → [sample run1/run2 pairs]
let totalDiffs = 0;

r.perFileResults.filter(f => f.diffs).forEach(f => {
  f.diffs.forEach(d => {
    totalDiffs++;
    diffTypes[d.type] = (diffTypes[d.type] || 0) + 1;
    const field = d.key.replace(/\[\d+\]/g, "[]");
    fieldDiffs[field] = (fieldDiffs[field] || 0) + 1;
    if (!sampleDiffs[field]) sampleDiffs[field] = [];
    if (sampleDiffs[field].length < 3) {
      sampleDiffs[field].push({ run1: d.run1, run2: d.run2, file: f.file });
    }
  });
});
console.log("  value_change: " + (diffTypes.value_change || 0));
console.log("  structural:   " + (diffTypes.structural || 0));
console.log("  total diffs:  " + totalDiffs);

console.log("\n=== TOP 30 MOST INCONSISTENT FIELDS ===");
Object.entries(fieldDiffs)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30)
  .forEach(([k, v]) => {
    console.log("  " + v.toString().padStart(4) + "x  " + k);
    // Show a sample diff for context
    const sample = sampleDiffs[k]?.[0];
    if (sample) {
      const r1 = sample.run1 === null ? "(null)" : (typeof sample.run1 === "string" ? sample.run1.slice(0, 80) : String(sample.run1));
      const r2 = sample.run2 === null ? "(null)" : (typeof sample.run2 === "string" ? sample.run2.slice(0, 80) : String(sample.run2));
      console.log("        Run1: " + r1);
      console.log("        Run2: " + r2);
      console.log("        File: " + sample.file);
    }
  });

// Categorize diff patterns
console.log("\n=== DIFF PATTERN CATEGORIES ===");
let nullVsValue = 0;  // null ↔ some value
let rephrasing = 0;   // different wording, same meaning
let ordering = 0;     // array items reordered
let bulletFormat = 0;  // bullet point formatting
let partialExtract = 0; // partial vs full extraction

r.perFileResults.filter(f => f.diffs).forEach(f => {
  f.diffs.forEach(d => {
    const r1 = d.run1;
    const r2 = d.run2;
    
    if ((r1 === null && r2 !== null && r2 !== "(missing)") || (r2 === null && r1 !== null && r1 !== "(missing)")) {
      nullVsValue++;
    }
    if (typeof r1 === "string" && typeof r2 === "string") {
      if (r1.startsWith("•") || r2.startsWith("•") || r1.startsWith("-") || r2.startsWith("-")) {
        bulletFormat++;
      }
    }
    if (d.type === "structural") {
      partialExtract++;
    }
  });
});

console.log("  null ↔ value:       " + nullVsValue + " (" + ((nullVsValue/totalDiffs)*100).toFixed(1) + "%)");
console.log("  bullet formatting:  " + bulletFormat + " (" + ((bulletFormat/totalDiffs)*100).toFixed(1) + "%)");
console.log("  structural/missing: " + partialExtract + " (" + ((partialExtract/totalDiffs)*100).toFixed(1) + "%)");
