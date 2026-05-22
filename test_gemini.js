require('dotenv').config({path: './functions/.env'});
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function run() {
  try {
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = ai.getGenerativeModel({ model: 'gemini-3.1-flash' });
    const res = await model.generateContent("Hello");
    console.log("Success:", res.response.text());
  } catch (err) {
    console.error("Error with gemini-3.1-flash:", err.message);
  }
}
run();
