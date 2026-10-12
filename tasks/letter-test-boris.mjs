// Real test: Boris's natal chart + current transits + LIVE web_search news, Opus 4.8.
// Run: export ANTHROPIC_API_KEY=$(firebase functions:secrets:access ANTHROPIC_API_KEY --project astroweb-dev)
//      node tasks/letter-test-boris.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { computeNatalChart } = require("../functions/lib/astro/chart.js");

const MODEL = "claude-opus-4-8";
const VERSION = "2023-06-01";
const PI = 5 / 1e6, PO = 25 / 1e6;
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error("Missing ANTHROPIC_API_KEY"); process.exit(1); }

// ---- Boris (real profile) -----------------------------------------------------
const natal = computeNatalChart({
  birthDate: "1977-12-04", birthTime: "21:00", timeUnknown: false,
  lat: 47.0245117, lng: 28.8322923, timezone: "Europe/Chisinau", houseSystem: "koch",
});

// Current planetary positions (chart for "now" at the same coords)
const now = new Date();
const pad = n => String(n).padStart(2, "0");
const todayDate = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
const nowChart = computeNatalChart({
  birthDate: todayDate, birthTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  timeUnknown: false, lat: 47.0245117, lng: 28.8322923, timezone: "Europe/Chisinau", houseSystem: "koch",
});

const fmt = p => `${p.body} ${p.sign} ${Math.floor(p.degreeInSign)}°${p.house?` (дом ${p.house})`:""}`;
const natalStr = natal.points.map(fmt).join(" · ") +
  ` · Asc ${natal.houses.asc!=null?Math.floor(((natal.houses.asc%360)+360)%360):"?"}° · MC ${natal.houses.mc!=null?Math.floor(((natal.houses.mc%360)+360)%360):"?"}°`;
const transitStr = nowChart.points.map(p => `${p.body} ${p.sign} ${Math.floor(p.degreeInSign)}°`).join(" · ");

const dossier = {
  language: "ru", addressForm: "masculine",
  locationCurrent: "Кишинёв, Молдова (по месту рождения — текущий город не задан)",
  interests: ["технологии/стартапы", "бизнес", "наука и космос"],   // placeholder: реального досье ещё нет
  styleProfile: { humor: 0.4, seriousness: 0.5, formality: 0.2, warmth: 0.6, brevity: 0.6, mysticism: 0.4, emoji: 0.2 },
  note: "Первое письмо (cold start): досье ещё не наполнено, регистр нейтрально-тёплый.",
};
const cadence = "раз в 2 дня";
const astrologerName = "Вега";

console.log("NATAL:", natalStr);
console.log("\nTRANSIT (now " + todayDate + "):", transitStr, "\n");

// ---- API ----------------------------------------------------------------------
async function call(body) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": API_KEY, "anthropic-version": VERSION, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, ...body }),
  });
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(JSON.stringify(j.error || j));
  const text = (j.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
  return { text, usage: j.usage, stop: j.stop_reason };
}
const parse = s => {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  let t = (m ? m[1] : s);
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  if (i >= 0 && j > i) t = t.slice(i, j + 1);   // strip any narration around the JSON
  return JSON.parse(t.trim());
};
const cost = u => (u.input_tokens + (u.cache_read_input_tokens||0)) * PI + u.output_tokens * PO;

// ---- Pass 1: analysis WITH live web_search ------------------------------------
const analysisSystem = `Ты — аналитический движок письма «личного астролога». Сначала используй web_search,
чтобы найти 2-3 СВЕЖИЕ новости (за последние дни) по интересам человека и его региону (Молдова/мир).
Затем верни ТОЛЬКО JSON: { "themes":[1-2], "chosenTransits":[string], "newsHooks":[string],
"callbacks":[string], "effectiveRegister":{"humor":0..1,"seriousness":0..1,"warmth":0..1,"note":string},
"questions":[{"text":string,"options":[2-3],"dossierKey":string,"sensitive":bool}] }.
Транзиты: сравни текущие позиции планет с натальными и выбери 2-3 реально значимых аспекта.
Это ПЕРВОЕ письмо (досье пустое) → вопросы должны мягко знакомиться (интересы/ситуация), без сенситива в лоб.`;

const analysisUser = `ДОСЬЕ: ${JSON.stringify(dossier)}
НАТАЛ: ${natalStr}
ТЕКУЩИЕ ПОЗИЦИИ (${todayDate}): ${transitStr}
ЧАСТОТА: ${cadence}. Найди свежие новости через web_search и впиши крючки.`;

console.log("=== PASS 1: ANALYSIS + live web_search (Opus 4.8) ===");
const a = await call({
  max_tokens: 4000, system: analysisSystem,
  messages: [{ role: "user", content: analysisUser }],
  tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
});
console.log("stop:", a.stop, "| web_searches:", a.usage?.server_tool_use?.web_search_requests ?? 0);
const brief = parse(a.text);
console.log(JSON.stringify(brief, null, 2));

// ---- Pass 2: generation -------------------------------------------------------
const genSystem = `Ты — ${astrologerName}, личный астролог Бориса (одна постоянная личность, мужской род:
"ты сделал", "готов"). Это ПЕРВОЕ письмо — тепло представься в одну строку. Выдерживай effectiveRegister
из брифа. Структура по темам; вплетай транзит → смысл → действие → лёгкий крючок из свежих новостей.
Read the room. На выходе ТОЛЬКО JSON: { "teaser":string(≤180), "html":string(чистый HTML, ~250-360 слов),
"questions":[{"text":string,"options":[2-3]}] (≤3) }. Дисклеймер — одной строкой в конце.`;

console.log("\n=== PASS 2: GENERATION (Opus 4.8) ===");
const g = await call({ max_tokens: 2000, system: genSystem, messages: [{ role: "user", content: `БРИФ: ${JSON.stringify(brief)}` }] });
const letter = parse(g.text);
console.log("\n--- TEASER ---\n" + letter.teaser);
console.log("\n--- HTML LETTER ---\n" + letter.html);
console.log("\n--- QUESTIONS ---");
for (const q of letter.questions) console.log("• " + q.text + "  [" + q.options.join(" / ") + "]");

// ---- COGS ---------------------------------------------------------------------
const c1 = cost(a.usage), c2 = cost(g.usage);
const searches = a.usage?.server_tool_use?.web_search_requests ?? 0;
const searchCost = searches * 0.01;
console.log("\n=== USAGE / COGS (real, live web_search) ===");
console.log(`Pass 1 : in ${a.usage.input_tokens} out ${a.usage.output_tokens} (cache_read ${a.usage.cache_read_input_tokens||0}) = $${c1.toFixed(4)}`);
console.log(`Pass 2 : in ${g.usage.input_tokens} out ${g.usage.output_tokens} = $${c2.toFixed(4)}`);
console.log(`web_search: ${searches} × $0.01 = $${searchCost.toFixed(4)}`);
const total = c1 + c2 + searchCost;
console.log(`TOTAL COGS / letter = $${total.toFixed(4)}   → margin @ $1.50 ≈ ${(100*(1.5-total)/1.5).toFixed(0)}%`);
