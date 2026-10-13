import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { builderHelpKeys } from "@/lib/helpKeys";

/**
 * The help texts and where they are used (REQ-001, REQ-003, REQ-004, REQ-005, DEC-004, DEC-006).
 * Everything here reads files, so it runs in plain Node.
 */
const WEB = join(__dirname, "..", "..", "..");
const SRC = join(WEB, "src");

type Tree = { [key: string]: string | Tree };

function readHelp(lang: "en" | "ru"): Tree {
  const all = JSON.parse(readFileSync(join(WEB, "public", "locales", lang, "translation.json"), "utf-8")) as { help?: Tree };
  return all.help ?? {};
}

/** help.* leaves as { "tabs.chart": "text" }, without the "help." prefix. */
function leaves(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, leaves(value, path));
  }
  return out;
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "__tests__") files.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(name)) {
      files.push(full);
    }
  }
  return files;
}

const en = leaves(readHelp("en"));
const ru = leaves(readHelp("ru"));
/** help.ui.* are labels of the component itself, not help texts. */
const textKeys = Object.keys(en).filter((k) => !k.startsWith("ui."));

function readNamespace(lang: "en" | "ru", ns: string): Tree {
  const all = JSON.parse(readFileSync(join(WEB, "public", "locales", lang, "translation.json"), "utf-8")) as Record<string, Tree>;
  return all[ns] ?? {};
}

describe("help texts, EN and RU (REQ-004)", () => {
  it("exist", () => {
    expect(textKeys.length).toBeGreaterThan(0);
  });

  it("have the same keys in both languages", () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });

  it("are non-empty in both languages", () => {
    const empty = [...Object.entries(en), ...Object.entries(ru)].filter(([, v]) => v.trim() === "").map(([k]) => k);
    expect(empty).toEqual([]);
  });
});

describe("accessible names added for icon-only buttons (REQ-003, REQ-004)", () => {
  const enA11y = leaves(readNamespace("en", "a11y"));
  const ruA11y = leaves(readNamespace("ru", "a11y"));

  it("have the same non-empty keys in both languages", () => {
    expect(Object.keys(ruA11y).sort()).toEqual(Object.keys(enA11y).sort());
    const empty = [...Object.entries(enA11y), ...Object.entries(ruA11y)].filter(([, v]) => v.trim() === "").map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it("are each used in the code", () => {
    const code = sourceFiles(SRC).map((f) => readFileSync(f, "utf-8")).join("\n");
    const unused = Object.keys(enA11y).filter((k) => !code.includes(`"a11y.${k}"`) && !code.includes(`'a11y.${k}'`));
    expect(unused).toEqual([]);
  });
});

describe("help text content rules (REQ-001, DEC-001, DEC-004)", () => {
  const all = [...Object.entries(en).map(([k, v]) => ["en", k, v]), ...Object.entries(ru).map(([k, v]) => ["ru", k, v])]
    .filter(([, k]) => !k.startsWith("ui."));

  it("have no link and no 'learn more' pointer", () => {
    const bad = all.filter(([, , v]) => /https?:|www\.|<a\s|(^|[.!?…]\s+)(learn more|read more|подробнее|узнать больше)/i.test(v));
    expect(bad.map(([l, k]) => `${l}:${k}`)).toEqual([]);
  });

  it("are a short paragraph: at most 3 sentences and 420 characters", () => {
    const bad = all.filter(([, , v]) => {
      const sentences = v.split(/(?<=[.!?…])\s+/).filter(Boolean).length;
      return sentences > 3 || v.length > 420;
    });
    expect(bad.map(([l, k]) => `${l}:${k}`)).toEqual([]);
  });

  it("are generic: no personal placeholder and no model or vendor name", () => {
    const bad = all.filter(([, , v]) => /\{\{|claude|anthropic|opus|sonnet|gpt|openai/i.test(v));
    expect(bad.map(([l, k]) => `${l}:${k}`)).toEqual([]);
  });
});

describe("help keys in the code (REQ-001, REQ-002, REQ-003)", () => {
  const files = sourceFiles(SRC);
  const literalKeys = new Set<string>();
  for (const file of files) {
    const code = readFileSync(file, "utf-8");
    for (const m of code.matchAll(/helpKey=(?:\{?)["']([^"'{}$]+)["']/g)) literalKeys.add(m[1]);
  }
  const builderKeys = new Set(builderHelpKeys());
  const used = new Set([...literalKeys, ...builderKeys]);

  it("every key a screen asks for by name has an EN text", () => {
    const missing = [...literalKeys].filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  it("every key the astrology builders can produce has an EN and a RU text", () => {
    const missing = [...builderKeys].filter((k) => !(k in en) || !(k in ru));
    expect(missing).toEqual([]);
  });

  it("no help text is left without a place where it is shown", () => {
    // A builder-backed group counts as used only when a component calls its builder.
    const builderCalls = new Set<string>();
    for (const file of files) {
      const code = readFileSync(file, "utf-8");
      if (file.endsWith(`${sep}helpKeys.ts`)) continue;
      for (const m of code.matchAll(/\b(planet|sign|aspect|house|houseSystem|element|tab)HelpKey\(/g)) builderCalls.add(m[1]);
    }
    const groupOf: Record<string, string> = { planet: "planets", sign: "signs", aspect: "aspects", house: "houses", houseSystem: "houseSystems", element: "elements", tab: "tabs" };
    const unused = textKeys.filter((k) => {
      if (literalKeys.has(k)) return false;
      const group = k.split(".")[0];
      const builder = Object.entries(groupOf).find(([, g]) => g === group)?.[0];
      if (builder && builderCalls.has(builder) && builderKeys.has(k)) return false;
      // ASC and MC reuse terms.ascendant / terms.midheaven through planetHelpKey.
      if ((k === "terms.ascendant" || k === "terms.midheaven") && builderCalls.has("planet")) return false;
      return true;
    });
    expect(unused).toEqual([]);
    expect(used.size).toBeGreaterThan(0);
  });
});

describe("where help is not shown (REQ-003, DEC-008, DEC-006)", () => {
  it("the admin screen has no help bubbles", () => {
    const adminFiles = [join(SRC, "pages", "Admin.tsx"), ...sourceFiles(join(SRC, "components", "admin"))];
    const withHelp = adminFiles.filter((f) => /HelpBubble|helpKey/.test(readFileSync(f, "utf-8")));
    expect(withHelp.map((f) => relative(SRC, f))).toEqual([]);
  });

  it("opening help is not tracked and has no setting", () => {
    for (const rel of ["components/HelpBubble.tsx", "lib/helpBubble.ts", "lib/helpKeys.ts"]) {
      const code = readFileSync(join(SRC, rel), "utf-8");
      expect(code, rel).not.toMatch(/from\s+["'][^"']*analytics[^"']*["']|\btrackEvent\(|\blogEvent\(|\blocalStorage\b|\bsessionStorage\b/);
    }
  });
});
