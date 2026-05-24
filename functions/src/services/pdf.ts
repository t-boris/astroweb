import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

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
}

const GOLD = "#B9862C";
const TEXT = "#24201B";
const MUTED = "#6E6257";
const BORDER = "#E3D4B8";

function getFontPath(fileName: string): string | null {
  const fontPath = path.resolve(__dirname, "../../assets/fonts", fileName);
  return fs.existsSync(fontPath) ? fontPath : null;
}

function registerFonts(doc: PDFKit.PDFDocument): {
  regular: string;
  bold: string;
} {
  const regularPath = getFontPath("NotoSans-Regular.ttf");
  const boldPath = getFontPath("NotoSans-Bold.ttf");

  if (regularPath) {
    doc.registerFont("NotoSans", regularPath);
  }
  if (boldPath) {
    doc.registerFont("NotoSans-Bold", boldPath);
  }

  return {
    regular: regularPath ? "NotoSans" : "Helvetica",
    bold: boldPath ? "NotoSans-Bold" : "Helvetica-Bold",
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
  fonts: { regular: string; bold: string },
): void {
  const range = doc.bufferedPageRange();

  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);

    const pageNumber = pageIndex + 1;
    const footerY = doc.page.height - 34;
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
        },
      );
  }
}

export async function generatePremiumPdf(
  profileName: string,
  markdownContent: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      // Title Page
      doc
        .font("Helvetica-Bold")
        .fontSize(28)
        .fillColor("#D4A04A")
        .text("AstroWeb Premium Report", { align: "center" })
        .moveDown();

      doc
        .fontSize(20)
        .fillColor("#333333")
        .text(`Prepared for: ${profileName}`, { align: "center" })
        .moveDown(3);

      doc
        .fontSize(12)
        .fillColor("#666666")
        .text("Your cosmic blueprint and deeper psychological analysis.", { align: "center" });

      doc.addPage();

      // Basic markdown parsing for the PDF
      // A full implementation would use a markdown-to-pdf library or parse tokens.
      // Here we simulate parsing by splitting by newlines and looking for headers.
      doc.fillColor("#000000");
      const lines = markdownContent.split("\n");

      for (const line of lines) {
        if (line.startsWith("### ")) {
          doc.moveDown().font("Helvetica-Bold").fontSize(14).text(line.replace("### ", ""));
        } else if (line.startsWith("## ")) {
          doc.moveDown(1.5).font("Helvetica-Bold").fontSize(18).fillColor("#D4A04A").text(line.replace("## ", "")).fillColor("#000000");
        } else if (line.startsWith("# ")) {
          doc.addPage().font("Helvetica-Bold").fontSize(22).fillColor("#D4A04A").text(line.replace("# ", "")).fillColor("#000000");
        } else if (line.trim() !== "") {
          doc.font("Helvetica").fontSize(11).text(line, { align: "justify" }).moveDown(0.5);
        }
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

export async function generateInterpretationPdf(
  report: PremiumPdfReport,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
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

      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      doc
        .rect(0, 0, doc.page.width, doc.page.height)
        .fill("#FBF6ED");

      doc
        .font(fonts.bold)
        .fontSize(28)
        .fillColor(GOLD)
        .text(report.title, {
          align: "center",
          lineGap: 6,
        })
        .moveDown(0.75);

      if (report.subtitle) {
        doc
          .font(fonts.regular)
          .fontSize(13)
          .fillColor(MUTED)
          .text(report.subtitle, {
            align: "center",
            lineGap: 4,
          })
          .moveDown(0.8);
      }

      if (report.generatedAt) {
        doc
          .font(fonts.regular)
          .fontSize(9)
          .fillColor(MUTED)
          .text(report.generatedAt, { align: "center" });
      }

      doc
        .moveDown(2)
        .strokeColor(BORDER)
        .lineWidth(1)
        .moveTo(doc.page.margins.left + 30, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right - 30, doc.y)
        .stroke()
        .moveDown(2);

      const intro =
        report.language === "ru"
          ? "Этот PDF содержит персональные интерпретации, доступные после покупки премиум-доступа."
          : "This PDF contains the personal interpretations unlocked with your premium access.";

      doc
        .font(fonts.regular)
        .fontSize(11)
        .fillColor(TEXT)
        .text(intro, {
          align: "center",
          lineGap: 4,
        });

      doc.addPage();

      for (const [index, section] of report.sections.entries()) {
        if (index > 0) {
          doc.moveDown(0.8);
        }

        ensureSpace(doc, 120);

        if (section.category) {
          doc
            .font(fonts.bold)
            .fontSize(8.5)
            .fillColor(MUTED)
            .text(section.category.toUpperCase(), {
              characterSpacing: 0.8,
            })
            .moveDown(0.2);
        }

        doc
          .font(fonts.bold)
          .fontSize(15)
          .fillColor(GOLD)
          .text(section.title, {
            lineGap: 2,
          })
          .moveDown(0.25);

        if (section.detail) {
          doc
            .font(fonts.regular)
            .fontSize(9.5)
            .fillColor(MUTED)
            .text(section.detail, {
              lineGap: 2,
            })
            .moveDown(0.5);
        }

        renderParagraph(doc, section.body, fonts);
      }

      renderFooter(doc, fonts);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
