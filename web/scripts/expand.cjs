const fs = require("fs");
const path = require("path");

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const API_URL = "https://api.anthropic.com/v1/messages";

async function expandCategory(categoryName, originalJson, language) {
  console.log(`Expanding ${categoryName} in ${language}...`);
  const prompt = `
You are an expert astrologer. I will give you a JSON object containing astrological interpretations for ${categoryName}.
Currently, the "text" field for each item is very short (1-2 sentences).
Your task: Expand the "text" field for EVERY item to be a deeply detailed, professional, and insightful reading of approximately 100-150 words.
Keep the exact same JSON structure, keys, and formatting. Do not add markdown blocks outside the JSON. Return ONLY valid JSON.
Language: ${language === "ru" ? "Russian" : "English"}.

Original JSON:
${JSON.stringify(originalJson, null, 2)}
  `;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      temperature: 0.7,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error: ${err}`);
  }

  const data = await response.json();
  const text = data.content
    ?.filter((block) => block.type === "text" || block.text)
    .map((block) => block.text || "")
    .join("") || "";
  
  // Clean markdown JSON fences
  const cleaned = text.replace(/^```json\s*/m, "").replace(/```$/m, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error(`Failed to parse JSON for ${categoryName}. Raw text:`, cleaned);
    throw e;
  }
}

async function processFile(filePath, language) {
  console.log(`Processing ${filePath}...`);
  const content = fs.readFileSync(filePath, "utf-8");
  const json = JSON.parse(content);

  const categories = ["sun", "moon", "ascendant", "midheaven", "aspects"];
  
  for (const cat of categories) {
    if (json.interpretation && json.interpretation[cat]) {
      try {
        const expanded = await expandCategory(cat, json.interpretation[cat], language);
        json.interpretation[cat] = expanded;
        // Save incrementally
        fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
      } catch (e) {
        console.error(`Failed expanding ${cat} in ${language}:`, e);
      }
    }
  }
  
  console.log(`Finished ${filePath}`);
}

async function main() {
  if (!API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }

  const ruPath = path.join(__dirname, "..", "public", "locales", "ru", "translation.json");
  const enPath = path.join(__dirname, "..", "public", "locales", "en", "translation.json");

  await processFile(ruPath, "ru");
  await processFile(enPath, "en");
}

main().catch(console.error);
