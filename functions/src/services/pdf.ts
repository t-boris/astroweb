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

export interface PremiumPdfReport {
  title: string;
  subtitle?: string;
  generatedAt?: string;
  language: "en" | "ru";
  sections: PremiumPdfSection[];
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
const PAGE_BACKGROUND_RENDERERS = new WeakMap<PDFKit.PDFDocument, () => void>();

type PdfLanguage = "en" | "ru";
type PdfPageTheme = "cover" | "chart" | "planets" | "houses" | "aspects" | "story";

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
  story: {
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
    PAGE_BACKGROUND_RENDERERS.get(doc)?.();
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
    const footerY = doc.page.height - doc.page.margins.bottom - 14;
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
  }
}

function labelFor(
  labels: Record<string, Record<PdfLanguage, string>>,
  key: string,
  language: PdfLanguage,
): string {
  return labels[key]?.[language] ?? key;
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
    drawDecorativeWheel(doc, PAGE_WIDTH - 92, 132, 112);
  } else if (themeName === "planets") {
    for (let index = 0; index < 6; index += 1) {
      doc
        .circle(PAGE_WIDTH - 86, 94 + index * 24, 7 + index * 2)
        .stroke();
    }
  } else if (themeName === "houses") {
    for (let index = 0; index < 12; index += 1) {
      const angle = ((index * 30 - 90) * Math.PI) / 180;
      doc
        .moveTo(58, PAGE_HEIGHT - 112)
        .lineTo(58 + Math.cos(angle) * 92, PAGE_HEIGHT - 112 + Math.sin(angle) * 92)
        .stroke();
    }
    doc.circle(58, PAGE_HEIGHT - 112, 92).stroke();
  } else if (themeName === "aspects") {
    const points = [
      [PAGE_WIDTH - 170, 86],
      [PAGE_WIDTH - 66, 128],
      [PAGE_WIDTH - 122, 205],
      [PAGE_WIDTH - 202, 176],
      [PAGE_WIDTH - 220, 112],
    ];
    points.forEach(([x, y], index) => {
      const next = points[(index + 2) % points.length];
      doc.moveTo(x, y).lineTo(next[0], next[1]).stroke();
      doc.circle(x, y, 4).stroke();
    });
  } else {
    for (let index = 0; index < 5; index += 1) {
      doc
        .moveTo(42 + index * 18, 78)
        .bezierCurveTo(96, 44 + index * 19, 124, 128 + index * 6, 190, 66 + index * 24)
        .stroke();
    }
  }

  doc.restore();

  doc
    .save()
    .fontSize(8)
    .fillColor(theme.accent)
    .opacity(0.55)
    .text(String(pageNumber + 1).padStart(2, "0"), PAGE_WIDTH - 76, PAGE_HEIGHT - 68, {
      width: 36,
      align: "right",
      lineBreak: false,
    })
    .restore();
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
    ensureSpace(doc, 58);
    const body = labelFor(BODY_LABELS, point.body, language);
    const placement = formatPointPlacement(point, language);
    const meaning = BODY_MEANINGS[point.body]?.[language] ?? point.body;
    const sentence =
      language === "ru"
        ? `${body} показывает ${meaning}. Его положение (${placement}) описывает, через какой темперамент и сферу жизни эта функция проявляется заметнее всего.`
        : `${body} describes ${meaning}. Its placement (${placement}) shows the temperament and life area through which this function is most visible.`;

    doc
      .font(fonts.sansBold)
      .fontSize(10.5)
      .fillColor(DEEP_GOLD)
      .text(`${body}: ${placement}`, doc.page.margins.left, doc.y)
      .moveDown(0.2)
      .font(fonts.regular)
      .fontSize(10)
      .fillColor(TEXT)
      .text(sentence, doc.page.margins.left, doc.y, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        lineGap: 3,
      })
      .moveDown(0.7);
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

  doc
    .moveDown(1.8)
    .font(fonts.sans)
    .fontSize(9.5)
    .fillColor(MUTED)
    .text(
      language === "ru"
        ? "Следующий раздел продолжает общий рассказ: мы не читаем элементы карты изолированно, а смотрим, как один слой объясняет и уточняет другой."
        : "The next section continues the same story: the chart is not read as isolated fragments, but as layers that explain and refine each other.",
      {
        width: 410,
        lineGap: 4,
      },
    );
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
      ? "Этот отчет начинается с общей схемы карты, а затем постепенно переходит к планетам, домам и аспектам. Так рождается связная история: что в человеке является центром, где это проявляется и какие внутренние диалоги создают движение."
      : "This report starts with the whole chart, then moves through planets, houses and aspects. The result is a single story: what forms the center of the person, where it expresses itself, and which inner dialogues create movement.";
  }

  const sun = chart.points.find((point) => point.body === "Sun");
  const moon = chart.points.find((point) => point.body === "Moon");
  const asc =
    chart.houses.asc === null
      ? null
      : formatLongitude(chart.houses.asc, language);

  if (language === "ru") {
    return `Карта ${profile.name} читается как история о том, как внутренняя воля, эмоциональная природа и жизненные обстоятельства собираются в одну систему. Солнце ${sun ? `находится в ${formatPointPlacement(sun, language)}` : "задает центральный мотив"}, Луна ${moon ? `стоит в ${formatPointPlacement(moon, language)}` : "показывает эмоциональный ритм"}${asc ? `, а Асцендент расположен в ${asc}` : ""}. Эти три точки задают начало рассказа: кто действует, что ему нужно внутри и через какую дверь он входит в мир.\n\nДальше отчет движется слоями. Сначала мы смотрим на саму карту как на рисунок, затем на планеты как на действующих персонажей, после этого на дома как на сцены жизни, и только потом на аспекты - линии напряжения, поддержки и выбора между персонажами. Такой порядок важен: аспект не существует сам по себе, он связывает уже описанные силы.`;
  }

  return `${profile.name}'s chart reads as a story about how will, emotional nature and life circumstances assemble into one system. The Sun ${sun ? `is placed at ${formatPointPlacement(sun, language)}` : "sets the central motive"}, the Moon ${moon ? `stands at ${formatPointPlacement(moon, language)}` : "shows the emotional rhythm"}${asc ? `, and the Ascendant is at ${asc}` : ""}. These three points begin the narrative: who acts, what is needed inside, and through which doorway the person enters the world.\n\nThe report then moves layer by layer. First comes the chart as an image, then the planets as characters, then the houses as life scenes, and only after that the aspects - the lines of tension, support and choice between those characters. This order matters: an aspect never lives alone; it connects forces already described.`;
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
      en: "Once the actors are known, the houses give them a stage. A planet is never abstract: the house shows the concrete area of life where its story asks to be lived.",
      ru: "Когда действующие лица названы, дома дают им сцену. Планета не бывает абстрактной: дом показывает конкретную область жизни, где ее сюжет просит быть прожитым.",
    },
    houses: {
      en: "The planets and houses describe the cast and scenery. The aspects describe the plot: where the energies cooperate, resist, amplify or challenge each other.",
      ru: "Планеты и дома описали персонажей и декорации. Аспекты описывают сюжет: где энергии сотрудничают, сопротивляются, усиливают или испытывают друг друга.",
    },
    aspects: {
      en: "After the mechanics of the chart are clear, the interpretation can read more like a continuous biography of the inner life.",
      ru: "Когда механика карты стала понятной, интерпретацию можно читать уже как цельную биографию внутренней жизни.",
    },
  };

  return bridges[from][language];
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
      const doc = new PDFDocument({
        size: "LETTER",
        margin: 54,
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

      function addPage(theme: PdfPageTheme): void {
        activeTheme = theme;
        doc.addPage();
        drawPageBackground(doc, activeTheme, pageIndex);
        pageIndex += 1;
      }

      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      PAGE_BACKGROUND_RENDERERS.set(doc, () => {
        drawPageBackground(doc, activeTheme, pageIndex);
        pageIndex += 1;
      });

      drawPageBackground(doc, "cover", pageIndex);
      pageIndex += 1;

      drawDecorativeWheel(doc, PAGE_WIDTH / 2, 282, 138);

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
        language === "ru" ? "Вступление" : "Opening Narrative",
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
        renderPlanetNotes(doc, report.chart, language, fonts);

        addPage("houses");
        renderChapterDivider(
          doc,
          language,
          fonts,
          language === "ru" ? "Дома: сцены жизни" : "Houses: The Life Stages",
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

        addPage("aspects");
        renderChapterDivider(
          doc,
          language,
          fonts,
          language === "ru" ? "Аспекты: сюжетные линии" : "Aspects: The Plot Lines",
          language === "ru"
            ? "Теперь персонажи и сцены известны. Аспекты показывают сам сюжет: где энергия течет легко, где требует труда, а где создает внутренний диалог."
            : "Now the characters and scenes are known. Aspects show the plot itself: where energy flows easily, where it requires work, and where it creates inner dialogue.",
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
        renderAspectNarratives(doc, report.chart, language, fonts);
      }

      addPage("story");
      renderChapterDivider(
        doc,
        language,
        fonts,
        language === "ru" ? "Интерпретация как рассказ" : "Interpretation As A Story",
        language === "ru"
          ? "Последний раздел соединяет технику карты с живым текстом. Здесь отдельные указания складываются в последовательное описание характера и внутренних задач."
          : "The final section joins chart technique with living text. Here the separate indications become a continuous description of character and inner tasks.",
        language === "ru" ? "Глава 5" : "Chapter 5",
      );

      addPage("story");
      addSectionTitle(
        doc,
        fonts,
        language === "ru" ? "Главные интерпретации" : "Core Interpretations",
        language === "ru" ? "связный разбор" : "connected reading",
      );
      renderNarrativeText(doc, buildBridge("aspects", language), fonts);

      for (const [index, section] of report.sections.entries()) {
        if (index > 0) {
          const bridge =
            language === "ru"
              ? "Этот мотив продолжает предыдущий: он показывает еще один слой той же карты и уточняет, как центральная тема проявляется в другой функции."
              : "This theme continues the previous one: it adds another layer of the same chart and clarifies how the central pattern expresses itself through another function.";
          renderNarrativeText(doc, bridge, fonts);
        }

        ensureSpace(doc, 124);

        if (section.category) {
          doc
            .font(fonts.sansBold)
            .fontSize(8.5)
            .fillColor(MUTED)
            .text(section.category.toUpperCase(), {
              characterSpacing: 0.8,
            })
            .moveDown(0.2);
        }

        doc
          .font(fonts.bold)
          .fontSize(17)
          .fillColor(DEEP_GOLD)
          .text(section.title, {
            lineGap: 2,
          })
          .moveDown(0.3);

        if (section.detail) {
          doc
            .font(fonts.sans)
            .fontSize(9.5)
            .fillColor(MUTED)
            .text(section.detail, {
              lineGap: 2,
            })
            .moveDown(0.5);
        }

        renderParagraph(doc, section.body, fonts);
      }

      doc
        .addPage();
      activeTheme = "cover";
      drawPageBackground(doc, "cover", pageIndex);
      pageIndex += 1;
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
            ? "Карта не является набором случайных признаков. Это связная система: планеты показывают силы, дома - области жизни, аспекты - сюжетные связи, а интерпретация собирает их в человеческую историю."
            : "A chart is not a list of random traits. It is a connected system: planets show forces, houses show life areas, aspects show plot lines, and interpretation gathers them into a human story.",
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
