import { type ReactElement, type ReactNode } from "react";

/**
 * Shared renderer for AI-generated reading text (oracle answers, deep dives,
 * forecasts, relationship readings). Renders a safe subset of Markdown —
 * headings, bold, lists, tables, code, rules — with mobile-friendly, calm
 * reading typography. Used everywhere so every AI surface reads the same.
 */

function isListLine(line: string): boolean {
  const trimmed = line.trim();
  return /^(-|\*|\d+\.)\s+/.test(trimmed);
}

function isHeadingLine(line: string): boolean {
  return /^#{1,6}\s+/.test(line.trim());
}

function isFenceLine(line: string): boolean {
  return line.trim().startsWith("```");
}

function isRuleLine(line: string): boolean {
  return /^---+$/.test(line.trim());
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  const cells = splitTableRow(trimmed);
  return cells.length >= 2 && cells.some((cell) => cell.length > 0);
}

function isTableSeparatorLine(line: string): boolean {
  const cells = splitTableRow(line.trim());
  if (cells.length < 2) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function isSpecialLine(line: string): boolean {
  return (
    isHeadingLine(line) ||
    isListLine(line) ||
    isFenceLine(line) ||
    isRuleLine(line) ||
    isTableLine(line) ||
    isTableSeparatorLine(line)
  );
}

/** Render inline `**bold**` / `__bold__` markers within a line of text. */
export function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const boldPattern = /(\*\*[^*]+?\*\*|__[^_]+?__)/g;
  let lastIndex = 0;
  let keyIndex = 0;

  for (const match of text.matchAll(boldPattern)) {
    const full = match[0];
    const start = match.index ?? 0;

    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }

    const content = full.slice(2, -2).trim();
    if (content.length > 0) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${keyIndex}`} className="font-semibold text-foreground">
          {content}
        </strong>,
      );
      keyIndex += 1;
    } else {
      nodes.push(full);
    }

    lastIndex = start + full.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

export function AiReading({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactElement[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const current = lines[index];
    const trimmed = current.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (isFenceLine(current)) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !isFenceLine(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length && isFenceLine(lines[index])) {
        index += 1;
      }
      blocks.push(
        <pre
          key={`code-${key}`}
          className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre"
        >
          {codeLines.join("\n")}
        </pre>,
      );
      key += 1;
      continue;
    }

    if (isRuleLine(current)) {
      blocks.push(<hr key={`hr-${key}`} className="border-border/60" />);
      key += 1;
      index += 1;
      continue;
    }

    if (isHeadingLine(current)) {
      const match = current.trim().match(/^(#{1,6})\s+(.+)$/);
      const level = match?.[1].length ?? 3;
      const title = match?.[2] ?? current.trim();
      const className =
        level <= 2
          ? "pt-1 font-serif text-base font-semibold text-[#8fb6ff] sm:text-lg"
          : "pt-0.5 text-sm font-semibold text-[#8fb6ff]";

      blocks.push(
        <h4 key={`h-${key}`} className={className}>
          {renderInlineMarkdown(title, `h-${key}`)}
        </h4>,
      );
      key += 1;
      index += 1;
      continue;
    }

    if (isListLine(current)) {
      const items: string[] = [];
      while (index < lines.length && isListLine(lines[index])) {
        items.push(lines[index].trim().replace(/^(-|\*|\d+\.)\s+/, ""));
        index += 1;
      }

      blocks.push(
        <ul key={`ul-${key}`} className="list-disc space-y-1.5 pl-5 marker:text-[#8fb6ff]/70">
          {items.map((item, i) => (
            <li key={`li-${key}-${i}`} className="text-[15px] leading-relaxed text-muted-foreground">
              {renderInlineMarkdown(item, `li-${key}-${i}`)}
            </li>
          ))}
        </ul>,
      );
      key += 1;
      continue;
    }

    if (
      isTableLine(current) &&
      index + 1 < lines.length &&
      isTableSeparatorLine(lines[index + 1])
    ) {
      const headers = splitTableRow(current);
      const rows: string[][] = [];
      index += 2;

      while (
        index < lines.length &&
        isTableLine(lines[index]) &&
        !isTableSeparatorLine(lines[index])
      ) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }

      blocks.push(
        <div key={`table-${key}`} className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {headers.map((header, i) => (
                  <th
                    key={`th-${key}-${i}`}
                    className="border border-border/70 px-2 py-1 text-left font-semibold"
                  >
                    {renderInlineMarkdown(header, `th-${key}-${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`tr-${key}-${rowIndex}`}>
                  {headers.map((_, colIndex) => (
                    <td
                      key={`td-${key}-${rowIndex}-${colIndex}`}
                      className="border border-border/60 px-2 py-1 align-top"
                    >
                      {renderInlineMarkdown(row[colIndex] ?? "", `td-${key}-${rowIndex}-${colIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      key += 1;
      continue;
    }

    const paragraph: string[] = [trimmed];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || isSpecialLine(lines[index])) {
        break;
      }
      paragraph.push(next);
      index += 1;
    }

    blocks.push(
      <p key={`p-${key}`} className="text-[15px] leading-relaxed text-muted-foreground">
        {renderInlineMarkdown(paragraph.join(" "), `p-${key}`)}
      </p>,
    );
    key += 1;
  }

  return <div className="space-y-3">{blocks}</div>;
}
