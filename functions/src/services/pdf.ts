import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import type {
  ChartAspect,
  ChartPoint,
  ChartResult,
  Profile,
} from "../types";

export interface PremiumPdfSection {
  title: string;
  body: string;
  category?: string;
  detail?: string;
}

export interface PremiumPdfNarrative {
  model?: string;
  planets?: string;
  houses?: string;
  aspects?: string;
  portrait?: string;
}

export interface PremiumPdfReport {
  title: string;
  subtitle?: string;
  generatedAt?: string;
  language: "en" | "ru";
  sections: PremiumPdfSection[];
  aiNarrative?: PremiumPdfNarrative;
  profile?: Profile;
  chart?: ChartResult;
  isRelocated?: boolean;
}

const GOLD = "#B9862C";
const DEEP_GOLD = "#7C5318";
const TEXT = "#24201B";
const MUTED = "#6E6257";
const BORDER = "#E3D4B8";
const PAPER = "#FBF6ED";
const PAPER_DARK = "#F1E5CF";
const INK_LIGHT = "#3C332A";
const SOFT_LINE = "#D8C39D";
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

type PdfLanguage = "en" | "ru";
type PdfPageTheme = "cover" | "chart" | "planets" | "houses" | "aspects" | "portrait";

const PAGE_THEMES: Record<PdfPageTheme, {
  background: string;
  wash: string;
  accent: string;
  line: string;
}> = {
  cover: {
    background: "#1B1624",
    wash: "#39233F",
    accent: "#D7A548",
    line: "#795A2B",
  },
  chart: {
    background: "#F4E2C4",
    wash: "#D9B46B",
    accent: "#8B5E20",
    line: "#C49A52",
  },
  planets: {
    background: "#EAF1F0",
    wash: "#8AA9A2",
    accent: "#275C67",
    line: "#6D958E",
  },
  houses: {
    background: "#EEF0DF",
    wash: "#AAB76B",
    accent: "#59662A",
    line: "#8D9A54",
  },
  aspects: {
    background: "#F1E6EA",
    wash: "#B27386",
    accent: "#82384C",
    line: "#A45B70",
  },
  portrait: {
    background: "#F8EEDC",
    wash: "#C9A772",
    accent: "#6D4E1F",
    line: "#B48C50",
  },
};

const SIGN_ORDER = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
] as const;

const SIGN_LABELS: Record<string, Record<PdfLanguage, string>> = {
  Aries: { en: "Aries", ru: "Овен" },
  Taurus: { en: "Taurus", ru: "Телец" },
  Gemini: { en: "Gemini", ru: "Близнецы" },
  Cancer: { en: "Cancer", ru: "Рак" },
  Leo: { en: "Leo", ru: "Лев" },
  Virgo: { en: "Virgo", ru: "Дева" },
  Libra: { en: "Libra", ru: "Весы" },
  Scorpio: { en: "Scorpio", ru: "Скорпион" },
  Sagittarius: { en: "Sagittarius", ru: "Стрелец" },
  Capricorn: { en: "Capricorn", ru: "Козерог" },
  Aquarius: { en: "Aquarius", ru: "Водолей" },
  Pisces: { en: "Pisces", ru: "Рыбы" },
};

const SIGN_IN_PHRASE_LABELS_RU: Record<string, string> = {
  Aries: "Овна",
  Taurus: "Тельца",
  Gemini: "Близнецов",
  Cancer: "Рака",
  Leo: "Льва",
  Virgo: "Девы",
  Libra: "Весов",
  Scorpio: "Скорпиона",
  Sagittarius: "Стрельца",
  Capricorn: "Козерога",
  Aquarius: "Водолея",
  Pisces: "Рыб",
};

const SIGN_SHORT_LABELS: Record<string, Record<PdfLanguage, string>> = {
  Aries: { en: "Ari", ru: "Ов" },
  Taurus: { en: "Tau", ru: "Тел" },
  Gemini: { en: "Gem", ru: "Бл" },
  Cancer: { en: "Can", ru: "Рак" },
  Leo: { en: "Leo", ru: "Лев" },
  Virgo: { en: "Vir", ru: "Дев" },
  Libra: { en: "Lib", ru: "Вес" },
  Scorpio: { en: "Sco", ru: "Ско" },
  Sagittarius: { en: "Sag", ru: "Стр" },
  Capricorn: { en: "Cap", ru: "Коз" },
  Aquarius: { en: "Aqu", ru: "Вод" },
  Pisces: { en: "Pis", ru: "Рыб" },
};

const BODY_LABELS: Record<string, Record<PdfLanguage, string>> = {
  Sun: { en: "Sun", ru: "Солнце" },
  Moon: { en: "Moon", ru: "Луна" },
  Mercury: { en: "Mercury", ru: "Меркурий" },
  Venus: { en: "Venus", ru: "Венера" },
  Mars: { en: "Mars", ru: "Марс" },
  Jupiter: { en: "Jupiter", ru: "Юпитер" },
  Saturn: { en: "Saturn", ru: "Сатурн" },
  Uranus: { en: "Uranus", ru: "Уран" },
  Neptune: { en: "Neptune", ru: "Нептун" },
  Pluto: { en: "Pluto", ru: "Плутон" },
  ASC: { en: "Ascendant", ru: "Асцендент" },
  MC: { en: "Midheaven", ru: "Середина неба" },
};

const BODY_SHORT_LABELS: Record<string, string> = {
  Sun: "Su",
  Moon: "Mo",
  Mercury: "Me",
  Venus: "Ve",
  Mars: "Ma",
  Jupiter: "Ju",
  Saturn: "Sa",
  Uranus: "Ur",
  Neptune: "Ne",
  Pluto: "Pl",
  ASC: "AC",
  MC: "MC",
};

const BODY_MEANINGS: Record<string, Record<PdfLanguage, string>> = {
  Sun: {
    en: "identity, vitality, will and the visible center of character",
    ru: "личность, жизненная сила, воля и видимый центр характера",
  },
  Moon: {
    en: "emotions, memory, instinctive safety and private needs",
    ru: "эмоции, память, инстинктивная безопасность и личные потребности",
  },
  Mercury: {
    en: "thinking, speech, learning style and everyday decisions",
    ru: "мышление, речь, стиль обучения и повседневные решения",
  },
  Venus: {
    en: "love, taste, pleasure, values and the ability to receive",
    ru: "любовь, вкус, удовольствие, ценности и способность принимать",
  },
  Mars: {
    en: "drive, desire, anger, courage and direct action",
    ru: "напор, желание, злость, смелость и прямое действие",
  },
  Jupiter: {
    en: "growth, faith, meaning, generosity and confidence",
    ru: "рост, вера, смысл, щедрость и уверенность",
  },
  Saturn: {
    en: "limits, discipline, responsibility, fear and mastery",
    ru: "границы, дисциплина, ответственность, страх и мастерство",
  },
  Uranus: {
    en: "freedom, disruption, originality and sudden change",
    ru: "свобода, разрыв шаблонов, оригинальность и внезапные перемены",
  },
  Neptune: {
    en: "dreams, intuition, ideals, compassion and fog",
    ru: "сны, интуиция, идеалы, сострадание и туманность",
  },
  Pluto: {
    en: "power, depth, crisis, regeneration and hidden intensity",
    ru: "сила, глубина, кризис, возрождение и скрытая интенсивность",
  },
  ASC: {
    en: "first impression, body language and the doorway into life",
    ru: "первое впечатление, язык тела и способ входить в жизнь",
  },
  MC: {
    en: "calling, reputation, public direction and visible achievement",
    ru: "призвание, репутация, публичное направление и видимые достижения",
  },
};

const ASPECT_LABELS: Record<ChartAspect["type"], Record<PdfLanguage, string>> = {
  conjunction: { en: "Conjunction", ru: "Соединение" },
  sextile: { en: "Sextile", ru: "Секстиль" },
  square: { en: "Square", ru: "Квадратура" },
  trine: { en: "Trine", ru: "Тригон" },
  opposition: { en: "Opposition", ru: "Оппозиция" },
};

const ASPECT_COLORS: Record<ChartAspect["type"], string> = {
  conjunction: "#9B6B2E",
  sextile: "#3E7C59",
  square: "#A13E34",
  trine: "#336A9E",
  opposition: "#7A4A8E",
};

const ASPECT_MEANINGS: Record<ChartAspect["type"], Record<PdfLanguage, string>> = {
  conjunction: {
    en: "blends the two principles into one concentrated complex; the gifts are powerful, but the person may need distance to see the pattern clearly",
    ru: "смешивает два принципа в один концентрированный комплекс; дар здесь силен, но человеку важно научиться видеть этот паттерн со стороны",
  },
  sextile: {
    en: "opens a cooperative channel; it is not automatic luck, but a talent that grows when consciously practiced",
    ru: "открывает канал сотрудничества; это не автоматическая удача, а талант, который раскрывается через осознанную практику",
  },
  square: {
    en: "creates friction and pressure; the aspect becomes constructive when the person stops choosing one side and builds a new skill through effort",
    ru: "создает трение и давление; аспект становится конструктивным, когда человек перестает выбирать одну сторону и через усилие формирует новый навык",
  },
  trine: {
    en: "creates a natural flow; it supports confidence and ease, but still asks to be used deliberately rather than taken for granted",
    ru: "создает естественный поток; он дает уверенность и легкость, но просит использовать дар осознанно, а не принимать его как должное",
  },
  opposition: {
    en: "sets up a polarity; growth comes through dialogue, projection awareness and a more mature balance between two needs",
    ru: "создает полярность; рост приходит через диалог, осознание проекций и более зрелый баланс между двумя потребностями",
  },
};

const HOUSE_TOPICS: Record<number, Record<PdfLanguage, string>> = {
  1: { en: "identity, body, style of action", ru: "личность, тело, способ действовать" },
  2: { en: "resources, money, self-worth", ru: "ресурсы, деньги, самоценность" },
  3: { en: "learning, siblings, communication", ru: "обучение, близкое окружение, коммуникация" },
  4: { en: "home, family roots, inner foundation", ru: "дом, родовые корни, внутренняя опора" },
  5: { en: "creativity, romance, children, play", ru: "творчество, романтика, дети, игра" },
  6: { en: "work rhythm, health, craft, service", ru: "рабочий ритм, здоровье, мастерство, служение" },
  7: { en: "partnership, marriage, open mirrors", ru: "партнерство, брак, открытые зеркала" },
  8: { en: "shared resources, intimacy, crisis, trust", ru: "общие ресурсы, близость, кризис, доверие" },
  9: { en: "beliefs, travel, higher study, meaning", ru: "убеждения, путешествия, высшее знание, смысл" },
  10: { en: "career, status, vocation, public role", ru: "карьера, статус, призвание, публичная роль" },
  11: { en: "friends, networks, hopes, community", ru: "друзья, сети, надежды, сообщество" },
  12: { en: "subconscious, solitude, endings, spirit", ru: "подсознание, уединение, завершения, дух" },
};

const SIGN_TONES: Record<string, Record<PdfLanguage, string>> = {
  Aries: {
    en: "direct, initiating, impatient and courageous",
    ru: "прямой, инициативный, нетерпеливый и смелый",
  },
  Taurus: {
    en: "steady, bodily, practical and oriented toward lasting value",
    ru: "устойчивый, телесный, практичный и ориентированный на долговечную ценность",
  },
  Gemini: {
    en: "curious, mobile, verbal and responsive to changing information",
    ru: "любопытный, подвижный, словесный и чувствительный к новой информации",
  },
  Cancer: {
    en: "protective, emotional, memory-based and focused on belonging",
    ru: "защитный, эмоциональный, связанный с памятью и потребностью в принадлежности",
  },
  Leo: {
    en: "expressive, proud, creative and hungry for sincere recognition",
    ru: "выразительный, гордый, творческий и нуждающийся в искреннем признании",
  },
  Virgo: {
    en: "precise, analytical, improving and attentive to detail",
    ru: "точный, аналитический, улучшающий и внимательный к деталям",
  },
  Libra: {
    en: "relational, aesthetic, diplomatic and sensitive to balance",
    ru: "партнерский, эстетический, дипломатичный и чувствительный к балансу",
  },
  Scorpio: {
    en: "intense, private, transformative and drawn to hidden layers",
    ru: "интенсивный, закрытый, трансформирующий и тянущийся к скрытым слоям",
  },
  Sagittarius: {
    en: "expansive, searching, philosophical and oriented toward meaning",
    ru: "расширяющий, ищущий, философский и ориентированный на смысл",
  },
  Capricorn: {
    en: "disciplined, realistic, responsible and focused on structure",
    ru: "дисциплинированный, реалистичный, ответственный и сфокусированный на структуре",
  },
  Aquarius: {
    en: "independent, conceptual, future-minded and socially observant",
    ru: "независимый, концептуальный, обращенный в будущее и социально наблюдательный",
  },
  Pisces: {
    en: "imaginative, permeable, compassionate and guided by subtle feeling",
    ru: "воображающий, восприимчивый, сострадательный и ведомый тонким чувством",
  },
};

