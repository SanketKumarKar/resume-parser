import { extractLocalData } from "../backend/localParser.js";

const sampleText = `
John Doe
Software Engineer
Email: john.doe@example.com
Phone: (123) 456-7890
LinkedIn: linkedin.com/in/johndoe
GitHub: github.com/johndoe

SUMMARY
Experienced software engineer with a focus on web development and cloud technologies.

SKILLS
JavaScript, Python, React, Node.js, AWS, Docker, SQL

EDUCATION
Bachelor of Science in Computer Science
University of Technology, 2018-2022
`;

const result = extractLocalData(sampleText);
console.log(JSON.stringify(result, null, 2));
