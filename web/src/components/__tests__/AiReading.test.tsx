import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AiReading } from "@/components/AiReading";

describe("AiReading markdown formatting", () => {
  it("formats headings, bold spans, and bullet lists from letter answers without raw markdown markers", () => {
    const sample = [
      "### Вывод",
      "",
      "Твоей карте нужно **регулярное действие в гибком режиме**.",
      "",
      "### Логика карты",
      "",
      "- **Марс во Льве в 1-м доме.** Марс отвечает за энергию.",
      "- **Солнце в трине к Марсу.** Энергия идёт сама.",
    ].join("\n");

    const html = renderToStaticMarkup(<AiReading text={sample} />);

    expect(html).toContain("<h4");
    expect(html).toContain(">Вывод</h4>");
    expect(html).toContain(">Логика карты</h4>");
    expect(html).toContain("<strong");
    expect(html).toContain("регулярное действие в гибком режиме</strong>");
    expect(html).toContain("<ul");
    expect(html).toContain("Марс во Льве в 1-м доме.</strong> Марс отвечает за энергию.");
    expect(html).not.toContain("###");
    expect(html).not.toContain("**");
  });
});

describe("LettersInbox answer rendering", () => {
  it("renders ask-in-letter replies through AiReading instead of raw whitespace-pre-wrap text", () => {
    const source = readFileSync(resolve(__dirname, "../LettersInbox.tsx"), "utf-8");
    expect(source).toContain("<AiReading text={cleanAiArtifacts(answer)} />");
    expect(source).not.toContain("whitespace-pre-wrap");
  });
});