const SIGN_EXPRESSION: Record<string, Record<PdfLanguage, string>> = {
  Aries: {
    en: "acts by starting quickly, testing courage in practice, and learning through direct confrontation with life",
    ru: "действует через быстрый старт, проверку смелости на практике и прямое столкновение с жизнью",
  },
  Taurus: {
    en: "seeks stability, embodiment and visible results; it trusts what can be built, touched and sustained",
    ru: "ищет устойчивость, телесное подтверждение и видимый результат; доверяет тому, что можно построить, почувствовать и удержать",
  },
  Gemini: {
    en: "moves through questions, words, observation and the ability to compare several possibilities at once",
    ru: "движется через вопросы, слова, наблюдение и способность одновременно сравнивать несколько возможностей",
  },
  Cancer: {
    en: "responds through memory, attachment, protection and the need to feel emotionally rooted",
    ru: "реагирует через память, привязанность, защиту и потребность чувствовать эмоциональную укорененность",
  },
  Leo: {
    en: "expresses itself through warmth, creativity, pride and the wish to be seen sincerely",
    ru: "проявляется через тепло, творчество, гордость и желание быть увиденным искренне",
  },
  Virgo: {
    en: "works by improving, sorting, refining and noticing where reality needs care",
    ru: "работает через улучшение, сортировку, уточнение и внимание к тому, где реальности нужен уход",
  },
  Libra: {
    en: "looks for proportion, dialogue, aesthetic order and a fair relationship between sides",
    ru: "ищет пропорцию, диалог, эстетический порядок и справедливое соотношение сторон",
  },
  Scorpio: {
    en: "moves toward depth, trust, intensity and the transformation of what cannot remain superficial",
    ru: "тянется к глубине, доверию, интенсивности и трансформации того, что не может оставаться поверхностным",
  },
  Sagittarius: {
    en: "needs meaning, perspective, movement and a larger horizon for experience",
    ru: "нуждается в смысле, перспективе, движении и более широком горизонте опыта",
  },
  Capricorn: {
    en: "acts through discipline, realism, responsibility and the patient building of structure",
    ru: "действует через дисциплину, реализм, ответственность и терпеливое построение формы",
  },
  Aquarius: {
    en: "works through distance, originality, systems thinking and the need to remain internally free",
    ru: "работает через дистанцию, оригинальность, системное мышление и потребность оставаться внутренне свободным",
  },
  Pisces: {
    en: "perceives through subtle feeling, imagination, compassion and porous boundaries",
    ru: "воспринимает через тонкое чувство, воображение, сострадание и проницаемые границы",
  },
};

const BODY_INTERPRETIVE_FOCUS: Record<string, Record<PdfLanguage, {
  functionText: string;
  houseVerb: string;
  matureText: string;
}>> = {
  Sun: {
    en: {
      functionText: "The Sun describes the organizing center of the personality: will, vitality, self-recognition and the way a person claims the right to be visible.",
      houseVerb: "wants to become visible and meaningful",
      matureText: "When this solar function is lived consciously, confidence becomes quieter and more reliable; the person no longer needs constant proof of worth, because action itself begins to confirm identity.",
    },
    ru: {
      functionText: "Солнце описывает организующий центр личности: жизненную силу, волю, самопризнание и способ занимать видимое место в жизни.",
      houseVerb: "хочет стать видимой, значимой и признанной",
      matureText: "Когда эта солнечная функция проживается осознанно, уверенность становится спокойнее и надежнее: человеку уже не нужно постоянно доказывать ценность, потому что сами действия начинают подтверждать личность.",
    },
  },
  Moon: {
    en: {
      functionText: "The Moon describes emotional memory, instinctive safety, private needs and the way the body reacts before the mind has time to explain anything.",
      houseVerb: "looks for safety, familiarity and emotional confirmation",
      matureText: "When this lunar function is respected, feelings stop being treated as weakness; they become a sensitive instrument that shows where care, rest or protection is needed.",
    },
    ru: {
      functionText: "Луна описывает эмоциональную память, инстинктивную безопасность, личные потребности и реакцию тела до того, как разум успевает все объяснить.",
      houseVerb: "ищет безопасность, привычность и эмоциональное подтверждение",
      matureText: "Когда эта лунная функция уважается, чувства перестают восприниматься как слабость: они становятся точным инструментом, который показывает, где нужны забота, отдых или защита.",
    },
  },
  Mercury: {
    en: {
      functionText: "Mercury describes thinking, speech, perception, learning and the way a person turns experience into language and decisions.",
      houseVerb: "asks questions, gathers information and tries to understand patterns",
      matureText: "When Mercury works well, words become useful rather than noisy: the person can name what is happening, separate facts from anxiety and make clearer choices.",
    },
    ru: {
      functionText: "Меркурий описывает мышление, речь, восприятие, обучение и способ превращать опыт в слова и решения.",
      houseVerb: "задает вопросы, собирает информацию и пытается понять закономерности",
      matureText: "Когда Меркурий работает зрелым образом, слова становятся полезными, а не шумными: человек может назвать происходящее, отделить факты от тревоги и принять более ясное решение.",
    },
  },
  Venus: {
    en: {
      functionText: "Venus describes attraction, pleasure, affection, taste, values and the ability to receive without immediately defending or proving.",
      houseVerb: "seeks pleasure, value, beauty and mutual acceptance",
      matureText: "When Venus is conscious, desire becomes a guide to values; the person learns not only to please, but also to choose what is genuinely nourishing.",
    },
    ru: {
      functionText: "Венера описывает притяжение, удовольствие, нежность, вкус, ценности и способность принимать, не защищаясь и не доказывая.",
      houseVerb: "ищет удовольствие, ценность, красоту и взаимное принятие",
      matureText: "Когда Венера осознается, желание становится указателем ценностей: человек учится не только нравиться, но и выбирать то, что действительно питает.",
    },
  },
  Mars: {
    en: {
      functionText: "Mars describes desire, anger, courage, pursuit, physical drive and the way a person meets resistance.",
      houseVerb: "pushes, defends, initiates and demands direct action",
      matureText: "When Mars is integrated, force stops leaking as irritation; it becomes clean action, honest boundaries and the courage to want openly.",
    },
    ru: {
      functionText: "Марс описывает желание, злость, смелость, напор, физический импульс и способ встречаться с сопротивлением.",
      houseVerb: "толкает вперед, защищает, инициирует и требует прямого действия",
      matureText: "Когда Марс интегрирован, сила перестает утекать в раздражение: она становится чистым действием, честными границами и смелостью открыто хотеть.",
    },
  },
  Jupiter: {
    en: {
      functionText: "Jupiter describes expansion, faith, generosity, meaning, confidence and the ability to see a larger horizon.",
      houseVerb: "expands, searches for meaning and expects growth",
      matureText: "When Jupiter is balanced, optimism does not become exaggeration; it becomes trust supported by judgment and experience.",
    },
    ru: {
      functionText: "Юпитер описывает расширение, веру, щедрость, смысл, уверенность и способность видеть больший горизонт.",
      houseVerb: "расширяется, ищет смысл и ожидает роста",
      matureText: "Когда Юпитер уравновешен, оптимизм не превращается в преувеличение: он становится доверием, подкрепленным рассудком и опытом.",
    },
  },
  Saturn: {
    en: {
      functionText: "Saturn describes limits, responsibility, discipline, fear, endurance and the ability to turn pressure into mastery.",
      houseVerb: "tests, slows down, structures and demands maturity",
      matureText: "When Saturn is lived well, limitation stops being only a wall; it becomes the form through which competence, authority and self-respect are built.",
    },
    ru: {
      functionText: "Сатурн описывает границы, ответственность, дисциплину, страх, выдержку и способность превращать давление в мастерство.",
      houseVerb: "проверяет, замедляет, структурирует и требует зрелости",
      matureText: "Когда Сатурн проживается зрелым образом, ограничение перестает быть только стеной: оно становится формой, через которую строятся компетентность, авторитет и самоуважение.",
    },
  },
  Uranus: {
    en: {
      functionText: "Uranus describes freedom, disruption, originality, sudden insight and the need to break patterns that have become lifeless.",
      houseVerb: "interrupts routine and demands more inner freedom",
      matureText: "When Uranus is integrated, rebellion becomes clarity: the person can renew life without destroying everything simply to feel free.",
    },
    ru: {
      functionText: "Уран описывает свободу, разрыв шаблонов, оригинальность, внезапное прозрение и потребность ломать формы, которые стали мертвыми.",
      houseVerb: "прерывает рутину и требует большей внутренней свободы",
      matureText: "Когда Уран интегрирован, бунт становится ясностью: человек может обновлять жизнь, не разрушая все подряд только ради ощущения свободы.",
    },
  },
  Neptune: {
    en: {
      functionText: "Neptune describes imagination, compassion, ideals, sensitivity, longing and places where boundaries become porous.",
      houseVerb: "dissolves hard edges, idealizes and opens subtle perception",
      matureText: "When Neptune is conscious, sensitivity becomes inspiration rather than confusion; compassion remains alive without sacrificing discernment.",
    },
    ru: {
      functionText: "Нептун описывает воображение, сострадание, идеалы, чувствительность, тоску по большему и места, где границы становятся проницаемыми.",
      houseVerb: "размывает жесткие края, идеализирует и открывает тонкое восприятие",
      matureText: "Когда Нептун осознается, чувствительность становится вдохновением, а не туманом; сострадание остается живым, но не отменяет различения.",
    },
  },
  Pluto: {
    en: {
      functionText: "Pluto describes depth, power, crisis, hidden intensity, loss of innocence and the ability to regenerate after inner truth has been faced.",
      houseVerb: "intensifies, exposes hidden motives and forces transformation",
      matureText: "When Pluto is integrated, control gives way to depth: the person can meet difficult truth without being consumed by it.",
    },
    ru: {
      functionText: "Плутон описывает глубину, власть, кризис, скрытую интенсивность, потерю наивности и способность возрождаться после встречи с внутренней правдой.",
      houseVerb: "усиливает, вскрывает скрытые мотивы и заставляет трансформироваться",
      matureText: "Когда Плутон интегрирован, контроль уступает место глубине: человек может встретиться с трудной правдой и не быть ею поглощенным.",
    },
  },
};

function getFontPath(fileName: string): string | null {
  const fontPath = path.resolve(__dirname, "../../assets/fonts", fileName);
  return fs.existsSync(fontPath) ? fontPath : null;
}

function registerFonts(doc: PDFKit.PDFDocument): {
  regular: string;
  bold: string;
  sans: string;
  sansBold: string;
} {
  const serifRegularPath = getFontPath("NotoSerif-Regular.ttf");
  const serifBoldPath = getFontPath("NotoSerif-Bold.ttf");
  const sansRegularPath = getFontPath("NotoSans-Regular.ttf");
  const sansBoldPath = getFontPath("NotoSans-Bold.ttf");

  if (serifRegularPath) {
    doc.registerFont("NotoSerif", serifRegularPath);
  }
  if (serifBoldPath) {
    doc.registerFont("NotoSerif-Bold", serifBoldPath);
  }
  if (sansRegularPath) {
    doc.registerFont("NotoSans", sansRegularPath);
  }
  if (sansBoldPath) {
    doc.registerFont("NotoSans-Bold", sansBoldPath);
  }

  return {
    regular: serifRegularPath ? "NotoSerif" : "Helvetica",
    bold: serifBoldPath ? "NotoSerif-Bold" : "Helvetica-Bold",
    sans: sansRegularPath ? "NotoSans" : "Helvetica",
    sansBold: sansBoldPath ? "NotoSans-Bold" : "Helvetica-Bold",
  };
}

function normalizePdfText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\[END_OF_REPORT\]/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ensureSpace(doc: PDFKit.PDFDocument, minHeight: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + minHeight > bottom) {
    doc.addPage();
  }
}

