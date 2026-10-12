// Variant: news digest on Sonnet 4.6 (+web_search), then Opus 4.8 for analysis + generation.
// Goal: cut the ~$0.24 web-search cost by keeping the 40k retrieved tokens on the cheaper model.
// Run: export ANTHROPIC_API_KEY=$(firebase functions:secrets:access ANTHROPIC_API_KEY --project astroweb-dev)
//      node tasks/letter-test-boris-cheapnews.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { computeNatalChart } = require("../functions/lib/astro/chart.js");

const OPUS = "claude-opus-4-8";        // $5 / $25
const SONNET = "claude-sonnet-4-6";    // $3 / $15
const VERSION = "2023-06-01";
const RATE = { [OPUS]: [5e-6, 25e-6], [SONNET]: [3e-6, 15e-6] };
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error("Missing ANTHROPIC_API_KEY"); process.exit(1); }

const natal = computeNatalChart({ birthDate:"1977-12-04", birthTime:"21:00", timeUnknown:false,
  lat:47.0245117, lng:28.8322923, timezone:"Europe/Chisinau", houseSystem:"koch" });
const now = new Date(); const pad = n => String(n).padStart(2,"0");
const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
const nowChart = computeNatalChart({ birthDate:today, birthTime:`${pad(now.getHours())}:${pad(now.getMinutes())}`,
  timeUnknown:false, lat:47.0245117, lng:28.8322923, timezone:"Europe/Chisinau", houseSystem:"koch" });
const fmt = p => `${p.body} ${p.sign} ${Math.floor(p.degreeInSign)}°${p.house?` (дом ${p.house})`:""}`;
const natalStr = natal.points.map(fmt).join(" · ");
const transitStr = nowChart.points.map(p=>`${p.body} ${p.sign} ${Math.floor(p.degreeInSign)}°`).join(" · ");

const interests = ["технологии/стартапы","бизнес","наука и космос"];
const region = "Молдова/мир";
const dossier = { language:"ru", addressForm:"masculine", locationCurrent:"Кишинёв, Молдова",
  interests, styleProfile:{humor:0.4,seriousness:0.5,warmth:0.6,brevity:0.6,mysticism:0.4,emoji:0.2},
  note:"Первое письмо (cold start)." };
const astrologerName = "Вега";

async function call(model, body) {
  const res = await fetch("https://api.anthropic.com/v1/messages", { method:"POST",
    headers:{ "x-api-key":API_KEY, "anthropic-version":VERSION, "content-type":"application/json" },
    body: JSON.stringify({ model, ...body }) });
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(JSON.stringify(j.error||j));
  return { text:(j.content||[]).filter(b=>b.type==="text").map(b=>b.text).join(""), usage:j.usage, stop:j.stop_reason, model:j.model };
}
const parse = s => { let t=s; const m=s.match(/```(?:json)?\s*([\s\S]*?)```/); if(m)t=m[1];
  const i=t.indexOf("{"), j=t.lastIndexOf("}"); if(i>=0&&j>i)t=t.slice(i,j+1); return JSON.parse(t.trim()); };
const cost = (model,u) => (u.input_tokens+(u.cache_read_input_tokens||0))*RATE[model][0] + u.output_tokens*RATE[model][1];

// ---- 1) News digest on SONNET + web_search -----------------------------------
console.log("=== STEP 1: NEWS DIGEST (Sonnet 4.6 + web_search) ===");
const d = await call(SONNET, { max_tokens:1200,
  system:`Ты — news scout. Через web_search найди 2-3 СВЕЖИЕ (последние дни) новости по интересам и региону.
Верни ТОЛЬКО JSON: {"hooks":[{"headline":string,"oneLine":string(≤25 слов)}],"note":string}. Не комментируй процесс.`,
  messages:[{ role:"user", content:`Интересы: ${interests.join(", ")}. Регион: ${region}. Дата: ${today}.` }],
  tools:[{ type:"web_search_20250305", name:"web_search", max_uses:2 }] });
console.log("searches:", d.usage?.server_tool_use?.web_search_requests ?? 0);
const digest = parse(d.text);
console.log(JSON.stringify(digest,null,2));

// ---- 2) Analysis on OPUS (digest only, no search) ----------------------------
console.log("\n=== STEP 2: ANALYSIS (Opus 4.8, digest only) ===");
const a = await call(OPUS, { max_tokens:1500,
  system:`Аналитический движок письма личного астролога. ТОЛЬКО JSON: {"themes":[1-2],"chosenTransits":[string],
"newsHooks":[string],"callbacks":[],"effectiveRegister":{"humor":0..1,"seriousness":0..1,"warmth":0..1,"note":string},
"questions":[{"text":string,"options":[2-3],"dossierKey":string,"sensitive":bool}]}. Сравни транзиты с наталом,
выбери 2-3 значимых аспекта. Первое письмо → вопросы мягко знакомятся. newsHooks бери из переданного дайджеста.`,
  messages:[{ role:"user", content:`ДОСЬЕ:${JSON.stringify(dossier)}\nНАТАЛ:${natalStr}\nТРАНЗИТЫ(${today}):${transitStr}\nНОВОСТИ(дайджест):${JSON.stringify(digest)}` }] });
const brief = parse(a.text);
console.log(JSON.stringify(brief,null,2));

// ---- 3) Generation on OPUS ---------------------------------------------------
console.log("\n=== STEP 3: GENERATION (Opus 4.8) ===");
const g = await call(OPUS, { max_tokens:2000,
  system:`Ты — ${astrologerName}, личный астролог Бориса (мужской род). Первое письмо — тёпло представься.
Выдерживай effectiveRegister. Структура по темам; транзит→смысл→действие→крючок из новостей. ТОЛЬКО JSON:
{"teaser":string(≤180),"html":string(чистый HTML ~250-360 слов),"questions":[{"text":string,"options":[2-3]}](≤3)}. Дисклеймер строкой.`,
  messages:[{ role:"user", content:`БРИФ:${JSON.stringify(brief)}` }] });
const letter = parse(g.text);
console.log("\n--- TEASER ---\n"+letter.teaser);
console.log("\n--- HTML LETTER ---\n"+letter.html);
console.log("\n--- QUESTIONS ---"); for(const q of letter.questions) console.log("• "+q.text+"  ["+q.options.join(" / ")+"]");

// ---- COGS --------------------------------------------------------------------
const cD=cost(SONNET,d.usage), cA=cost(OPUS,a.usage), cG=cost(OPUS,g.usage);
const searches=d.usage?.server_tool_use?.web_search_requests ?? 0, cS=searches*0.01;
console.log("\n=== USAGE / COGS (Sonnet news digest + Opus letter) ===");
console.log(`Digest  (Sonnet): in ${d.usage.input_tokens} out ${d.usage.output_tokens} = $${cD.toFixed(4)}`);
console.log(`Analysis(Opus)  : in ${a.usage.input_tokens} out ${a.usage.output_tokens} = $${cA.toFixed(4)}`);
console.log(`Generate(Opus)  : in ${g.usage.input_tokens} out ${g.usage.output_tokens} = $${cG.toFixed(4)}`);
console.log(`web_search: ${searches} × $0.01 = $${cS.toFixed(4)}`);
const total=cD+cA+cG+cS;
console.log(`TOTAL COGS / letter = $${total.toFixed(4)}   → margin @ $1.50 ≈ ${(100*(1.5-total)/1.5).toFixed(0)}%`);
console.log(`(vs all-Opus+search run: $0.292)`);
