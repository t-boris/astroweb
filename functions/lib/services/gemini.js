"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeLanguage = normalizeLanguage;
exports.buildPlanetaryContext = buildPlanetaryContext;
exports.buildDeepInterpretationPrompt = buildDeepInterpretationPrompt;
exports.buildOraclePrompt = buildOraclePrompt;
exports.buildRelationshipPrompt = buildRelationshipPrompt;
exports.generateGeminiText = generateGeminiText;
exports.getGeminiModelName = getGeminiModelName;
const node_https_1 = require("node:https");
const aspects_1 = require("../astro/aspects");
const DEFAULT_MODEL = "gemini-3-flash-preview";
function toLanguage(language) {
    return language === "ru" ? "ru" : "en";
}
function formatDegree(value) {
    return `${value.toFixed(2)} deg`;
}
function normalizeLanguage(language) {
    return toLanguage(language);
}
function buildPlanetaryContext(chart) {
    const knownBodies = new Set(chart.points.map((point) => point.body));
    const points = chart.points
        .map((point) => {
        const houseLabel = point.house === null ? "house: unknown" : `house: ${point.house}`;
        return `${point.body}: ${point.sign} ${formatDegree(point.degreeInSign)} (${houseLabel})`;
    })
        .join("\n");
    const aspects = chart.aspects
        .filter((aspect) => knownBodies.has(aspect.a) && knownBodies.has(aspect.b))
        .sort((a, b) => b.exactness - a.exactness)
        .slice(0, 12)
        .map((aspect) => `${aspect.a} ${aspect.type} ${aspect.b} (orb ${aspect.orb.toFixed(2)} deg, exactness ${aspect.exactness.toFixed(2)})`)
        .join("\n");
    return [
        `Time known: ${chart.meta.timeUsed === null ? "no" : "yes"}`,
        `Zodiac: ${chart.meta.zodiac}`,
        "Planet positions:",
        points,
        "Major planetary aspects:",
        aspects || "none",
    ].join("\n");
}
function buildDeepInterpretationPrompt(params) {
    const { chart, focusTopic, baseInterpretation, language } = params;
    const planetaryContext = buildPlanetaryContext(chart);
    const normalizedFocus = focusTopic.toLowerCase();
    const isAspectFocus = normalizedFocus.includes("conjunction") ||
        normalizedFocus.includes("opposition") ||
        normalizedFocus.includes("trine") ||
        normalizedFocus.includes("square") ||
        normalizedFocus.includes("sextile");
    const systemInstruction = language === "ru"
        ? "Ты астрологический аналитик. Дай глубокий, но СТРОГО фокусный разбор только по запрошенной теме. Не превращай ответ в общий обзор всей карты. Пиши понятным языком для человека без астрологической подготовки: каждый термин сразу объясняй простыми словами. Используй только предоставленные данные карты. Не добавляй внешние факты, транзиты, диагнозы и мед/юр советы."
        : "You are an astrology analyst. Provide a deep but STRICTLY focused reading only for the requested topic. Do not turn it into a full-chart overview. Write for a non-expert: explain each astrology term in plain language. Use only provided chart data. No external facts, transits, diagnoses, or medical/legal advice.";
    const userPrompt = language === "ru"
        ? [
            "Сделай фокусный глубокий разбор по теме ниже.",
            `Фокус: ${focusTopic}`,
            "Базовая интерпретация:",
            baseInterpretation,
            "Планетарный контекст карты:",
            planetaryContext,
            "Требования к формату ответа (строго):",
            "1) Русский язык, объем 550-900 слов.",
            `2) ${isAspectFocus
                ? "Раскрывай в первую очередь ИМЕННО этот аспект (с его планетами, знаками, домами и орбом)."
                : "Раскрывай ТОЛЬКО указанную тему, без общего разбора всей карты."}`,
            "3) Пиши для новичка: каждый термин (аспект, дом, орб и т.п.) сразу поясняй простыми словами.",
            "4) Обязательно добавь раздел 'Простыми словами': коротко, что это значит в обычной жизни без астросленга.",
            "5) Структура: 6-9 коротких разделов Markdown (### ...).",
            "6) Разрешено упомянуть 1-3 поддерживающих фактора, но только если они напрямую связаны с темой.",
            "7) Добавь 2-3 бытовых примера проявления темы во взаимодействии с людьми (работа, отношения, семья).",
            "8) В конце блок: 'Практика' с 4-6 конкретными шагами по теме.",
            "9) Без таблиц, без длинных отступлений, без повторов.",
            "10) Заверши ответ строкой: [END_OF_REPORT]",
        ].join("\n\n")
        : [
            "Create a focused deep interpretation for the topic below.",
            `Focus: ${focusTopic}`,
            "Base interpretation:",
            baseInterpretation,
            "Planetary chart context:",
            planetaryContext,
            "Response requirements (strict):",
            "1) English, 550-900 words.",
            `2) ${isAspectFocus
                ? "Focus primarily on THIS requested aspect (its planets, signs, houses, and orb)."
                : "Focus ONLY on the requested topic, no full-chart overview."}`,
            "3) Write for non-experts: explain every astrology term (aspect, house, orb, etc.) in plain language right away.",
            "4) Include a mandatory section 'In plain language' that explains the meaning in everyday life without jargon.",
            "5) Use 6-9 short Markdown sections (### ...).",
            "6) Mention 1-3 supporting factors only if directly tied to the topic.",
            "7) Add 2-3 everyday examples involving human interactions (work, relationships, family).",
            "8) End with a 'Practice' section containing 4-6 actionable steps.",
            "9) No tables, no long detours, no repetition.",
            "10) End with a single line: [END_OF_REPORT]",
        ].join("\n\n");
    return {
        systemInstruction,
        userPrompt,
        temperature: 0.4,
        maxOutputTokens: 2600,
    };
}
function buildOraclePrompt(params) {
    const { chart, question, language } = params;
    const planetaryContext = buildPlanetaryContext(chart);
    const systemInstruction = language === "ru"
        ? "Ты Оракул натальной карты. Отвечай только на основе предоставленных планетарных позиций и аспектов. Не опирайся на общие гороскопы, не придумывай события, не давай советы по медицине/праву/финансам как эксперт."
        : "You are a natal-chart oracle. Answer only from the provided planetary positions and aspects. Do not rely on generic horoscopes, do not invent events, and do not provide medical/legal/financial expert advice.";
    const userPrompt = language === "ru"
        ? [
            "Вопрос пользователя:",
            question,
            "Планетарный контекст карты:",
            planetaryContext,
            "Формат ответа СТРОГО:",
            "1) Объем 220-420 слов, законченный цельный ответ.",
            "2) Структура: 'Вывод', 'Логика карты', 'Риски и опоры', 'Практический фокус'.",
            "3) В разделе 'Логика карты' дай 4-6 коротких пунктов, каждый с конкретной ссылкой на планеты/знаки/дома/аспекты из данных.",
            "4) В 'Риски и опоры' покажи минимум 2 риска и 2 ресурса, опираясь на карту.",
            "5) В 'Практический фокус' дай 3-5 четких шагов, напрямую связанных с указанными астрологическими факторами.",
            "6) Без воды, без общих фраз, без цитат и технических артефактов.",
            "7) Используй только данные этой натальной карты. Не добавляй транзиты и внешние события.",
            "8) Заверши ответ строкой: [END_OF_REPORT]",
        ].join("\n\n")
        : [
            "User question:",
            question,
            "Planetary chart context:",
            planetaryContext,
            "STRICT response format:",
            "1) 220-420 words, complete finished answer.",
            "2) Structure: 'Conclusion', 'Chart logic', 'Risks and supports', 'Practical focus'.",
            "3) In 'Chart logic', provide 4-6 short bullets, each grounded in concrete planets/signs/houses/aspects from the data.",
            "4) In 'Risks and supports', include at least 2 risks and 2 resources tied to chart factors.",
            "5) In 'Practical focus', give 3-5 clear actions directly linked to the cited astrological factors.",
            "6) No fluff, no generic statements, no quotes or continuation artifacts.",
            "7) Use only this natal chart data. No transits or external event claims.",
            "8) End with a single line: [END_OF_REPORT]",
        ].join("\n\n");
    return {
        systemInstruction,
        userPrompt,
        temperature: 0.3,
        maxOutputTokens: 2000,
    };
}
function buildSynastryAspectContext(params) {
    const { chartA, chartB, personAName, personBName } = params;
    const aspects = [];
    for (const pointA of chartA.points) {
        for (const pointB of chartB.points) {
            const aspect = (0, aspects_1.detectAspect)(pointA.body, pointA.lon, pointB.body, pointB.lon);
            if (aspect) {
                aspects.push(aspect);
            }
        }
    }
    aspects.sort((a, b) => b.exactness - a.exactness);
    return aspects
        .slice(0, 20)
        .map((aspect) => `${personAName} ${aspect.a} ${aspect.type} ${personBName} ${aspect.b} (orb ${aspect.orb.toFixed(2)} deg, exactness ${aspect.exactness.toFixed(2)})`)
        .join("\n");
}
function buildRelationshipPrompt(params) {
    const { chartA, chartB, personAName, personBName, language } = params;
    const contextA = buildPlanetaryContext(chartA);
    const contextB = buildPlanetaryContext(chartB);
    const synastryContext = buildSynastryAspectContext({
        chartA,
        chartB,
        personAName,
        personBName,
    });
    const systemInstruction = language === "ru"
        ? "Ты астрологический аналитик совместимости (синастрия). Дай разбор отношений только по данным двух натальных карт. Пиши простым языком для не-астролога. Не используй транзиты, внешние события, диагнозы и мед/юр/фин советы."
        : "You are a synastry (relationship compatibility) astrology analyst. Provide a relationship reading only from two natal charts. Write in plain language for non-experts. No transits, external event claims, diagnoses, or legal/medical/financial expert advice.";
    const userPrompt = language === "ru"
        ? [
            `Сделай расклад на отношения для пары: ${personAName} и ${personBName}.`,
            `Карта ${personAName}:`,
            contextA,
            `Карта ${personBName}:`,
            contextB,
            "Межкартные аспекты (синастрия):",
            synastryContext || "none",
            "Требования к ответу:",
            "1) Русский язык, 380-700 слов.",
            "2) Структура Markdown: ### Общая динамика, ### Притяжение и близость, ### Коммуникация и конфликты, ### Ресурсы пары, ### Риски пары, ### Практика.",
            "3) В тексте используй минимум 6 конкретных ссылок на факторы карт (планеты, знаки, дома, аспекты, орбы).",
            "4) Каждый астрологический термин сразу поясняй простыми словами.",
            "5) В разделе 'Практика' дай 5 конкретных шагов для улучшения взаимодействия.",
            "6) Без таблиц, без воды, без общих гороскопных фраз.",
            "7) Заверши ответ строкой: [END_OF_REPORT]",
        ].join("\n\n")
        : [
            `Create a relationship reading for: ${personAName} and ${personBName}.`,
            `${personAName} chart:`,
            contextA,
            `${personBName} chart:`,
            contextB,
            "Cross-chart synastry aspects:",
            synastryContext || "none",
            "Response requirements:",
            "1) English, 380-700 words.",
            "2) Markdown structure: ### Overall dynamic, ### Attraction and intimacy, ### Communication and conflict, ### Relationship strengths, ### Relationship risks, ### Practice.",
            "3) Include at least 6 concrete references to chart factors (planets, signs, houses, aspects, orbs).",
            "4) Explain each astrology term in plain language immediately.",
            "5) In 'Practice', provide 5 specific actions to improve interactions.",
            "6) No tables, no fluff, no generic horoscope statements.",
            "7) End with a single line: [END_OF_REPORT]",
        ].join("\n\n");
    return {
        systemInstruction,
        userPrompt,
        temperature: 0.35,
        maxOutputTokens: 2400,
    };
}
function sanitizeGeminiOutput(input) {
    const rawLines = input
        .replace(/\r\n/g, "\n")
        .split("\n");
    const filteredLines = rawLines.filter((line) => {
        const normalized = line.trim().toLowerCase();
        return !(normalized.startsWith("of fragment to start from") ||
            normalized.startsWith("*continuation:*") ||
            normalized.startsWith("last generated fragment:") ||
            normalized.startsWith("continue the same answer") ||
            normalized.startsWith('"of fragment to start from') ||
            normalized === '"' ||
            normalized === "'");
    });
    // Remove near-duplicate adjacent lines keeping the longer one.
    const deduped = [];
    for (const line of filteredLines) {
        const current = line.trim();
        if (!current) {
            deduped.push(line);
            continue;
        }
        const prev = deduped.length > 0 ? deduped[deduped.length - 1].trim() : "";
        const prevLower = prev.toLowerCase();
        const currentLower = current.toLowerCase();
        if (prevLower &&
            (prevLower === currentLower ||
                prevLower.startsWith(currentLower) ||
                currentLower.startsWith(prevLower))) {
            if (current.length > prev.length) {
                deduped[deduped.length - 1] = line;
            }
            continue;
        }
        deduped.push(line);
    }
    return deduped
        .join("\n")
        .replace(/\*Continuation:\*\s*/gi, "")
        .replace(/\[END_OF_REPORT\]/g, "")
        .replace(/^["']+\s*/gm, "")
        .replace(/\s*["']+\s*$/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
async function callGeminiOnce(input, apiKey, model) {
    const endpoint = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`);
    const payload = JSON.stringify({
        systemInstruction: {
            parts: [{ text: input.systemInstruction }],
        },
        contents: [
            {
                role: "user",
                parts: [{ text: input.userPrompt }],
            },
        ],
        generationConfig: {
            temperature: input.temperature ?? 0.5,
            maxOutputTokens: input.maxOutputTokens ?? 800,
        },
    });
    const response = await new Promise((resolve, reject) => {
        const req = (0, node_https_1.request)(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
            },
        }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });
            res.on("end", () => {
                resolve({
                    statusCode: res.statusCode ?? 500,
                    body: Buffer.concat(chunks).toString("utf-8"),
                });
            });
        });
        req.on("error", reject);
        req.write(payload);
        req.end();
    });
    let parsed = null;
    try {
        parsed = JSON.parse(response.body);
    }
    catch {
        // Keep parsed as null and raise below.
    }
    if (response.statusCode >= 400) {
        const apiError = parsed?.error?.message;
        throw new Error(apiError ?? `Gemini API error (${response.statusCode})`);
    }
    const candidate = parsed?.candidates?.[0];
    const text = candidate?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim();
    if (!text) {
        throw new Error("Gemini returned an empty response");
    }
    return {
        text,
        finishReason: candidate?.finishReason ?? null,
    };
}
async function generateGeminiText(input, options = {}) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured");
    }
    const allowContinuation = options.allowContinuation ?? true;
    const sanitizeOutput = options.sanitizeOutput ?? true;
    const requireEndTag = options.requireEndTag ?? null;
    const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
    let fullText = "";
    let prompt = input.userPrompt;
    // If the model hits token cap (or doesn't include the expected end tag), optionally request continuation.
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await callGeminiOnce({ ...input, userPrompt: prompt }, apiKey, model);
        fullText = fullText ? `${fullText}\n\n${result.text}` : result.text;
        if (requireEndTag) {
            // End-tag mode: keep going until we see the tag (or we can't continue).
            if (fullText.includes(requireEndTag) || !allowContinuation) {
                const finalText = fullText.trim();
                return sanitizeOutput ? sanitizeGeminiOutput(finalText) : finalText;
            }
        }
        else {
            // Default mode: only continue when the model explicitly hit max tokens.
            if (result.finishReason !== "MAX_TOKENS" || !allowContinuation) {
                const finalText = fullText.trim();
                return sanitizeOutput ? sanitizeGeminiOutput(finalText) : finalText;
            }
        }
        const tail = fullText.slice(-1800);
        prompt = [
            "Continue the SAME answer from the exact stopping point.",
            "Do not repeat previous sections, do not restart, no intro.",
            "Keep the exact same language and style.",
            ...(requireEndTag ? [`Make sure to end the full answer with: ${requireEndTag}`] : []),
            "Last generated fragment:",
            tail,
        ].join("\n\n");
    }
    const finalText = fullText.trim();
    return sanitizeOutput ? sanitizeGeminiOutput(finalText) : finalText;
}
function getGeminiModelName() {
    return process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
}