function renderParagraph(
  doc: PDFKit.PDFDocument,
  text: string,
  fonts: { regular: string; bold: string },
): void {
  const cleaned = normalizePdfText(text);
  if (!cleaned) return;

  const lines = cleaned.split("\n");
  let paragraph: string[] = [];

  function flushParagraph() {
    const content = paragraph.join(" ").trim();
    paragraph = [];
    if (!content) return;

    ensureSpace(doc, 46);
    doc.x = doc.page.margins.left;
    doc
      .font(fonts.regular)
      .fontSize(10.5)
      .fillColor(TEXT)
      .text(content, {
        align: "left",
        lineGap: 4,
      })
      .moveDown(0.75);
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      ensureSpace(doc, 52);
      doc
        .font(fonts.bold)
        .fontSize(heading[1].length <= 2 ? 13 : 11.5)
        .fillColor(GOLD)
        .text(heading[2], { lineGap: 2 })
        .moveDown(0.45);
      continue;
    }

    const listItem = line.match(/^(-|\*|\d+\.)\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      ensureSpace(doc, 36);
      doc
        .font(fonts.regular)
        .fontSize(10.5)
        .fillColor(TEXT)
        .text(`- ${listItem[2]}`, {
          indent: 14,
          lineGap: 3,
        })
        .moveDown(0.25);
      continue;
    }

    if (/^---+$/.test(line)) {
      flushParagraph();
      ensureSpace(doc, 24);
      doc
        .moveDown(0.2)
        .strokeColor(BORDER)
        .lineWidth(0.5)
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke()
        .moveDown(0.7);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
}

function renderFooter(
  doc: PDFKit.PDFDocument,
  fonts: { regular: string; bold: string; sans: string; sansBold: string },
): void {
  const range = doc.bufferedPageRange();

  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);

    const pageNumber = pageIndex + 1;
    const footerY = doc.page.height - 30;
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 20;
    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        `AstroWeb - ${pageNumber}`,
        doc.page.margins.left,
        footerY,
        {
          align: "center",
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
          lineBreak: false,
        },
      );
    doc.page.margins.bottom = originalBottomMargin;
  }
}

function labelFor(
  labels: Record<string, Record<PdfLanguage, string>>,
  key: string,
  language: PdfLanguage,
): string {
  return labels[key]?.[language] ?? key;
}

function signInPhrase(sign: string, language: PdfLanguage): string {
  if (language === "ru") {
    return SIGN_IN_PHRASE_LABELS_RU[sign] ?? labelFor(SIGN_LABELS, sign, language);
  }

  return labelFor(SIGN_LABELS, sign, language);
}

function formatDegreeInSign(degree: number): string {
  const wholeDegrees = Math.floor(degree);
  const minutes = Math.round((degree - wholeDegrees) * 60);
  const normalizedMinutes = minutes === 60 ? 0 : minutes;
  const normalizedDegrees = minutes === 60 ? wholeDegrees + 1 : wholeDegrees;
  return `${normalizedDegrees}°${String(normalizedMinutes).padStart(2, "0")}'`;
}

function longitudeToSign(longitude: number): {
  sign: string;
  degreeInSign: number;
} {
  const normalized = ((longitude % 360) + 360) % 360;
  const signIndex = Math.floor(normalized / 30);
  return {
    sign: SIGN_ORDER[signIndex],
    degreeInSign: normalized - signIndex * 30,
  };
}

function formatLongitude(longitude: number, language: PdfLanguage): string {
  const { sign, degreeInSign } = longitudeToSign(longitude);
  return `${formatDegreeInSign(degreeInSign)} ${labelFor(SIGN_LABELS, sign, language)}`;
}

function formatPointPlacement(point: ChartPoint, language: PdfLanguage): string {
  const sign = labelFor(SIGN_LABELS, point.sign, language);
  const degree = formatDegreeInSign(point.degreeInSign);
  const house =
    point.house === null
      ? language === "ru"
        ? "дом не определен"
        : "house not calculated"
      : language === "ru"
        ? `${point.house} дом`
        : `house ${point.house}`;

  return `${degree} ${sign}, ${house}`;
}

function pointLongitude(chart: ChartResult, name: string): number | null {
  if (name === "ASC") return chart.houses.asc;
  if (name === "MC") return chart.houses.mc;
  return chart.points.find((point) => point.body === name)?.lon ?? null;
}

function pointPlacementDescription(
  chart: ChartResult,
  name: string,
  language: PdfLanguage,
): string {
  if (name === "ASC" && chart.houses.asc !== null) {
    return formatLongitude(chart.houses.asc, language);
  }
  if (name === "MC" && chart.houses.mc !== null) {
    return formatLongitude(chart.houses.mc, language);
  }

  const point = chart.points.find((item) => item.body === name);
  return point ? formatPointPlacement(point, language) : "";
}

function sketchOffset(index: number, amplitude: number): number {
  return (((index * 37) % 11) - 5) * amplitude;
}

function drawSketchLine(
  doc: PDFKit.PDFDocument,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  opacity = 0.22,
): void {
  doc.save().strokeColor(color).lineWidth(0.55).opacity(opacity);
  for (let index = 0; index < 4; index += 1) {
    const dx = sketchOffset(index, 0.45);
    const dy = sketchOffset(index + 3, 0.45);
    doc
      .moveTo(x1 + dx, y1 + dy)
      .lineTo(x2 + sketchOffset(index + 6, 0.45), y2 + sketchOffset(index + 9, 0.45))
      .stroke();
  }
  doc.restore();
}

function drawSketchCircle(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  radius: number,
  color: string,
  opacity = 0.2,
): void {
  doc.save().strokeColor(color).lineWidth(0.55).opacity(opacity);
  for (let index = 0; index < 4; index += 1) {
    doc
      .circle(
        x + sketchOffset(index, 0.7),
        y + sketchOffset(index + 4, 0.7),
        radius + sketchOffset(index + 8, 0.35),
      )
      .stroke();
  }
  doc.restore();
}

function drawSketchWheel(
  doc: PDFKit.PDFDocument,
  centerX: number,
  centerY: number,
  radius: number,
  color: string,
  opacity = 0.18,
): void {
  drawSketchCircle(doc, centerX, centerY, radius, color, opacity);
  drawSketchCircle(doc, centerX, centerY, radius * 0.67, color, opacity * 0.9);
  drawSketchCircle(doc, centerX, centerY, radius * 0.36, color, opacity * 0.85);

  for (let index = 0; index < 12; index += 1) {
    const angle = ((index * 30 - 90) * Math.PI) / 180;
    drawSketchLine(
      doc,
      centerX + Math.cos(angle) * radius * 0.36,
      centerY + Math.sin(angle) * radius * 0.36,
      centerX + Math.cos(angle) * radius,
      centerY + Math.sin(angle) * radius,
      color,
      opacity * 0.95,
    );
  }
}

function drawSketchConstellation(
  doc: PDFKit.PDFDocument,
  points: Array<[number, number]>,
  color: string,
  opacity = 0.22,
): void {
  for (let index = 0; index < points.length; index += 1) {
    const [x, y] = points[index];
    drawSketchCircle(doc, x, y, 4, color, opacity);
    if (index < points.length - 1) {
      const [nextX, nextY] = points[index + 1];
      drawSketchLine(doc, x, y, nextX, nextY, color, opacity);
    }
  }
}

function drawPageBackground(
  doc: PDFKit.PDFDocument,
  themeName: PdfPageTheme,
  pageNumber: number,
): void {
  const previousX = doc.x;
  const previousY = doc.y;
  const theme = PAGE_THEMES[themeName];
  doc
    .save()
    .rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
    .fill(theme.background)
    .restore();

  if (themeName === "cover") {
    doc.save();
    for (let index = 0; index < 74; index += 1) {
      const x = (index * 79) % PAGE_WIDTH;
      const y = (index * 137) % PAGE_HEIGHT;
      const radius = 0.6 + ((index * 5) % 12) / 10;
      doc
        .fillColor(index % 4 === 0 ? "#FFFFFF" : theme.accent)
        .opacity(index % 5 === 0 ? 0.85 : 0.45)
        .circle(x, y, radius)
        .fill();
    }
    doc
      .opacity(0.22)
      .fillColor(theme.wash)
      .circle(PAGE_WIDTH - 70, 80, 190)
      .fill()
      .circle(40, PAGE_HEIGHT - 60, 230)
      .fill()
      .restore();
    doc.x = previousX;
    doc.y = previousY;
    return;
  }

  doc
    .save()
    .opacity(0.18)
    .fillColor(theme.wash)
    .circle(PAGE_WIDTH - 46, 70, 150)
    .fill()
    .circle(24, PAGE_HEIGHT - 22, 220)
    .fill()
    .restore();

  doc
    .save()
    .strokeColor(theme.line)
    .lineWidth(0.65)
    .opacity(0.32);

  if (themeName === "chart") {
    drawSketchWheel(doc, PAGE_WIDTH - 92, 132, 112, theme.line, 0.2);
  } else if (themeName === "planets") {
    for (let index = 0; index < 6; index += 1) {
      drawSketchCircle(doc, PAGE_WIDTH - 86, 94 + index * 24, 7 + index * 2, theme.line, 0.22);
      if (index > 0) {
        drawSketchLine(
          doc,
          PAGE_WIDTH - 86,
          94 + (index - 1) * 24,
          PAGE_WIDTH - 86,
          94 + index * 24,
          theme.line,
          0.14,
        );
      }
    }
  } else if (themeName === "houses") {
    drawSketchWheel(doc, 58, PAGE_HEIGHT - 112, 92, theme.line, 0.2);
  } else if (themeName === "aspects") {
    drawSketchConstellation(doc, [
      [PAGE_WIDTH - 170, 86],
      [PAGE_WIDTH - 66, 128],
      [PAGE_WIDTH - 122, 205],
      [PAGE_WIDTH - 202, 176],
      [PAGE_WIDTH - 220, 112],
      [PAGE_WIDTH - 170, 86],
    ], theme.line, 0.24);
    drawSketchLine(doc, PAGE_WIDTH - 220, 112, PAGE_WIDTH - 122, 205, theme.line, 0.14);
    drawSketchLine(doc, PAGE_WIDTH - 202, 176, PAGE_WIDTH - 66, 128, theme.line, 0.14);
  } else {
    for (let index = 0; index < 5; index += 1) {
      const startX = 42 + index * 18;
      const startY = 78;
      const endX = 190;
      const endY = 66 + index * 24;
      drawSketchLine(doc, startX, startY, 96, 44 + index * 19, theme.line, 0.12);
      drawSketchLine(doc, 96, 44 + index * 19, 124, 128 + index * 6, theme.line, 0.12);
      drawSketchLine(doc, 124, 128 + index * 6, endX, endY, theme.line, 0.12);
    }
  }

  doc.restore();

  doc
    .save()
    .fontSize(8)
    .fillColor(theme.accent)
    .opacity(0.55);
  const originalBottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 20;
  doc
    .text(String(pageNumber + 1).padStart(2, "0"), PAGE_WIDTH - 76, PAGE_HEIGHT - 36, {
      width: 36,
      align: "right",
      lineBreak: false,
    });
  doc.page.margins.bottom = originalBottomMargin;
  doc.restore();
  doc.x = previousX;
  doc.y = previousY;
}

function addSectionTitle(
  doc: PDFKit.PDFDocument,
  fonts: { regular: string; bold: string; sans: string; sansBold: string },
  title: string,
  kicker?: string,
): void {
  ensureSpace(doc, 84);
  if (kicker) {
    doc
      .font(fonts.sansBold)
      .fontSize(8.5)
      .fillColor(DEEP_GOLD)
      .text(kicker.toUpperCase(), {
        characterSpacing: 1.1,
      })
      .moveDown(0.25);
  }

  doc
    .font(fonts.bold)
    .fontSize(20)
    .fillColor(TEXT)
    .text(title, { lineGap: 2 })
    .moveDown(0.35);

  doc
    .strokeColor(SOFT_LINE)
    .lineWidth(0.8)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke()
    .moveDown(0.8);
}

function drawDecorativeWheel(
  doc: PDFKit.PDFDocument,
  centerX: number,
  centerY: number,
  radius: number,
): void {
  doc
    .save()
    .strokeColor(SOFT_LINE)
    .lineWidth(0.7)
    .opacity(0.7)
    .circle(centerX, centerY, radius)
    .stroke()
    .circle(centerX, centerY, radius * 0.72)
    .stroke()
    .circle(centerX, centerY, radius * 0.42)
    .stroke();

  for (let index = 0; index < 12; index += 1) {
    const angle = ((index * 30 - 90) * Math.PI) / 180;
    doc
      .moveTo(centerX + Math.cos(angle) * radius * 0.42, centerY + Math.sin(angle) * radius * 0.42)
      .lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius)
      .stroke();
  }

  doc.restore();
}

