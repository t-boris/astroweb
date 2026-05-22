import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FirebaseError } from "firebase/app";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import {
  generateInterpretations,
  type InterpretationBlock,
} from "@/data/interpretations";
import {
  PLANET_GLYPHS,
  ASPECT_GLYPHS,
  ELEMENT_COLORS,
  ASPECT_COLORS,
} from "@/components/chart/utils/constants";
import { deepenInterpretation, askOracle } from "@/api/ai";
import { Button } from "@/components/ui/button";
import type { ChartResult } from "@/types";

interface InterpretationViewProps {
  chart: ChartResult;
  profileId: string;
  ownerDeviceId: string;
  oracleCredits: number;
  hasPremiumPdf: boolean;
  onPurchasePremium?: () => void;
  relocationLat?: number | null;
  relocationLng?: number | null;
}

interface OracleEntry {
  question: string;
  answer: string;
  model: string;
  askedAt: string;
}

interface InterpretationAiState {
  deepTexts: Record<string, string>;
  oracleHistory: OracleEntry[];
}

function cleanAiArtifacts(input: string): string {
  const filteredLines = input
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => {
      const normalized = line.trim().toLowerCase();
      return !(
        normalized.startsWith("of fragment to start from") ||
        normalized.startsWith("*continuation:*") ||
        normalized.startsWith("last generated fragment:") ||
        normalized.startsWith("continue the same answer")
      );
    });

  return filteredLines
    .join("\n")
    .replace(/\*Continuation:\*\s*/gi, "")
    .replace(/\[END_OF_REPORT\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
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
        <strong key={`${keyPrefix}-b-${keyIndex}`}>
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

function AiFormattedText({ text }: { text: string }) {
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
          className="rounded-md border bg-muted/40 p-3 overflow-x-auto whitespace-pre font-mono text-xs leading-relaxed"
        >
          {codeLines.join("\n")}
        </pre>,
      );
      key += 1;
      continue;
    }

    if (isRuleLine(current)) {
      blocks.push(<hr key={`hr-${key}`} className="border-border" />);
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
          ? "text-base font-semibold"
          : "text-sm font-semibold";

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
        <ul key={`ul-${key}`} className="list-disc pl-5 space-y-1">
          {items.map((item, i) => (
            <li key={`li-${key}-${i}`} className="text-sm leading-relaxed">
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
      <p key={`p-${key}`} className="text-sm leading-relaxed whitespace-pre-wrap">
        {renderInlineMarkdown(paragraph.join(" "), `p-${key}`)}
      </p>,
    );
    key += 1;
  }

  return <div className="space-y-3">{blocks}</div>;
}

function getAiStorageKey(profileId: string): string {
  return `astroweb:ai:v4:${profileId}`;
}

function getOracleEntryKey(entry: OracleEntry): string {
  return `${entry.askedAt}-${entry.question}`;
}

function getSingleLinePreview(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function readStoredAiState(profileId: string): InterpretationAiState {
  try {
    const raw = localStorage.getItem(getAiStorageKey(profileId));
    if (!raw) {
      return { deepTexts: {}, oracleHistory: [] };
    }

    const parsed = JSON.parse(raw) as Partial<InterpretationAiState>;
    return {
      deepTexts:
        parsed.deepTexts && typeof parsed.deepTexts === "object"
          ? Object.fromEntries(
              Object.entries(parsed.deepTexts).map(([key, value]) => [
                key,
                typeof value === "string" ? cleanAiArtifacts(value) : "",
              ]),
            )
          : {},
      oracleHistory: Array.isArray(parsed.oracleHistory)
        ? parsed.oracleHistory
            .filter(
              (item): item is OracleEntry =>
                typeof item?.question === "string" &&
                typeof item?.answer === "string" &&
                typeof item?.model === "string" &&
                typeof item?.askedAt === "string",
            )
            .map((item) => ({
              ...item,
              answer: cleanAiArtifacts(item.answer),
            }))
        : [],
    };
  } catch {
    return { deepTexts: {}, oracleHistory: [] };
  }
}

function writeStoredAiState(profileId: string, state: InterpretationAiState): void {
  try {
    localStorage.setItem(getAiStorageKey(profileId), JSON.stringify(state));
  } catch {
    // Ignore quota/storage errors.
  }
}

function getBlockColor(block: InterpretationBlock): string {
  if (block.category === "aspect") {
    return ASPECT_COLORS[block.tags[0]] ?? "#888";
  }
  // For sign categories, first tag is the element
  const element = block.tags[0] as keyof typeof ELEMENT_COLORS;
  return ELEMENT_COLORS[element]?.stroke ?? "#888";
}

function getBlockInstanceKey(block: InterpretationBlock): string {
  if (block.aspect) {
    return `${block.key}-${block.aspect.a}-${block.aspect.b}-${block.aspect.type}`;
  }
  return block.key;
}

export function InterpretationView({
  chart,
  profileId,
  ownerDeviceId,
  oracleCredits,
  hasPremiumPdf,
  onPurchasePremium,
  relocationLat,
  relocationLng,
}: InterpretationViewProps) {
  const { t, i18n } = useTranslation();
  const blocks = useMemo(() => generateInterpretations(chart), [chart]);
  const language = i18n.resolvedLanguage?.startsWith("ru") ? "ru" : "en";

  const [deepLoadingKey, setDeepLoadingKey] = useState<string | null>(null);
  const [deepTexts, setDeepTexts] = useState<Record<string, string>>({});
  const [deepErrors, setDeepErrors] = useState<Record<string, string>>({});
  const [oracleQuestion, setOracleQuestion] = useState("");
  const [oracleAnswer, setOracleAnswer] = useState<string | null>(null);
  const [oracleModel, setOracleModel] = useState<string | null>(null);
  const [oracleHistory, setOracleHistory] = useState<OracleEntry[]>([]);
  const [currentOracleEntryKey, setCurrentOracleEntryKey] = useState<string | null>(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleError, setOracleError] = useState<string | null>(null);
  const [collapsedDeepDive, setCollapsedDeepDive] = useState<Record<string, boolean>>({});
  const [collapsedOracleAnswers, setCollapsedOracleAnswers] = useState<Record<string, boolean>>({});
  const [currentOracleCollapsed, setCurrentOracleCollapsed] = useState(false);

  const signBlocks = blocks.filter((b) => b.category !== "aspect");
  const aspectBlocks = blocks.filter((b) => b.category === "aspect");
  const oracleHistoryWithoutCurrent = oracleAnswer
    ? oracleHistory.slice(1)
    : oracleHistory;

  useEffect(() => {
    const stored = readStoredAiState(profileId);
    setDeepTexts(stored.deepTexts);
    setOracleHistory(stored.oracleHistory);
    setOracleAnswer(null);
    setOracleModel(null);
    setCurrentOracleEntryKey(null);
    setCollapsedDeepDive({});
    setCurrentOracleCollapsed(false);
    setCollapsedOracleAnswers(
      Object.fromEntries(stored.oracleHistory.map((entry) => [getOracleEntryKey(entry), true])),
    );
  }, [profileId]);

  useEffect(() => {
    writeStoredAiState(profileId, { deepTexts, oracleHistory });
  }, [profileId, deepTexts, oracleHistory]);

  async function handleDeepDive(block: InterpretationBlock) {
    const blockId = getBlockInstanceKey(block);
    const title = t(`${block.key}.title`);
    const text = t(`${block.key}.text`);

    const focusTopic = block.aspect
      ? `${title}: ${block.aspect.a} ${block.aspect.type} ${block.aspect.b}`
      : title;

    setDeepLoadingKey(blockId);
    setDeepErrors((prev) => ({ ...prev, [blockId]: "" }));

    try {
      const response = await deepenInterpretation({
        profileId,
        ownerDeviceId,
        focusTopic,
        baseInterpretation: text,
        language,
        relocationLat: relocationLat ?? undefined,
        relocationLng: relocationLng ?? undefined,
      });

      const cleanedText = cleanAiArtifacts(response.text);
      setDeepTexts((prev) => ({
        ...prev,
        [blockId]: cleanedText,
      }));
      setCollapsedDeepDive((prev) => ({
        ...prev,
        [blockId]: false,
      }));
    } catch {
      setDeepErrors((prev) => ({
        ...prev,
        [blockId]: t("errors.aiFailed"),
      }));
    } finally {
      setDeepLoadingKey(null);
    }
  }

  async function handleAskOracle() {
    const question = oracleQuestion.trim();
    if (!question) {
      setOracleError(t("errors.oracleQuestionRequired"));
      return;
    }

    setOracleLoading(true);
    setOracleError(null);
    setOracleAnswer(null);
    setOracleModel(null);

    try {
      const response = await askOracle({
        profileId,
        ownerDeviceId,
        question,
        language,
        relocationLat: relocationLat ?? undefined,
        relocationLng: relocationLng ?? undefined,
      });

      const cleanedAnswer = cleanAiArtifacts(response.answer);
      const finalAnswer =
        cleanedAnswer.length >= 30 ? cleanedAnswer : response.answer.trim();

      if (finalAnswer.length < 20) {
        throw new Error("Oracle returned too short answer");
      }

      const newEntry: OracleEntry = {
        question,
        answer: finalAnswer,
        model: response.model,
        askedAt: new Date().toISOString(),
      };

      setOracleAnswer(finalAnswer);
      setOracleModel(response.model);
      setCurrentOracleEntryKey(getOracleEntryKey(newEntry));
      setCurrentOracleCollapsed(false);
      setOracleHistory((prev) => [newEntry, ...prev].slice(0, 20));
      setCollapsedOracleAnswers((prev) => {
        const next = Object.fromEntries(
          Object.entries(prev).map(([key]) => [key, true]),
        ) as Record<string, boolean>;
        next[getOracleEntryKey(newEntry)] = false;
        return next;
      });
      setOracleQuestion("");
    } catch (error) {
      if (error instanceof FirebaseError) {
        if (error.message.includes("permission-denied")) {
          setOracleError(t("errors.permissionDenied"));
        } else if (error.message.includes("not-found")) {
          setOracleError(t("errors.profileNotFound"));
        } else {
          setOracleError(t("errors.aiFailed"));
        }
      } else {
        setOracleError(t("errors.aiFailed"));
      }
    } finally {
      setOracleLoading(false);
    }
  }

  function handleDeleteCurrentOracleAnswer() {
    if (currentOracleEntryKey) {
      setOracleHistory((prev) =>
        prev.filter((entry) => getOracleEntryKey(entry) !== currentOracleEntryKey),
      );
      setCollapsedOracleAnswers((prev) => {
        const next = { ...prev };
        delete next[currentOracleEntryKey];
        return next;
      });
    }

    setOracleAnswer(null);
    setOracleModel(null);
    setCurrentOracleEntryKey(null);
    setCurrentOracleCollapsed(false);
  }

  function handleDeleteOracleHistoryEntry(entryKey: string) {
    setOracleHistory((prev) => prev.filter((entry) => getOracleEntryKey(entry) !== entryKey));
    setCollapsedOracleAnswers((prev) => {
      const next = { ...prev };
      delete next[entryKey];
      return next;
    });

    if (currentOracleEntryKey === entryKey) {
      setOracleAnswer(null);
      setOracleModel(null);
      setCurrentOracleEntryKey(null);
      setCurrentOracleCollapsed(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4 space-y-3 bg-muted/10 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{t("ai.oracleTitle")}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t("ai.oracleDescription")}
            </p>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              {t("ai.creditsLabel", "Credits")}
            </span>
            <div className={`flex h-8 items-center justify-center rounded-full px-3 text-sm font-medium border ${oracleCredits > 0 ? "bg-amber-500/10 text-amber-500 border-amber-500/30" : "bg-muted/50 text-muted-foreground border-border"}`}>
              <span className="mr-1.5">✦</span> {oracleCredits}
            </div>
          </div>
        </div>

        <textarea
          className="w-full min-h-24 rounded-md border bg-background px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
          value={oracleQuestion}
          onChange={(e) => {
            setOracleQuestion(e.target.value);
            if (oracleError) {
              setOracleError(null);
            }
          }}
          placeholder={oracleCredits > 0 ? t("ai.oraclePlaceholder") : t("ai.oracleNoCredits", "You need Oracle Credits to ask a question. Purchase them in the Premium tab.")}
          maxLength={1000}
          disabled={oracleCredits <= 0}
        />

        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={handleAskOracle}
            disabled={oracleLoading || oracleCredits <= 0}
            className={oracleCredits > 0 ? "bg-amber-600 hover:bg-amber-500 text-white" : ""}
          >
            {oracleLoading ? t("ai.askOracleLoading") : t("ai.askOracle")}
          </Button>
          {oracleModel && (
            <span className="text-xs text-muted-foreground">
              {t("ai.modelLabel", { model: oracleModel })}
            </span>
          )}
        </div>

        {oracleError && (
          <p className="text-sm text-destructive">{oracleError}</p>
        )}

        {oracleAnswer && (
          <div className="rounded-md border bg-background/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("ai.answerTitle")}
              </p>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={currentOracleCollapsed ? t("ai.expandExplanation") : t("ai.collapseExplanation")}
                  title={currentOracleCollapsed ? t("ai.expandExplanation") : t("ai.collapseExplanation")}
                  onClick={() => setCurrentOracleCollapsed((prev) => !prev)}
                >
                  {currentOracleCollapsed ? <ChevronDown /> : <ChevronUp />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("common.delete")}
                  title={t("common.delete")}
                  onClick={handleDeleteCurrentOracleAnswer}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            {currentOracleCollapsed ? (
              <p className="text-sm text-muted-foreground truncate">
                {renderInlineMarkdown(getSingleLinePreview(oracleAnswer), "oracle-current-preview")}
              </p>
            ) : (
              <AiFormattedText text={oracleAnswer} />
            )}
          </div>
        )}

        {oracleHistoryWithoutCurrent.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("ai.oracleHistoryTitle")}
            </p>
            <div className="space-y-2">
              {oracleHistoryWithoutCurrent.map((entry) => (
                (() => {
                  const entryKey = getOracleEntryKey(entry);
                  const isCollapsed = collapsedOracleAnswers[entryKey] ?? true;

                  return (
                    <div
                      key={entryKey}
                      className="rounded-md border bg-background/40 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          {entry.question}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={isCollapsed ? t("ai.expandExplanation") : t("ai.collapseExplanation")}
                            title={isCollapsed ? t("ai.expandExplanation") : t("ai.collapseExplanation")}
                            onClick={() =>
                              setCollapsedOracleAnswers((prev) => ({
                                ...prev,
                                [entryKey]: !isCollapsed,
                              }))
                            }
                          >
                            {isCollapsed ? <ChevronDown /> : <ChevronUp />}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={t("common.delete")}
                            title={t("common.delete")}
                            onClick={() => handleDeleteOracleHistoryEntry(entryKey)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                      {isCollapsed ? (
                        <p className="text-sm text-muted-foreground truncate">
                          {renderInlineMarkdown(getSingleLinePreview(entry.answer), `oracle-history-preview-${entryKey}`)}
                        </p>
                      ) : (
                        <AiFormattedText text={entry.answer} />
                      )}
                    </div>
                  );
                })()
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sign-based interpretation blocks */}
      {signBlocks.map((block) => {
        const blockId = getBlockInstanceKey(block);
        const deepText = deepTexts[blockId];
        const deepError = deepErrors[blockId];
        const deepLoading = deepLoadingKey === blockId;
        const isDeepDiveCollapsed = collapsedDeepDive[blockId] ?? false;

        return (
          <div
            key={blockId}
            className="border-l-2 pl-4"
            style={{ borderColor: getBlockColor(block) }}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t(`interpretation.categories.${block.category}`)}
                </span>
              </div>
              <h3 className="text-lg font-semibold">
                {t(`${block.key}.title`)}
              </h3>
              
              {!hasPremiumPdf ? (
                <div className="relative">
                  <p className="text-sm text-muted-foreground leading-relaxed blur-[1px] opacity-80 select-none">
                    {getSingleLinePreview(t(`${block.key}.text`))}...
                  </p>
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/90" />
                  <div className="mt-2 relative z-10 flex flex-col items-start gap-2">
                    <p className="text-xs text-amber-500 font-medium">{t("premium.unlockRequired", "Unlock Premium to read full deep interpretation.")}</p>
                    <Button type="button" size="sm" variant="outline" className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10" onClick={onPurchasePremium}>
                      {t("premium.buyPdf", "Get Premium PDF ($5)")}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t(`${block.key}.text`)}
                  </p>

                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void handleDeepDive(block);
                      }}
                      disabled={deepLoading}
                    >
                      {deepLoading ? t("ai.deepDiveLoading") : t("ai.deepDive")}
                    </Button>
                  </div>

                  {deepError && (
                    <p className="text-sm text-destructive">{deepError}</p>
                  )}

                  {deepText && (
                    <div className="rounded-md border bg-background/60 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">
                          {t("ai.deepDiveTitle")}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setCollapsedDeepDive((prev) => ({
                              ...prev,
                              [blockId]: !isDeepDiveCollapsed,
                            }))
                          }
                        >
                          {isDeepDiveCollapsed ? t("ai.expandExplanation") : t("ai.collapseExplanation")}
                        </Button>
                      </div>
                      {!isDeepDiveCollapsed && <AiFormattedText text={deepText} />}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* Separator between sign and aspect blocks */}
      {aspectBlocks.length > 0 && signBlocks.length > 0 && (
        <div className="border-t border-border" />
      )}

      {/* Aspect blocks */}
      {aspectBlocks.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("interpretation.categories.aspect")}
          </span>
        </div>
      )}

      {aspectBlocks.map((block) => {
        const aspect = block.aspect;
        const blockId = getBlockInstanceKey(block);
        const deepText = deepTexts[blockId];
        const deepError = deepErrors[blockId];
        const deepLoading = deepLoadingKey === blockId;
        const isDeepDiveCollapsed = collapsedDeepDive[blockId] ?? false;

        return (
          <div
            key={blockId}
            className="border-l-2 pl-4"
            style={{ borderColor: getBlockColor(block) }}
          >
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">
                <span style={{ color: getBlockColor(block) }}>
                  {ASPECT_GLYPHS[block.tags[0]] ?? ""}{" "}
                </span>
                {t(`${block.key}.title`)}
              </h3>
              {aspect && (
                <p className="text-sm font-medium">
                  {PLANET_GLYPHS[aspect.a] ?? ""} {aspect.a}{" "}
                  {ASPECT_GLYPHS[aspect.type] ?? ""}{" "}
                  {PLANET_GLYPHS[aspect.b] ?? ""} {aspect.b}{" "}
                  <span className="text-muted-foreground">
                    ({aspect.orb.toFixed(1)}&deg; orb)
                  </span>
                </p>
              )}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t(`${block.key}.text`)}
              </p>

              <div className="pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void handleDeepDive(block);
                  }}
                  disabled={deepLoading}
                >
                  {deepLoading ? t("ai.deepDiveLoading") : t("ai.deepDive")}
                </Button>
              </div>

              {deepError && (
                <p className="text-sm text-destructive">{deepError}</p>
              )}

              {deepText && (
                <div className="rounded-md border bg-background/60 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {t("ai.deepDiveTitle")}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setCollapsedDeepDive((prev) => ({
                          ...prev,
                          [blockId]: !isDeepDiveCollapsed,
                        }))
                      }
                    >
                      {isDeepDiveCollapsed ? t("ai.expandExplanation") : t("ai.collapseExplanation")}
                    </Button>
                  </div>
                  {!isDeepDiveCollapsed && <AiFormattedText text={deepText} />}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
