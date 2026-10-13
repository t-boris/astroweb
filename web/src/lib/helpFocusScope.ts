import { createContext } from "react";

/**
 * Keeps keyboard navigation short (REQ-005). A plain-text term with help is a tab stop so keyboard users can open
 * its bubble, but a table repeats the same terms dozens of times (the Houses tab would have 245 tab stops).
 * Within one scope only the FIRST element of each help key is a tab stop; the others still open on hover and tap,
 * and every tab stop explains a different concept. When the first one goes away the next one takes over.
 */
export class HelpFocusScope {
  private readonly claims = new Map<string, Array<(first: boolean) => void>>();

  /** Registers an element for `key`; `onChange(true)` means it is the tab stop of that key. Returns the release function. */
  claim(key: string, onChange: (first: boolean) => void): () => void {
    const list = this.claims.get(key) ?? [];
    list.push(onChange);
    this.claims.set(key, list);
    this.notify(key);
    return () => {
      const current = this.claims.get(key);
      if (!current) return;
      const index = current.indexOf(onChange);
      if (index >= 0) current.splice(index, 1);
      if (current.length === 0) this.claims.delete(key);
      else this.notify(key);
    };
  }

  private notify(key: string): void {
    this.claims.get(key)?.forEach((onChange, index) => onChange(index === 0));
  }
}

/** Unset (null) outside a scope: every element is then a tab stop. */
export const HelpFocusScopeContext = createContext<HelpFocusScope | null>(null);