function drawNatalChart(
  doc: PDFKit.PDFDocument,
  chart: ChartResult,
  language: PdfLanguage,
  centerX: number,
  centerY: number,
  radius: number,
  fonts: { regular: string; bold: string; sans: string; sansBold: string },
): void {
  const outerRadius = radius;
  const zodiacRadius = radius - 24;
  const planetRadius = radius - 52;
  const aspectRadius = radius - 86;

  drawDecorativeWheel(doc, centerX, centerY, outerRadius);

  doc
    .save()
    .strokeColor("#CDA65F")
    .lineWidth(1.4)
    .circle(centerX, centerY, outerRadius)
    .stroke()
    .circle(centerX, centerY, zodiacRadius)
    .stroke()
    .restore();

  for (let index = 0; index < 12; index += 1) {
    const boundaryAngle = ((index * 30 - 90) * Math.PI) / 180;
    const labelAngle = (((index * 30) + 15 - 90) * Math.PI) / 180;
    const sign = SIGN_ORDER[index];

    doc
      .save()
      .strokeColor(SOFT_LINE)
      .lineWidth(0.8)
      .moveTo(
        centerX + Math.cos(boundaryAngle) * zodiacRadius,
        centerY + Math.sin(boundaryAngle) * zodiacRadius,
      )
      .lineTo(
        centerX + Math.cos(boundaryAngle) * outerRadius,
        centerY + Math.sin(boundaryAngle) * outerRadius,
      )
      .stroke()
      .font(fonts.sansBold)
      .fontSize(8)
      .fillColor(DEEP_GOLD)
      .text(
        labelFor(SIGN_SHORT_LABELS, sign, language),
        centerX + Math.cos(labelAngle) * (outerRadius - 13) - 16,
        centerY + Math.sin(labelAngle) * (outerRadius - 13) - 5,
        { width: 32, align: "center" },
      )
      .restore();
  }

  if (chart.houses.asc !== null && chart.houses.mc !== null) {
    chart.houses.cusps.forEach((cusp, index) => {
      const angle = ((cusp - 90) * Math.PI) / 180;
      doc
        .save()
        .strokeColor(index === 0 || index === 9 ? GOLD : "#C9B088")
        .lineWidth(index === 0 || index === 9 ? 1.5 : 0.65)
        .moveTo(
          centerX + Math.cos(angle) * (aspectRadius - 16),
          centerY + Math.sin(angle) * (aspectRadius - 16),
        )
        .lineTo(
          centerX + Math.cos(angle) * zodiacRadius,
          centerY + Math.sin(angle) * zodiacRadius,
        )
        .stroke()
        .font(fonts.sans)
        .fontSize(7)
        .fillColor(MUTED)
        .text(
          String(index + 1),
          centerX + Math.cos(angle) * (aspectRadius - 29) - 8,
          centerY + Math.sin(angle) * (aspectRadius - 29) - 4,
          { width: 16, align: "center" },
        )
        .restore();
    });
  }

  for (const aspect of chart.aspects.slice(0, 24)) {
    const lonA = pointLongitude(chart, aspect.a);
    const lonB = pointLongitude(chart, aspect.b);
    if (lonA === null || lonB === null) continue;

    const angleA = ((lonA - 90) * Math.PI) / 180;
    const angleB = ((lonB - 90) * Math.PI) / 180;
    doc
      .save()
      .opacity(0.32)
      .strokeColor(ASPECT_COLORS[aspect.type])
      .lineWidth(0.85)
      .moveTo(centerX + Math.cos(angleA) * aspectRadius, centerY + Math.sin(angleA) * aspectRadius)
      .lineTo(centerX + Math.cos(angleB) * aspectRadius, centerY + Math.sin(angleB) * aspectRadius)
      .stroke()
      .restore();
  }

  const sortedPoints = [...chart.points].sort((a, b) => a.lon - b.lon);
  let previousLongitude = -999;
  let lane = 0;

  for (const point of sortedPoints) {
    if (Math.abs(point.lon - previousLongitude) < 8) {
      lane = (lane + 1) % 3;
    } else {
      lane = 0;
    }
    previousLongitude = point.lon;

    const angle = ((point.lon - 90) * Math.PI) / 180;
    const markerRadius = planetRadius - lane * 13;
    const x = centerX + Math.cos(angle) * markerRadius;
    const y = centerY + Math.sin(angle) * markerRadius;

    doc
      .save()
      .fillColor("#FFF9EF")
      .strokeColor(GOLD)
      .lineWidth(0.9)
      .circle(x, y, 9)
      .fillAndStroke()
      .font(fonts.sansBold)
      .fontSize(6.8)
      .fillColor(TEXT)
      .text(BODY_SHORT_LABELS[point.body] ?? point.body.slice(0, 2), x - 9, y - 4.5, {
        width: 18,
        align: "center",
      })
      .restore();
  }

  doc
    .save()
    .font(fonts.sans)
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(
      language === "ru"
        ? "Внешнее кольцо - знаки, внутренние линии - дома и аспекты"
        : "Outer ring: signs; inner lines: houses and aspects",
      centerX - radius,
      centerY + radius + 14,
      { width: radius * 2, align: "center" },
    )
    .restore();
}

function renderKeyValueGrid(
  doc: PDFKit.PDFDocument,
  fonts: { regular: string; bold: string; sans: string; sansBold: string },
  rows: Array<[string, string]>,
  x: number,
  y: number,
  width: number,
): number {
  const rowHeight = 25;
  const labelWidth = width * 0.38;

  rows.forEach(([label, value], index) => {
    const rowY = y + index * rowHeight;
    doc
      .save()
      .fillColor(index % 2 === 0 ? "#FFF9EF" : "#F7EBD8")
      .rect(x, rowY, width, rowHeight)
      .fill()
      .strokeColor(BORDER)
      .lineWidth(0.35)
      .rect(x, rowY, width, rowHeight)
      .stroke()
      .font(fonts.sansBold)
      .fontSize(8)
      .fillColor(MUTED)
      .text(label, x + 10, rowY + 8, { width: labelWidth - 14 })
      .font(fonts.sans)
      .fontSize(8.5)
      .fillColor(TEXT)
      .text(value, x + labelWidth, rowY + 8, { width: width - labelWidth - 10 })
      .restore();
  });

  doc.x = doc.page.margins.left;
  doc.y = y + rows.length * rowHeight;
  return y + rows.length * rowHeight;
}

function renderTable(
  doc: PDFKit.PDFDocument,
  fonts: { regular: string; bold: string; sans: string; sansBold: string },
  headers: string[],
  rows: string[][],
  columnWidths: number[],
): void {
  const x = doc.page.margins.left;
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  const headerHeight = 24;
  const rowHeight = 24;

  function drawHeader() {
    ensureSpace(doc, headerHeight + rowHeight);
    const y = doc.y;
    doc
      .save()
      .fillColor(DEEP_GOLD)
      .rect(x, y, tableWidth, headerHeight)
      .fill()
      .restore();

    let currentX = x;
    headers.forEach((header, index) => {
      doc
        .font(fonts.sansBold)
        .fontSize(8)
        .fillColor("#FFF9EF")
        .text(header, currentX + 7, y + 7, {
          width: columnWidths[index] - 14,
          height: headerHeight - 10,
        });
      currentX += columnWidths[index];
    });
    doc.y = y + headerHeight;
  }

  drawHeader();

  rows.forEach((row, rowIndex) => {
    ensureSpace(doc, rowHeight + 12);
    if (doc.y < doc.page.margins.top + 6) {
      drawHeader();
    }
    const y = doc.y;

    doc
      .save()
      .fillColor(rowIndex % 2 === 0 ? "#FFF9EF" : "#F8EEDC")
      .rect(x, y, tableWidth, rowHeight)
      .fill()
      .strokeColor(BORDER)
      .lineWidth(0.3)
      .rect(x, y, tableWidth, rowHeight)
      .stroke()
      .restore();

    let currentX = x;
    row.forEach((cell, index) => {
      doc
        .font(index === 0 ? fonts.sansBold : fonts.sans)
        .fontSize(8)
        .fillColor(index === 0 ? TEXT : INK_LIGHT)
        .text(cell, currentX + 7, y + 7, {
          width: columnWidths[index] - 14,
          height: rowHeight - 9,
          ellipsis: true,
        });
      currentX += columnWidths[index];
    });

    doc.y = y + rowHeight;
  });

  doc.moveDown(1.2);
  doc.x = doc.page.margins.left;
}

function describeAspect(
  aspect: ChartAspect,
  chart: ChartResult,
  language: PdfLanguage,
): string {
  const a = labelFor(BODY_LABELS, aspect.a, language);
  const b = labelFor(BODY_LABELS, aspect.b, language);
  const aMeaning = BODY_MEANINGS[aspect.a]?.[language] ?? aspect.a;
  const bMeaning = BODY_MEANINGS[aspect.b]?.[language] ?? aspect.b;
  const aspectName = ASPECT_LABELS[aspect.type][language].toLowerCase();
  const placementA = pointPlacementDescription(chart, aspect.a, language);
  const placementB = pointPlacementDescription(chart, aspect.b, language);
  const aspectMeaning = ASPECT_MEANINGS[aspect.type][language];

  if (language === "ru") {
    return `${a} (${placementA}) образует ${aspectName} с ${b} (${placementB}). Здесь встречаются ${aMeaning} и ${bMeaning}: ${aspectMeaning}. Орб ${aspect.orb.toFixed(2)}° показывает, насколько точно аспект включен; чем он меньше, тем заметнее тема в повседневных реакциях и выборах. Практически это стоит читать как задачу согласовать обе функции, а не подавлять одну ради другой.`;
  }

  return `${a} (${placementA}) forms a ${aspectName} with ${b} (${placementB}). This links ${aMeaning} with ${bMeaning}: it ${aspectMeaning}. The ${aspect.orb.toFixed(2)}° orb shows how tightly the pattern is wired; the smaller the orb, the more visible it becomes in daily reactions and choices. In practice, this is an invitation to coordinate both functions instead of letting one override the other.`;
}

function renderAspectNarratives(
  doc: PDFKit.PDFDocument,
  chart: ChartResult,
  language: PdfLanguage,
  fonts: { regular: string; bold: string; sans: string; sansBold: string },
): void {
  if (chart.aspects.length === 0) {
    doc
      .font(fonts.regular)
      .fontSize(10.5)
      .fillColor(TEXT)
      .text(
        language === "ru"
          ? "Мажорные аспекты в пределах заданных орбов не найдены."
          : "No major aspects were found within the configured orbs.",
        { lineGap: 4 },
      );
    return;
  }

  for (const aspect of chart.aspects) {
    const title = `${labelFor(BODY_LABELS, aspect.a, language)} - ${ASPECT_LABELS[aspect.type][language]} - ${labelFor(BODY_LABELS, aspect.b, language)}`;
    const meta =
      language === "ru"
        ? `Орб ${aspect.orb.toFixed(2)}° · точность ${Math.round(aspect.exactness * 100)}%`
        : `Orb ${aspect.orb.toFixed(2)}° · exactness ${Math.round(aspect.exactness * 100)}%`;
    const description = describeAspect(aspect, chart, language);
    const titleHeight = doc
      .font(fonts.sansBold)
      .fontSize(10)
      .heightOfString(title, { width: 220 });
    const descriptionHeight = doc
      .font(fonts.regular)
      .fontSize(9.2)
      .heightOfString(description, { width: 250, lineGap: 2 });
    const cardHeight = Math.max(112, descriptionHeight + 26, titleHeight + 52);

    ensureSpace(doc, cardHeight + 16);

    doc
      .save()
      .fillColor("#FFF9EF")
      .roundedRect(doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.left - doc.page.margins.right, cardHeight, 8)
      .fill()
      .strokeColor(BORDER)
      .lineWidth(0.4)
      .roundedRect(doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.left - doc.page.margins.right, cardHeight, 8)
      .stroke()
      .restore();

    const startY = doc.y;
    doc
      .font(fonts.sansBold)
      .fontSize(10)
      .fillColor(ASPECT_COLORS[aspect.type])
      .text(title, doc.page.margins.left + 12, startY + 10, {
        width: 220,
      })
      .font(fonts.sans)
      .fontSize(8)
      .fillColor(MUTED)
      .text(meta, doc.page.margins.left + 12, startY + titleHeight + 15, { width: 220 })
      .font(fonts.regular)
      .fontSize(9.2)
      .fillColor(TEXT)
      .text(description, doc.page.margins.left + 245, startY + 10, {
        width: 250,
        lineGap: 2,
      });

    doc.y = startY + cardHeight + 14;
    doc.x = doc.page.margins.left;
  }
}

