/**
 * Prompt templates with named placeholders such as {{question}} (DEC-011).
 * The server fills them with chart, profile and request data; filling is a
 * single pass, so text inside an inserted value is never read as a placeholder.
 */

const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;
const PLACEHOLDER_LINE = /^\s*\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}\s*$/;

/** Placeholder names used in a template, in order of first appearance, without duplicates. */
export function placeholdersIn(template: string): string[] {
  const names: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

/**
 * Fill a template. `collapsible` names optional blocks: when such a placeholder
 * stands alone on its line and its value is empty, the line is removed together
 * with the blank lines directly above it, so an absent block leaves no gap.
 * A placeholder without a value becomes an empty string.
 */
export function fillTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
  collapsible: ReadonlySet<string> = new Set(),
): string {
  let source = template;
  if (collapsible.size > 0) {
    const lines = template.split("\n");
    const kept: string[] = [];
    for (const line of lines) {
      const only = line.match(PLACEHOLDER_LINE);
      if (only && collapsible.has(only[1]) && !values[only[1]]) {
        while (kept.length > 0 && kept[kept.length - 1].trim() === "") kept.pop();
        continue;
      }
      kept.push(line);
    }
    source = kept.join("\n");
  }
  return source.replace(PLACEHOLDER, (_match, name: string) => values[name] ?? "");
}

export interface TemplateCheck {
  missing: string[];
  unknown: string[];
}

/** Required placeholders that are absent and placeholders that are not allowed. */
export function checkTemplate(
  template: string,
  allowed: readonly string[],
  required: readonly string[],
): TemplateCheck {
  const used = placeholdersIn(template);
  return {
    missing: required.filter((name) => !used.includes(name)),
    unknown: used.filter((name) => !allowed.includes(name)),
  };
}
