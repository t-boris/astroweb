/** Extract a JSON object/array from a model response (tolerates narration/fences). */
export function extractJson<T>(s: string, kind: "object" | "array" = "object"): T {
  let t = s;
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1];
  const open = kind === "object" ? "{" : "[";
  const close = kind === "object" ? "}" : "]";
  const i = t.indexOf(open);
  const j = t.lastIndexOf(close);
  if (i >= 0 && j > i) t = t.slice(i, j + 1);
  return JSON.parse(t.trim()) as T;
}