function renderPlanetNotes(
  doc: PDFKit.PDFDocument,
  chart: ChartResult,
  language: PdfLanguage,
  fonts: { regular: string; bold: string; sans: string; sansBold: string },
): void {
  for (const point of chart.points) {
    ensureSpace(doc, 132);
    const body = labelFor(BODY_LABELS, point.body, language);
    const focus = BODY_INTERPRETIVE_FOCUS[point.body]?.[language];
    const signName = labelFor(SIGN_LABELS, point.sign, language);
    const signPhraseName = signInPhrase(point.sign, language);
    const signExpression = SIGN_EXPRESSION[point.sign]?.[language] ?? signName;
    const houseTopic = point.house ? HOUSE_TOPICS[point.house]?.[language] : undefined;
    const houseIntro =
      point.house === null
        ? language === "ru"
          ? "Так как надежный дом не рассчитан, эту функцию лучше читать через знак и аспекты, без привязки к конкретной жизненной сфере."
          : "Because a reliable house is not calculated, this function should be read through sign and aspects without attaching it to a precise life area."
        : language === "ru"
          ? `${point.house} дом связан с темой "${houseTopic}". Поэтому эта планета проявляется не абстрактно, а через эту область: там она ${focus?.houseVerb ?? "становится заметной"}, создает повторяющиеся ситуации и показывает, где человеку приходится делать выбор.`
          : `House ${point.house} is connected with "${houseTopic}". This planet therefore does not express itself abstractly; it works through this area, where it ${focus?.houseVerb ?? "becomes visible"}, creates recurring situations and shows where choices must be made.`;
    const sentence =
      language === "ru"
        ? `${focus?.functionText ?? `${body} описывает одну из основных функций психики.`} В знаке ${signPhraseName} эта функция ${signExpression}. ${houseIntro} ${focus?.matureText ?? ""}`
        : `${focus?.functionText ?? `${body} describes one of the main psychological functions.`} In ${signName}, this function ${signExpression}. ${houseIntro} ${focus?.matureText ?? ""}`;

    doc
      .font(fonts.sansBold)
      .fontSize(10.5)
      .fillColor(DEEP_GOLD)
      .text(`${body}: ${formatPointPlacement(point, language)}`, doc.page.margins.left, doc.y)
      .moveDown(0.2)
      .font(fonts.regular)
      .fontSize(10)
      .fillColor(TEXT)
      .text(sentence, doc.page.margins.left, doc.y, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        lineGap: 3,
      })
      .moveDown(0.9);
  }
}

function describeHouse(
  houseNumber: number,
  cuspLongitude: number,
  points: ChartPoint[],
  language: PdfLanguage,
): string {
  const { sign } = longitudeToSign(cuspLongitude);
  const signName = labelFor(SIGN_LABELS, sign, language);
  const signPhraseName = signInPhrase(sign, language);
  const tone = SIGN_TONES[sign]?.[language] ?? signName;
  const topic = HOUSE_TOPICS[houseNumber]?.[language] ?? "";

  if (language === "ru") {
    const opening = `${houseNumber} дом отвечает за ${topic}. Его куспид стоит в знаке ${signPhraseName}, поэтому эта область жизни раскрывается через ${tone} способ проявления.`;

    if (points.length === 0) {
      return `${opening} В этом доме нет планет, и это не означает пустоту или отсутствие событий. Скорее, тема дома включается через управителя знака, транзиты, прогрессии и реальные обстоятельства, а не давит постоянно изнутри. Такой дом может проживаться спокойнее: человек обращается к нему тогда, когда жизнь сама требует внимания к этой сфере.`;
    }

    const planetText = points
      .map((point) => {
        const body = labelFor(BODY_LABELS, point.body, language);
        const meaning = BODY_MEANINGS[point.body]?.[language] ?? point.body;
        return `${body} приносит сюда ${meaning}`;
      })
      .join("; ");

    return `${opening} В этом доме находятся ${points.map((point) => labelFor(BODY_LABELS, point.body, language)).join(", ")}, поэтому тема дома становится активной и личной. ${planetText}. Это значит, что область "${topic}" не остается фоном: через нее человек принимает решения, сталкивается с повторяющимися задачами и получает заметную часть жизненного опыта. Чем больше планет в доме, тем труднее игнорировать эту сферу, потому что несколько психологических функций одновременно требуют выражения именно здесь.`;
  }

  const opening = `House ${houseNumber} governs ${topic}. Its cusp falls in ${signName}, so this life area opens through a ${tone} mode of expression.`;

  if (points.length === 0) {
    return `${opening} There are no planets in this house, which does not mean that the area is empty or irrelevant. It usually means the theme is activated through the sign ruler, transits, progressions and real circumstances rather than pressing constantly from within. This house may feel quieter until life specifically asks for attention there.`;
  }

  const planetText = points
    .map((point) => {
      const body = labelFor(BODY_LABELS, point.body, language);
      const meaning = BODY_MEANINGS[point.body]?.[language] ?? point.body;
      return `${body} brings ${meaning} into this house`;
    })
    .join("; ");

  return `${opening} This house contains ${points.map((point) => labelFor(BODY_LABELS, point.body, language)).join(", ")}, so the house topic becomes active and personal. ${planetText}. This means that "${topic}" is not merely background material: it becomes a field where decisions are made, recurring tasks appear and a visible part of life experience is concentrated. The more planets gather here, the harder it is to ignore this area, because several psychological functions seek expression through it at once.`;
}

function renderHouseNarratives(
  doc: PDFKit.PDFDocument,
  chart: ChartResult,
  language: PdfLanguage,
  fonts: { regular: string; bold: string; sans: string; sansBold: string },
): void {
  if (chart.houses.asc === null) {
    renderNarrativeText(
      doc,
      language === "ru"
        ? "Без точного времени рождения дома нельзя раскрыть персонально: куспиды и распределение планет по домам зависят от времени. Поэтому ниже домовая интерпретация опущена, чтобы не выдавать ненадежные данные за точный анализ."
        : "Without an exact birth time, houses cannot be interpreted personally: cusps and planet placement by house depend on time. The house interpretation is therefore omitted rather than presented as precise analysis.",
      fonts,
    );
    return;
  }

  for (let houseNumber = 1; houseNumber <= 12; houseNumber += 1) {
    const cusp = chart.houses.cusps[houseNumber - 1];
    const points = chart.points.filter((point) => point.house === houseNumber);
    ensureSpace(doc, 112);

    doc
      .font(fonts.sansBold)
      .fontSize(11)
      .fillColor(DEEP_GOLD)
      .text(
        language === "ru" ? `${houseNumber} дом` : `House ${houseNumber}`,
        doc.page.margins.left,
        doc.y,
      )
      .moveDown(0.25)
      .font(fonts.sans)
      .fontSize(8.7)
      .fillColor(MUTED)
      .text(
        language === "ru"
          ? `Куспид: ${formatLongitude(cusp, language)} · Тема: ${HOUSE_TOPICS[houseNumber]?.[language] ?? ""}`
          : `Cusp: ${formatLongitude(cusp, language)} · Theme: ${HOUSE_TOPICS[houseNumber]?.[language] ?? ""}`,
        doc.page.margins.left,
        doc.y,
        {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
          lineGap: 2,
        },
      )
      .moveDown(0.35)
      .font(fonts.regular)
      .fontSize(10.2)
      .fillColor(TEXT)
      .text(describeHouse(houseNumber, cusp, points, language), doc.page.margins.left, doc.y, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        lineGap: 3.4,
      })
      .moveDown(0.9);
  }
}

function renderChapterDivider(
  doc: PDFKit.PDFDocument,
  language: PdfLanguage,
  fonts: { regular: string; bold: string; sans: string; sansBold: string },
  title: string,
  subtitle: string,
  sectionNumber: string,
): void {
  doc
    .font(fonts.sansBold)
    .fontSize(10)
    .fillColor(DEEP_GOLD)
    .text(sectionNumber.toUpperCase(), doc.page.margins.left, 126, {
      characterSpacing: 1.5,
    });

  doc
    .font(fonts.bold)
    .fontSize(30)
    .fillColor(TEXT)
    .text(title, doc.page.margins.left, 156, {
      width: 390,
      lineGap: 4,
    });

  doc
    .moveDown(0.8)
    .font(fonts.regular)
    .fontSize(12)
    .fillColor(INK_LIGHT)
    .text(subtitle, {
      width: 390,
      lineGap: 5,
    });
}

function renderNarrativeText(
  doc: PDFKit.PDFDocument,
  text: string,
  fonts: { regular: string; bold: string; sans: string; sansBold: string },
): void {
  const paragraphs = text.split("\n\n").map((item) => item.trim()).filter(Boolean);

  for (const paragraph of paragraphs) {
    ensureSpace(doc, 68);
    doc
      .font(fonts.regular)
      .fontSize(11)
      .fillColor(TEXT)
      .text(paragraph, doc.page.margins.left, doc.y, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        lineGap: 4.5,
        align: "left",
      })
      .moveDown(0.85);
  }
}

function buildOpeningNarrative(
  profile: Profile | undefined,
  chart: ChartResult | undefined,
  language: PdfLanguage,
): string {
  if (!profile || !chart) {
    return language === "ru"
      ? "Этот отчет начинается с общей схемы карты, а затем постепенно переходит к планетам, домам и аспектам. Так формируется цельный портрет: что в человеке является центром, где это проявляется и какие внутренние диалоги создают движение."
      : "This report starts with the whole chart, then moves through planets, houses and aspects. The result is an integrated portrait: what forms the center of the person, where it expresses itself, and which inner dialogues create movement.";
  }

  const sun = chart.points.find((point) => point.body === "Sun");
  const moon = chart.points.find((point) => point.body === "Moon");
  const asc =
    chart.houses.asc === null
      ? null
      : formatLongitude(chart.houses.asc, language);

  if (language === "ru") {
    return `Карта ${profile.name} показывает, как внутренняя воля, эмоциональная природа и жизненные обстоятельства собираются в одну систему. Солнце ${sun ? `находится в ${formatPointPlacement(sun, language)}` : "задает центральный мотив"}, Луна ${moon ? `стоит в ${formatPointPlacement(moon, language)}` : "показывает эмоциональный ритм"}${asc ? `, а Асцендент расположен в ${asc}` : ""}. Эти три точки дают базовую ось: кто действует, что ему нужно внутри и через какую дверь он входит в мир.\n\nДальше отчет движется слоями. Сначала видна карта как рисунок, затем планеты как активные функции психики, после этого дома как конкретные области опыта, и только потом аспекты - линии напряжения, поддержки и выбора между этими функциями. Такой порядок важен: аспект не существует сам по себе, он связывает уже описанные силы.`;
  }

  return `${profile.name}'s chart shows how will, emotional nature and life circumstances assemble into one system. The Sun ${sun ? `is placed at ${formatPointPlacement(sun, language)}` : "sets the central motive"}, the Moon ${moon ? `stands at ${formatPointPlacement(moon, language)}` : "shows the emotional rhythm"}${asc ? `, and the Ascendant is at ${asc}` : ""}. These three points establish the basic axis: who acts, what is needed inside, and through which doorway the person enters the world.\n\nThe report then moves layer by layer. First comes the chart as an image, then the planets as active psychological functions, then the houses as concrete areas of experience, and only after that the aspects - the lines of tension, support and choice between those functions. This order matters: an aspect never lives alone; it connects forces already described.`;
}

function buildBridge(
  from: "chart" | "planets" | "houses" | "aspects",
  language: PdfLanguage,
): string {
  const bridges: Record<typeof from, Record<PdfLanguage, string>> = {
    chart: {
      en: "Now that the whole pattern is visible, we can name the actors inside it. The planets show what kind of energy is speaking before we decide where and how it acts.",
      ru: "Когда общий рисунок уже виден, можно назвать действующих лиц внутри него. Планеты показывают, какая именно энергия говорит, прежде чем мы решим, где и как она действует.",
    },
    planets: {
      en: "Once the planetary functions are named, the houses give them a place of expression. A planet is never abstract: the house shows the concrete area of life where its pattern becomes visible.",
      ru: "Когда планетарные функции названы, дома дают им место проявления. Планета не бывает абстрактной: дом показывает конкретную область жизни, где ее принцип становится видимым.",
    },
    houses: {
      en: "The planets and houses describe forces and life areas. The aspects show how these forces interact: where they cooperate, resist, amplify or challenge each other.",
      ru: "Планеты и дома описали силы и области жизни. Аспекты показывают, как эти силы взаимодействуют: где они сотрудничают, сопротивляются, усиливают или испытывают друг друга.",
    },
    aspects: {
      en: "After the mechanics of the chart are clear, the synthesis can move from separate factors to a fuller psychological portrait.",
      ru: "Когда механика карты стала понятной, синтез может перейти от отдельных факторов к более полному психологическому портрету.",
    },
  };

  return bridges[from][language];
}

