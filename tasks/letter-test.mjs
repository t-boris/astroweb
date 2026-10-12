// Personal Astrologer — letter generation test (analysis + generation, Opus 4.8).
// Measures real token usage and computes COGS. Run:
//   export ANTHROPIC_API_KEY=$(firebase functions:secrets:access ANTHROPIC_API_KEY --project astroweb-dev)
//   node tasks/letter-test.mjs

const MODEL = "claude-opus-4-8";
const VERSION = "2023-06-01";
const PRICE_IN = 5 / 1_000_000;   // $/token
const PRICE_OUT = 25 / 1_000_000;

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error("Missing ANTHROPIC_API_KEY"); process.exit(1); }

// ---- Test fixture (realistic) -------------------------------------------------
const chart = `Natal (Алиса, жен.): Солнце в Рыбах, 10 дом · Луна в Деве, 4 дом · Асцендент Рак ·
Уран в Рыбах 10 дом (секстиль Венере) · Сатурн в Раке 1 дом (трин Урану) ·
Меркурий квадрат Плутону · Луна квадрат Плутону · Венера и Марс в Тельце, 11 дом.`;

const transits = `Окно 2 дня: транзитная Луна идёт по 10 дому (карьера/репутация);
Меркурий в квадрате к наталу Сатурну (точность, договорённости); Венера тригон к натальной Венере (тёплые контакты).`;

const dossier = {
  language: "ru",
  addressForm: "feminine",
  locationCurrent: "Москва",
  relationshipStatus: "single",
  occupation: "основатель early-stage стартапа",
  interests: ["карьера/бизнес", "отношения", "творчество"],
  goals: ["запустить продукт", "найти со-основателя"],
  openLoops: ["на прошлой неделе спрашивала про оффер/контракт с инвестором"],
  styleProfile: { humor: 0.6, seriousness: 0.5, formality: 0.2, warmth: 0.75, brevity: 0.6, mysticism: 0.4, emoji: 0.3 },
  styleNudge: null,
};
const recentQuestion = "Стоит ли сейчас подписывать контракт с инвестором?"; // serious/anxious -> register override
// Simulated fetched news (stands in for Opus web_search results)
const news = [
  "Венчур РФ: число посевных сделок во 2 кв. выросло, но чеки стали меньше и осторожнее.",
  "Тренд among founders: всё чаще берут паузу и доращивают метрики перед раундом.",
  "Погода Москва: похолодание, пасмурно, к вечеру прояснение.",
];
const cadence = "раз в 2 дня";
const astrologerName = "Вега";

// ---- API helper ---------------------------------------------------------------
async function call(system, user, maxTokens) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": API_KEY, "anthropic-version": VERSION, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(JSON.stringify(json.error || json));
  const text = (json.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  return { text, usage: json.usage, model: json.model };
}
function parseJson(s) {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse((m ? m[1] : s).trim());
}
function cost(u) { return u.input_tokens * PRICE_IN + u.output_tokens * PRICE_OUT; }

// ---- Pass 1: analysis ---------------------------------------------------------
const analysisSystem = `Ты — аналитический движок для письма «личного астролога». На выходе ТОЛЬКО JSON по схеме:
{ "themes": [string,1-2], "chosenTransits": [string], "newsHooks": [string], "callbacks": [string],
  "effectiveRegister": {"humor":0..1,"seriousness":0..1,"warmth":0..1,"brevity":0..1,"note":string},
  "questions": [ {"text":string,"options":[string,2-3],"dossierKey":string,"sensitive":bool} ] }
Правила: выбери 1-2 темы, релевантные именно этому человеку с учётом досье; транзиты — только значимые для её ситуации;
≤3 коротких вопроса, заполняющих пробелы досье (не повторяй недавний вопрос); newsHooks — лёгкие крючки из новостей по её темам.
effectiveRegister = смесь styleProfile и контекста: её недавний вопрос про контракт серьёзный/тревожный →
снизь humor, подними seriousness/warmth (read the room), но сохрани её обычную тёплую манеру.`;

const analysisUser = `ДОСЬЕ: ${JSON.stringify(dossier, null, 0)}
НАТАЛ: ${chart}
ТРАНЗИТЫ: ${transits}
НЕДАВНИЙ ВОПРОС (последняя неделя): "${recentQuestion}"
НОВОСТИ (уже найдены): ${news.map((n,i)=>`(${i+1}) ${n}`).join(" ")}
ЧАСТОТА ПИСЕМ: ${cadence}`;

// ---- Pass 2: generation -------------------------------------------------------
function genSystem(brief) {
  return `Ты — ${astrologerName}, личный астролог Алисы (одна постоянная личность). Пиши ПИСЬМО на русском,
женский грамматический род ("ты сделала", "готова"). Выдерживай effectiveRegister из брифа:
humor=${brief.effectiveRegister.humor}, seriousness=${brief.effectiveRegister.seriousness}, warmth=${brief.effectiveRegister.warmth}.
Структура — по темам брифа; вплетай транзит → что значит → что делать → лёгкий крючок из новостей. Обяжись к континуитету:
сошлись на её открытую петлю (контракт). Read the room: вопрос про контракт серьёзный — без шуточек по этой теме, тепло и по делу.
На выходе ТОЛЬКО JSON: { "teaser": string (≤180 симв., для email), "html": string (чистый HTML без <script>, ~250-380 слов,
заголовки/абзацы/выделения), "questions": [ {"text":string,"options":[string,2-3]} ] (≤3) }.
Дисклеймер — лёгкий, в конце одной строкой.`;
}

// ---- Run ----------------------------------------------------------------------
console.log("=== PASS 1: ANALYSIS (Opus 4.8) ===");
const a = await call(analysisSystem, analysisUser, 1300);
const brief = parseJson(a.text);
console.log(JSON.stringify(brief, null, 2));

console.log("\n=== PASS 2: GENERATION (Opus 4.8) ===");
const g = await call(genSystem(brief), `БРИФ: ${JSON.stringify(brief)}`, 2000);
const letter = parseJson(g.text);
console.log("\n--- TEASER ---\n" + letter.teaser);
console.log("\n--- HTML LETTER ---\n" + letter.html);
console.log("\n--- QUESTIONS ---");
for (const q of letter.questions) console.log("• " + q.text + "  [" + q.options.join(" / ") + "]");

// ---- Cost ---------------------------------------------------------------------
const c1 = cost(a.usage), c2 = cost(g.usage);
const searchSurcharge = 3 * 0.01; // ~3 web searches if live
console.log("\n=== USAGE / COGS ===");
console.log(`Pass 1 analysis : in ${a.usage.input_tokens}  out ${a.usage.output_tokens}  = $${c1.toFixed(4)}`);
console.log(`Pass 2 generate : in ${g.usage.input_tokens}  out ${g.usage.output_tokens}  = $${c2.toFixed(4)}`);
console.log(`Token COGS (2 passes)        = $${(c1 + c2).toFixed(4)}`);
console.log(`+ web_search (~3 × $0.01)     = $${searchSurcharge.toFixed(4)}`);
console.log(`TOTAL COGS / letter          = $${(c1 + c2 + searchSurcharge).toFixed(4)}`);
console.log(`Revenue/cycle @ $0.50×3       = $1.50   → margin ≈ ${(100*(1.5-(c1+c2+searchSurcharge))/1.5).toFixed(0)}%`);