interface PortraitSection {
  title: string;
  paragraphs: string[];
}

function getChartPoint(chart: ChartResult, body: string): ChartPoint | null {
  return chart.points.find((point) => point.body === body) ?? null;
}

function describePointForPortrait(
  chart: ChartResult,
  body: string,
  language: PdfLanguage,
): string {
  const point = getChartPoint(chart, body);
  if (!point) return "";

  const bodyName = labelFor(BODY_LABELS, body, language);
  const signName = labelFor(SIGN_LABELS, point.sign, language);
  const signPhraseName = signInPhrase(point.sign, language);
  const houseText =
    point.house === null
      ? language === "ru"
        ? "без надежного дома"
        : "without a reliable house placement"
      : language === "ru"
        ? `в ${point.house} доме`
        : `in house ${point.house}`;
  const topic = point.house ? HOUSE_TOPICS[point.house]?.[language] : "";
  const tone = SIGN_TONES[point.sign]?.[language] ?? signName;

  if (language === "ru") {
    return `${bodyName} стоит в знаке ${signPhraseName} ${houseText}${topic ? `, в зоне "${topic}"` : ""}. Это дает ${tone} оттенок функции: ${BODY_MEANINGS[body]?.[language] ?? body}.`;
  }

  return `${bodyName} is in ${signName} ${houseText}${topic ? `, the area of "${topic}"` : ""}. This gives the function a ${tone} tone: ${BODY_MEANINGS[body]?.[language] ?? body}.`;
}

function strongestAspects(
  chart: ChartResult,
  types: ChartAspect["type"][],
  limit: number,
): ChartAspect[] {
  return chart.aspects
    .filter((aspect) => types.includes(aspect.type))
    .slice(0, limit);
}

function aspectSynthesisSentence(
  aspect: ChartAspect,
  chart: ChartResult,
  language: PdfLanguage,
): string {
  const a = labelFor(BODY_LABELS, aspect.a, language);
  const b = labelFor(BODY_LABELS, aspect.b, language);
  const type = ASPECT_LABELS[aspect.type][language].toLowerCase();
  const meaning = ASPECT_MEANINGS[aspect.type][language];
  const placementA = pointPlacementDescription(chart, aspect.a, language);
  const placementB = pointPlacementDescription(chart, aspect.b, language);

  if (language === "ru") {
    return `${a} (${placementA}) и ${b} (${placementB}) связаны через ${type}: ${meaning}. Это не абстрактная формула, а конкретная внутренняя связка между ${BODY_MEANINGS[aspect.a]?.[language] ?? aspect.a} и ${BODY_MEANINGS[aspect.b]?.[language] ?? aspect.b}.`;
  }

  return `${a} (${placementA}) and ${b} (${placementB}) are connected through a ${type}: it ${meaning}. This is not an abstract formula, but a concrete inner link between ${BODY_MEANINGS[aspect.a]?.[language] ?? aspect.a} and ${BODY_MEANINGS[aspect.b]?.[language] ?? aspect.b}.`;
}

function houseEmphasis(chart: ChartResult, language: PdfLanguage): string {
  const houses = new Map<number, ChartPoint[]>();
  for (const point of chart.points) {
    if (point.house === null) continue;
    houses.set(point.house, [...(houses.get(point.house) ?? []), point]);
  }

  const emphasized = [...houses.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3);

  if (emphasized.length === 0) {
    return language === "ru"
      ? "Без точного времени рождения домовые акценты читаются осторожно, поэтому основной вес переносится на планеты, знаки и аспекты."
      : "Without an exact birth time, house emphasis must be read cautiously, so the main weight shifts to planets, signs and aspects.";
  }

  if (language === "ru") {
    return emphasized
      .map(([house, points]) => {
        const topic = HOUSE_TOPICS[house]?.[language] ?? "";
        const names = points.map((point) => labelFor(BODY_LABELS, point.body, language)).join(", ");
        return `${house} дом (${topic}) выделен через ${names}`;
      })
      .join("; ");
  }

  return emphasized
    .map(([house, points]) => {
      const topic = HOUSE_TOPICS[house]?.[language] ?? "";
      const names = points.map((point) => labelFor(BODY_LABELS, point.body, language)).join(", ");
      return `house ${house} (${topic}) is emphasized through ${names}`;
    })
    .join("; ");
}

function buildDetailedPortrait(
  profile: Profile | undefined,
  chart: ChartResult | undefined,
  language: PdfLanguage,
): PortraitSection[] {
  if (!chart) {
    return [
      {
        title: language === "ru" ? "Подробный портрет" : "Detailed Portrait",
        paragraphs: [
          language === "ru"
            ? "Для полного синтеза нужна рассчитанная карта. В этом файле доступны только текстовые интерпретации, поэтому ниже сохранен общий разбор без персонального распределения планет по домам и аспектам."
            : "A full synthesis requires a calculated chart. This file only contains text interpretations, so the reading below remains general and cannot include personal house and aspect structure.",
        ],
      },
    ];
  }

  const name = profile?.name ?? (language === "ru" ? "человек" : "the person");
  const sun = describePointForPortrait(chart, "Sun", language);
  const moon = describePointForPortrait(chart, "Moon", language);
  const mercury = describePointForPortrait(chart, "Mercury", language);
  const venus = describePointForPortrait(chart, "Venus", language);
  const mars = describePointForPortrait(chart, "Mars", language);
  const jupiter = describePointForPortrait(chart, "Jupiter", language);
  const saturn = describePointForPortrait(chart, "Saturn", language);
  const outer = ["Uranus", "Neptune", "Pluto"]
    .map((body) => describePointForPortrait(chart, body, language))
    .filter(Boolean);
  const tensionAspects = strongestAspects(chart, ["square", "opposition"], 5);
  const supportAspects = strongestAspects(chart, ["sextile", "trine", "conjunction"], 6);
  const topAspects = chart.aspects.slice(0, 6);
  const ascText =
    chart.houses.asc === null
      ? ""
      : language === "ru"
        ? `Асцендент расположен в ${formatLongitude(chart.houses.asc, language)}, поэтому первое впечатление строится через ${SIGN_TONES[longitudeToSign(chart.houses.asc).sign]?.[language] ?? formatLongitude(chart.houses.asc, language)} способ контакта.`
        : `The Ascendant is at ${formatLongitude(chart.houses.asc, language)}, so first impressions form through a ${SIGN_TONES[longitudeToSign(chart.houses.asc).sign]?.[language] ?? formatLongitude(chart.houses.asc, language)} mode of contact.`;
  const mcText =
    chart.houses.mc === null
      ? ""
      : language === "ru"
        ? `Середина неба стоит в ${formatLongitude(chart.houses.mc, language)}, и это показывает, каким тоном человек выходит в публичность, строит репутацию и выбирает направление достижения.`
        : `The Midheaven is at ${formatLongitude(chart.houses.mc, language)}, showing the tone through which public direction, reputation and achievement are built.`;

  if (language === "ru") {
    return [
      {
        title: "Внутренний центр и способ держаться в мире",
        paragraphs: [
          `${name} устроен не через один простой признак, а через сочетание устойчивого центра, эмоциональной памяти и внешней манеры действовать. ${sun} Это описание важно не как ярлык, а как указание на то, где человек собирает волю, где чувствует право быть собой и каким способом пытается удержать ощущение собственной ценности.`,
          `${moon} Эмоциональный слой может работать иначе, чем внешний центр. Там, где воля стремится к одному, чувство безопасности может просить другого ритма: привычности, контроля, близости, дистанции или подтверждения. Поэтому в характере появляется не плоская линия, а несколько внутренних требований, которые нужно согласовывать.`,
          ascText || "Если точное время рождения неизвестно, внешний стиль лучше читать осторожно: без Асцендента нельзя уверенно говорить о телесной манере, первом впечатлении и способе входить в новые обстоятельства.",
          `Главная задача базовой оси - не выбрать одну часть личности и подавить остальные, а научиться пользоваться ими по очереди. Когда центральная воля получает форму, эмоциональная часть перестает быть помехой, а внешняя манера становится инструментом, человек выглядит цельнее и действует спокойнее.`,
        ],
      },
      {
        title: "Эмоциональная память, близость и внутренняя опора",
        paragraphs: [
          `Эмоциональная жизнь здесь не сводится к настроению. Она показывает, как человек запоминает опыт, чего боится потерять и что считает безопасным. ${moon} Это положение делает реакции не случайными: за ними стоит потребность в понятном внутреннем порядке, который помогает выдерживать давление внешних обстоятельств.`,
          `Когда человеку не хватает опоры, он может пытаться компенсировать это контролем, уходом в работу, идеализацией отношений или жесткой самодисциплиной. Но сама карта показывает, что эмоциональная зрелость приходит не через подавление чувств, а через признание их фактической силы. Чувство здесь сообщает, где нарушена граница, где нужна забота, а где пора перестать удерживать старую форму.`,
          `В близости такой человек может одновременно хотеть надежности и бояться полной зависимости. Ему важно, чтобы другой человек не только вызывал чувства, но и уважал ритм, тело, привычки, личные границы. Отношения становятся устойчивыми тогда, когда эмоции не требуют постоянной драматизации, а получают регулярное подтверждение через действия.`,
          `Эта часть карты особенно важна для восстановления после перегрузок. Если эмоциональный слой игнорируется, человек начинает действовать механически. Если же он получает место, появляется способность мягче выбирать, быстрее возвращаться к себе и не путать временное напряжение с окончательным решением.`,
        ],
      },
      {
        title: "Мышление, речь и способ понимать происходящее",
        paragraphs: [
          `${mercury} Поэтому мышление работает не только как анализ, но и как способ удерживать контакт с реальностью. Человеку важно понимать, что именно происходит, на какие факты можно опереться и какие слова действительно что-то меняют. Пустые объяснения быстро утомляют, зато точная формулировка способна собрать внутренний хаос.`,
          `В разговоре это может давать осторожность: прежде чем раскрыться, человек проверяет, насколько собеседник надежен, насколько тема практична и не придется ли потом расплачиваться за слишком быструю откровенность. Там, где доверие есть, речь становится глубже, конкретнее и полезнее.`,
          `Такой ум лучше всего раскрывается, когда получает материал для применения. Абстрактные идеи ценны, если их можно перевести в навык, план, решение, текст, систему или полезный вывод. Если информации слишком много и она никак не структурирована, появляется раздражение или желание закрыться.`,
          `Сильная сторона этого слоя - способность постепенно докапываться до сути. Не обязательно быстро, не обязательно громко, но настойчиво. Человек может видеть детали, которые другие пропускают, и связывать их в практическую картину, если не заставляет себя отвечать раньше, чем мысль созрела.`,
        ],
      },
      {
        title: "Любовь, желание и выбор партнерства",
        paragraphs: [
          `${venus} Тема любви здесь связана не только с симпатией, но и с ценностями: что человек считает красивым, достойным, желанным, живым. В отношениях важно не потерять ощущение собственного желания, потому что без него близость быстро превращается в обязанность.`,
          `${mars} Желание действует как двигатель: оно показывает, где человек готов рисковать, защищаться, добиваться и вступать в прямое взаимодействие с миром. Если эта энергия не имеет выхода, она может уходить в раздражение, пассивное сопротивление или внутреннее напряжение.`,
          `Партнерство для такой карты становится местом, где нужно учиться честно называть свои потребности. Слишком сильная адаптация лишает отношения огня, а слишком резкое самоутверждение может разрушить доверие. Зрелый вариант - говорить прямо, но не превращать каждое различие в борьбу за власть.`,
          `В любви важна не только романтика, но и способность вместе выдерживать реальность: деньги, быт, усталость, разные желания, несовпадающие темпы. Когда партнер видит не только привлекательную часть, но и внутреннюю сложность человека, появляется возможность настоящей близости, а не красивой роли.`,
        ],
      },
      {
        title: "Рост, дисциплина и социальная реализация",
        paragraphs: [
          `${jupiter} Этот слой показывает, где человек расширяется, во что верит и через что чувствует перспективу. Рост не всегда приходит через легкость; иногда он приходит через необходимость поверить в большее, чем текущий страх или привычная рамка.`,
          `${saturn} Сатурнианская часть карты показывает, где требуется взросление: принять ограничения, не обесценить труд, выдержать срок, построить форму. Если этот принцип проживается жестко, человек может критиковать себя слишком сурово. Если зрелее - он превращает страх в мастерство.`,
          mcText || "Если Середина неба не рассчитана из-за неизвестного времени рождения, карьерный вектор лучше читать через планеты, аспекты и повторяющиеся темы карты, а не через точную ось публичной реализации.",
          `Социальная реализация складывается из двух движений: расширения и дисциплины. Нужна смелость видеть возможность, но нужна и форма, которая позволит эту возможность удержать. Когда вера не отрывается от труда, а труд не убивает веру, человек начинает строить результат, который имеет вес.`,
        ],
      },
      {
        title: "Глубинные изменения и скрытые напряжения",
        paragraphs: [
          outer.join(" ") || "Поколенческие планеты показывают более глубокие процессы: свободу, идеалы, кризисы, очищение и способность меняться не поверхностно, а на уровне жизненной стратегии.",
          `${houseEmphasis(chart, language)}. Эти домовые акценты показывают, где жизнь чаще всего требует участия. Если в доме несколько планет, человек не может относиться к этой сфере как к второстепенной: там собирается энергия, там возникают задачи, там же находится часть силы.`,
          ...tensionAspects.map((aspect) => aspectSynthesisSentence(aspect, chart, language)),
          `Напряженные аспекты не стоит читать как поломку. Они показывают места, где психика не может оставаться пассивной. Там приходится учиться новому способу поведения: не действовать автоматически, не переносить внутренний конфликт на других людей, не выбирать одну часть себя против другой.`,
        ],
      },
      {
        title: "Таланты, поддержка и естественные способности",
        paragraphs: [
          ...supportAspects.map((aspect) => aspectSynthesisSentence(aspect, chart, language)),
          `Гармоничные связи не гарантируют результата сами по себе. Они показывают каналы, где энергия идет легче, но если человек не пользуется ими сознательно, талант остается фоном. Именно поэтому секстили требуют действия: они открывают возможность, но не делают выбор вместо человека.`,
          `Трины дают естественность и чувство внутреннего разрешения. Через них человек может восстанавливаться, находить уверенность и делать сложные вещи проще. Но зрелое использование трина означает не расслабленную пассивность, а умение превратить легкость в мастерство.`,
        ],
      },
      {
        title: "Повторяющиеся линии характера",
        paragraphs: [
          ...topAspects.map((aspect) => aspectSynthesisSentence(aspect, chart, language)),
          `Если смотреть на карту в целом, повторяется одна важная тема: человеку нужно согласовать устойчивость и изменение, личное желание и ответственность, внутреннюю безопасность и необходимость двигаться дальше. Когда одна из этих сторон подавляется, появляется напряжение; когда они начинают взаимодействовать, возникает зрелость.`,
          `Практически это означает, что человеку важно не строить жизнь только из защиты и не бросаться в перемены только ради освобождения. Лучший путь - создавать форму, которую можно обновлять. Тогда стабильность не становится клеткой, а развитие не превращается в хаос.`,
        ],
      },
      {
        title: "Итоговый психологический вектор",
        paragraphs: [
          `${name} раскрывается сильнее всего там, где может соединить конкретность, эмоциональную честность и способность выдерживать сложные внутренние связи. Эта карта не про один простой темперамент: в ней есть потребность в форме, потребность в глубине, потребность в свободе и потребность в надежном контакте.`,
          `Главная зрелая задача - перестать воспринимать внутренние противоречия как доказательство неправильности. Они показывают, что личность устроена объемно. Одна часть хочет безопасности, другая - движения; одна стремится к контролю, другая - к доверию; одна держит форму, другая требует обновления. Сила появляется, когда эти части начинают работать как система.`,
          `В отношениях, работе и личных решениях этому человеку важно выбирать не самый быстрый ответ, а самый честный. Если решение сохраняет тело, ценности, эмоциональную правду и долгосрочную форму, оно будет работать. Если оно держится только на страхе, идеализации или попытке понравиться, карта быстро покажет напряжение.`,
          `Потенциал здесь раскрывается через постепенное строительство жизни, где внутренний мир не вытесняется ради внешнего результата, а внешний результат не разваливается из-за невыраженных чувств. Когда человек учится слышать обе стороны, карта начинает работать как ресурс: дает устойчивость, глубину, способность любить, действовать, меняться и оставаться собой.`,
        ],
      },
    ];
  }

  return [
    {
      title: "Inner Center And Personal Presence",
      paragraphs: [
        `${name} is not described by one simple trait, but by the combination of a stable center, emotional memory and an outer way of acting. ${sun} This is not a label; it shows where the person gathers will, where self-worth is felt, and how the right to exist as oneself is claimed.`,
        `${moon} The emotional layer may work differently from the visible center. Where will wants one thing, safety may need another rhythm: familiarity, control, closeness, distance or confirmation. Character therefore contains several inner requirements that must be coordinated.`,
        ascText || "If birth time is unknown, the outer style should be read carefully: without the Ascendant, body language, first impressions and the way of entering new circumstances cannot be described with precision.",
        `The task of the basic axis is not to choose one part of the personality and suppress the rest, but to learn how to use them in sequence. When will receives form, emotion stops feeling like an obstacle, and outward style becomes a tool rather than a mask.`,
      ],
    },
    {
      title: "Emotional Memory, Intimacy And Inner Ground",
      paragraphs: [
        `Emotional life here is not just mood. It shows how experience is remembered, what feels unsafe to lose, and what kind of inner order is needed. ${moon} Reactions are not random; they protect a need for safety that has its own logic.`,
        `When inner ground is missing, compensation may appear through control, overwork, idealizing relationships or rigid self-discipline. The chart suggests that maturity does not come from suppressing feeling, but from recognizing its factual strength.`,
        `In intimacy there may be a simultaneous need for reliability and fear of too much dependence. The other person needs to respect rhythm, body, habits and boundaries. Relationships become steady when emotions receive regular confirmation through action.`,
        `This layer is crucial for recovery. If it is ignored, life becomes mechanical. If it is given room, the person chooses more gently, returns to the self more quickly, and stops confusing temporary pressure with final truth.`,
      ],
    },
    {
      title: "Thinking, Speech And Understanding",
      paragraphs: [
        `${mercury} Thinking works not only as analysis, but as a way of staying in contact with reality. The person needs to know what is happening, what facts can be trusted, and which words actually change something.`,
        `Speech may therefore be cautious. Before opening up, the person checks whether the listener is reliable, whether the subject is practical, and whether too much honesty will carry a cost. Where trust exists, communication becomes deeper and more useful.`,
        `This mind opens best when ideas can be applied. Abstract thought matters when it becomes a skill, plan, decision, text, system or useful conclusion. Too much unstructured information can create irritation or withdrawal.`,
        `The strength here is the ability to get to the core gradually. Not always quickly, not always loudly, but persistently. Details that others miss can be joined into a practical picture once the thought has time to mature.`,
      ],
    },
    {
      title: "Love, Desire And Partnership Choice",
      paragraphs: [
        `${venus} Love is tied not only to attraction, but to values: what feels beautiful, worthy, desirable and alive. In relationships, the person must not lose contact with desire, because without it intimacy becomes duty.`,
        `${mars} Desire acts as the engine. It shows where the person risks, defends, pursues and meets the world directly. Without an outlet, this energy can become irritation, passive resistance or inner pressure.`,
        `Partnership becomes a field where needs must be named honestly. Too much adaptation removes fire; too much self-assertion can damage trust. The mature path is directness without turning every difference into a power struggle.`,
        `Love requires more than romance. It must survive money, daily life, fatigue, different desires and mismatched timing. When a partner sees the complexity beneath the attractive surface, real intimacy becomes possible.`,
      ],
    },
    {
      title: "Growth, Discipline And Public Direction",
      paragraphs: [
        `${jupiter} This layer shows where expansion, faith and perspective appear. Growth does not always arrive through ease; sometimes it comes through believing in something larger than fear or habit.`,
        `${saturn} The Saturnian layer shows where maturity is required: accepting limits, respecting effort, enduring time and building form. If lived harshly, it becomes self-criticism; if lived well, fear becomes mastery.`,
        mcText || "If the Midheaven is not calculated because birth time is unknown, public direction is better read through planets, aspects and repeated themes rather than a precise career axis.",
        `Realization requires both expansion and discipline. Courage sees possibility; structure holds it. When faith is not separated from work, and work does not kill faith, the person begins to build results with weight.`,
      ],
    },
    {
      title: "Deep Change And Hidden Pressure",
      paragraphs: [
        outer.join(" ") || "The outer planets describe deeper processes: freedom, ideals, crisis, purification and the ability to change at the level of life strategy.",
        `${houseEmphasis(chart, language)}. These house emphases show where life demands participation most often. If several planets gather in one house, that area cannot be treated as secondary.`,
        ...tensionAspects.map((aspect) => aspectSynthesisSentence(aspect, chart, language)),
        `Difficult aspects should not be read as damage. They show places where the psyche cannot remain passive. A new behavior must be learned: not acting automatically, not projecting inner conflict onto others, and not choosing one part of the self against another.`,
      ],
    },
    {
      title: "Talents, Support And Natural Abilities",
      paragraphs: [
        ...supportAspects.map((aspect) => aspectSynthesisSentence(aspect, chart, language)),
        `Supportive aspects do not guarantee results by themselves. They show channels where energy moves more easily, but if they are not used consciously, talent remains background. Sextiles especially ask for action: they open a possibility but do not choose for the person.`,
        `Trines give naturalness and inner permission. Through them the person recovers confidence and does difficult things with more ease. Mature use of a trine means turning ease into skill rather than passive comfort.`,
      ],
    },
    {
      title: "Repeated Character Lines",
      paragraphs: [
        ...topAspects.map((aspect) => aspectSynthesisSentence(aspect, chart, language)),
        `Across the chart, one important theme repeats: stability and change, personal desire and responsibility, inner safety and forward movement need to be coordinated. Tension appears when one side is suppressed; maturity appears when they begin to cooperate.`,
        `Practically, this means not building life only from defense and not chasing change only for the sake of escape. The best path is to create a form that can be renewed. Then stability is not a cage, and development is not chaos.`,
      ],
    },
    {
      title: "Overall Psychological Direction",
      paragraphs: [
        `${name} becomes strongest when concreteness, emotional honesty and the ability to hold complex inner links work together. This chart is not about one simple temperament: it contains a need for form, depth, freedom and reliable contact.`,
        `The main mature task is to stop treating inner contradictions as proof that something is wrong. They show dimensionality. One part needs safety, another needs motion; one seeks control, another asks for trust; one keeps form, another demands renewal.`,
        `In relationships, work and private decisions, the best answer is not always the fastest one, but the most honest one. If a choice preserves the body, values, emotional truth and long-term form, it will hold. If it rests only on fear, idealization or pleasing others, tension will return.`,
        `The potential opens through slowly building a life where the inner world is not sacrificed for external results, and external results are not destroyed by unspoken feeling. When both sides are heard, the chart becomes a resource: steadiness, depth, love, action, change and self-possession can work together.`,
      ],
    },
  ];
}

function renderDetailedPortrait(
  doc: PDFKit.PDFDocument,
  sections: PortraitSection[],
  fonts: { regular: string; bold: string; sans: string; sansBold: string },
): void {
  for (const section of sections) {
    ensureSpace(doc, 120);
    doc
      .font(fonts.bold)
      .fontSize(16)
      .fillColor(DEEP_GOLD)
      .text(section.title, doc.page.margins.left, doc.y, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        lineGap: 2,
      })
      .moveDown(0.45);

    for (const paragraph of section.paragraphs.filter(Boolean)) {
      ensureSpace(doc, 88);
      doc
        .font(fonts.regular)
        .fontSize(10.8)
        .fillColor(TEXT)
        .text(paragraph, doc.page.margins.left, doc.y, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
          lineGap: 4.2,
          align: "left",
        })
        .moveDown(0.8);
    }

    doc.moveDown(0.35);
  }
}

export async function generatePremiumPdf(
  profileName: string,
  markdownContent: string
): Promise<Buffer> {
  const sections: PremiumPdfSection[] = [];
  let currentTitle = "Premium Interpretation";
  let currentBody: string[] = [];

  function flushSection() {
    const body = currentBody.join("\n").trim();
    if (!body) return;
    sections.push({
      title: currentTitle,
      body,
      category: "Premium report",
    });
    currentBody = [];
  }

  for (const line of markdownContent.replace(/\r\n/g, "\n").split("\n")) {
    const heading = line.match(/^#{1,2}\s+(.+)$/);
    if (heading) {
      flushSection();
      currentTitle = heading[1].trim();
      continue;
    }
    currentBody.push(line);
  }
  flushSection();

  return generateInterpretationPdf({
    language: "en",
    title: "AstroWeb Premium Report",
    subtitle: `Prepared for ${profileName}`,
    generatedAt: `Generated ${new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`,
    sections: sections.length > 0
      ? sections
      : [
          {
            title: "Premium Interpretation",
            body: markdownContent,
            category: "Premium report",
          },
        ],
  });
}

export async function generateInterpretationPdf(
  report: PremiumPdfReport,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      let activeTheme: PdfPageTheme = "cover";
      let pageIndex = 0;
      let drawingBackground = false;
      const doc = new PDFDocument({
        size: "LETTER",
        margins: {
          top: 54,
          left: 54,
          right: 54,
          bottom: 78,
        },
        bufferPages: true,
        info: {
          Title: report.title,
          Author: "AstroWeb",
          Subject: "Premium astrological interpretation",
        },
      });
      const buffers: Buffer[] = [];
      const fonts = registerFonts(doc);
      const language = report.language;
      const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      function renderActiveBackground(): void {
        if (drawingBackground) return;
        drawingBackground = true;
        drawPageBackground(doc, activeTheme, pageIndex);
        pageIndex += 1;
        drawingBackground = false;
      }

      function addPage(theme: PdfPageTheme): void {
        activeTheme = theme;
        doc.addPage();
      }

      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));
      doc.on("pageAdded", renderActiveBackground);

      renderActiveBackground();

      drawSketchWheel(doc, PAGE_WIDTH / 2, 282, 138, "#D0B982", 0.42);

      doc
        .font(fonts.bold)
        .fontSize(34)
        .fillColor("#F4D28B")
        .text(report.title, doc.page.margins.left, 122, {
          align: "center",
          width: contentWidth,
          lineGap: 6,
        })
        .moveDown(0.7);

      if (report.subtitle) {
        doc
          .font(fonts.regular)
          .fontSize(14)
          .fillColor("#E7D4B5")
          .text(report.subtitle, {
            align: "center",
            lineGap: 4,
          })
          .moveDown(1.1);
      }

      if (report.generatedAt) {
        doc
          .font(fonts.sans)
          .fontSize(9)
          .fillColor("#BDA787")
          .text(report.generatedAt, { align: "center" });
      }

      doc
        .font(fonts.sans)
        .fontSize(9.5)
        .fillColor("#D7A548")
        .text(
          language === "ru"
            ? "Персональная натальная брошюра AstroWeb"
            : "AstroWeb personal natal booklet",
          doc.page.margins.left,
          642,
          { width: contentWidth, align: "center", characterSpacing: 1.2 },
        );

      addPage("chart");
      renderChapterDivider(
        doc,
        language,
        fonts,
        language === "ru" ? "Карта как цельный рисунок" : "The Chart As One Image",
        language === "ru"
          ? "Сначала смотрим на карту целиком: круг показывает общий порядок, планеты - точки концентрации, дома - жизненные сцены, а линии внутри - связи между ними."
          : "We begin with the whole chart: the wheel shows the order, planets mark concentrations of energy, houses show life scenes, and inner lines show the connections between them.",
        language === "ru" ? "Глава 1" : "Chapter 1",
      );

      addPage("chart");
      addSectionTitle(
        doc,
        fonts,
        language === "ru" ? "Первичная ориентация" : "First Orientation",
        language === "ru" ? "общее направление" : "the whole pattern",
      );
      renderNarrativeText(doc, buildOpeningNarrative(report.profile, report.chart, language), fonts);

      if (report.profile) {
        const profile = report.profile;
        const birthTime =
          profile.timeUnknown || !profile.birthTime
            ? language === "ru"
              ? "неизвестно"
              : "unknown"
            : profile.birthTime;
        const rows: Array<[string, string]> = [
          [language === "ru" ? "Имя" : "Name", profile.name],
          [language === "ru" ? "Дата рождения" : "Birth date", profile.birthDate],
          [language === "ru" ? "Время рождения" : "Birth time", birthTime],
          [language === "ru" ? "Место рождения" : "Birth place", profile.birthPlace],
          [language === "ru" ? "Часовой пояс" : "Timezone", profile.timezone],
          [
            language === "ru" ? "Координаты" : "Coordinates",
            `${profile.lat.toFixed(4)}, ${profile.lng.toFixed(4)}`,
          ],
          [
            language === "ru" ? "Режим карты" : "Chart mode",
            report.isRelocated
              ? language === "ru"
                ? "релокационная карта"
                : "relocated chart"
              : language === "ru"
                ? "натальная карта"
                : "natal chart",
          ],
        ];

        ensureSpace(doc, 210);
        doc.moveDown(0.6);
        renderKeyValueGrid(doc, fonts, rows, doc.page.margins.left, doc.y, contentWidth);
      }

      if (report.chart) {
        addPage("chart");
        addSectionTitle(
          doc,
          fonts,
          language === "ru" ? "Натальная карта" : "Natal Wheel",
          language === "ru" ? "визуальная схема" : "visual map",
        );
        drawNatalChart(doc, report.chart, language, PAGE_WIDTH / 2, 356, 210, fonts);
      }

      if (report.chart) {
        addPage("planets");
        renderChapterDivider(
          doc,
          language,
          fonts,
          language === "ru" ? "Планеты: действующие лица" : "Planets: The Characters",
          language === "ru"
            ? "Планеты показывают, какие функции психики говорят в карте: воля, эмоции, речь, желание, действие, вера, границы и глубокие процессы."
            : "Planets show which functions of the psyche are speaking in the chart: will, emotion, speech, desire, action, faith, boundaries and deeper processes.",
          language === "ru" ? "Глава 2" : "Chapter 2",
        );

        addPage("planets");
        addSectionTitle(
          doc,
          fonts,
          language === "ru" ? "Положения планет" : "Planet Positions",
          language === "ru" ? "персонажи истории" : "the characters",
        );
        renderNarrativeText(doc, buildBridge("chart", language), fonts);
        renderTable(
          doc,
          fonts,
          [
            language === "ru" ? "Планета" : "Planet",
            language === "ru" ? "Положение" : "Position",
            language === "ru" ? "Дом" : "House",
            language === "ru" ? "Ключ" : "Keyword",
          ],
          report.chart.points.map((point) => [
            labelFor(BODY_LABELS, point.body, language),
            `${formatDegreeInSign(point.degreeInSign)} ${labelFor(SIGN_LABELS, point.sign, language)}`,
            point.house === null ? "-" : String(point.house),
            BODY_MEANINGS[point.body]?.[language] ?? point.body,
          ]),
          [74, 122, 48, 258],
        );
        if (report.aiNarrative?.planets) {
          renderParagraph(doc, report.aiNarrative.planets, fonts);
        } else {
          renderPlanetNotes(doc, report.chart, language, fonts);
        }

        addPage("houses");
        renderChapterDivider(
          doc,
          language,
          fonts,
          language === "ru" ? "Дома: сферы опыта" : "Houses: Areas Of Experience",
          language === "ru"
            ? "После планет важно понять, где именно раскрывается каждая тема. Дома превращают психологические функции в конкретные области опыта."
            : "After the planets, we need to know where each theme unfolds. Houses turn psychological functions into concrete areas of experience.",
          language === "ru" ? "Глава 3" : "Chapter 3",
        );

        addPage("houses");
        addSectionTitle(
          doc,
          fonts,
          language === "ru" ? "Куспиды домов" : "House Cusps",
          language === "ru" ? "сцены и обстоятельства" : "scenes and circumstances",
        );
        renderNarrativeText(doc, buildBridge("planets", language), fonts);
        if (report.chart.houses.asc === null || report.profile?.timeUnknown) {
          renderNarrativeText(
            doc,
            language === "ru"
              ? "Время рождения не указано, поэтому дома, Асцендент и Середина неба нельзя трактовать с полной надежностью. Планеты и аспекты остаются значимыми, но темы домов лучше читать осторожно."
              : "Birth time is unknown, so houses, Ascendant and Midheaven cannot be interpreted with full reliability. Planets and aspects remain meaningful, but house topics should be read carefully.",
            fonts,
          );
        } else {
          renderTable(
            doc,
            fonts,
            [
              language === "ru" ? "Дом" : "House",
              language === "ru" ? "Куспид" : "Cusp",
              language === "ru" ? "Тема" : "Theme",
            ],
            report.chart.houses.cusps.map((cusp, index) => [
              String(index + 1),
              formatLongitude(cusp, language),
              HOUSE_TOPICS[index + 1]?.[language] ?? "",
            ]),
            [54, 150, 298],
          );
        }

        if (report.aiNarrative?.houses) {
          renderParagraph(doc, report.aiNarrative.houses, fonts);
        } else if (report.chart.houses.asc !== null && !report.profile?.timeUnknown) {
          renderHouseNarratives(doc, report.chart, language, fonts);
        }

        addPage("aspects");
        renderChapterDivider(
          doc,
          language,
          fonts,
          language === "ru" ? "Аспекты: связи карты" : "Aspects: Chart Dynamics",
          language === "ru"
            ? "Теперь видны планеты и дома. Аспекты показывают, где энергии поддерживают друг друга, где спорят, где усиливаются и где требуют осознанной работы."
            : "Now the planets and houses are visible. Aspects show where energies support one another, where they clash, where they amplify, and where conscious work is required.",
          language === "ru" ? "Глава 4" : "Chapter 4",
        );

        addPage("aspects");
        addSectionTitle(
          doc,
          fonts,
          language === "ru" ? "Все мажорные аспекты" : "All Major Aspects",
          language === "ru" ? "напряжения и таланты" : "tensions and talents",
        );
        renderNarrativeText(doc, buildBridge("houses", language), fonts);
        renderTable(
          doc,
          fonts,
          [
            language === "ru" ? "Аспект" : "Aspect",
            language === "ru" ? "Тип" : "Type",
            language === "ru" ? "Орб" : "Orb",
            language === "ru" ? "Точность" : "Exactness",
          ],
          report.chart.aspects.map((aspect) => [
            `${labelFor(BODY_LABELS, aspect.a, language)} - ${labelFor(BODY_LABELS, aspect.b, language)}`,
            ASPECT_LABELS[aspect.type][language],
            `${aspect.orb.toFixed(2)}°`,
            `${Math.round(aspect.exactness * 100)}%`,
          ]),
          [202, 124, 70, 106],
        );
        if (report.aiNarrative?.aspects) {
          renderParagraph(doc, report.aiNarrative.aspects, fonts);
        } else {
          renderAspectNarratives(doc, report.chart, language, fonts);
        }
      }

      addPage("portrait");
      renderChapterDivider(
        doc,
        language,
        fonts,
        language === "ru" ? "Психологический портрет" : "Psychological Portrait",
        language === "ru"
          ? "Здесь технические элементы карты собраны в цельное описание характера, отношений, эмоциональных реакций, сильных сторон и внутренних задач."
          : "Here the technical factors of the chart are gathered into a full description of character, relationships, emotional reactions, strengths and inner tasks.",
        language === "ru" ? "Глава 5" : "Chapter 5",
      );

      addPage("portrait");
      addSectionTitle(
        doc,
        fonts,
        language === "ru" ? "Подробный портрет" : "Detailed Portrait",
        language === "ru" ? "синтез карты" : "chart synthesis",
      );
      renderNarrativeText(doc, buildBridge("aspects", language), fonts);
      if (report.aiNarrative?.portrait) {
        renderParagraph(doc, report.aiNarrative.portrait, fonts);
      } else {
        renderDetailedPortrait(
          doc,
          buildDetailedPortrait(report.profile, report.chart, language),
          fonts,
        );
      }

      addPage("cover");
      doc
        .font(fonts.bold)
        .fontSize(26)
        .fillColor("#F4D28B")
        .text(language === "ru" ? "Итог" : "Closing", doc.page.margins.left, 214, {
          width: contentWidth,
          align: "center",
        })
        .moveDown(1.2)
        .font(fonts.regular)
        .fontSize(12)
        .fillColor("#E7D4B5")
        .text(
          language === "ru"
            ? "Карта не является набором случайных признаков. Это связная система: планеты показывают силы, дома - области жизни, аспекты - связи между ними, а синтез помогает увидеть цельный психологический портрет."
            : "A chart is not a list of random traits. It is a connected system: planets show forces, houses show life areas, aspects show connections between them, and synthesis helps reveal an integrated psychological portrait.",
          {
            width: contentWidth - 60,
            align: "center",
            lineGap: 5,
          },
        );

      renderFooter(doc, fonts);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
