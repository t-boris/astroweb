/**
 * Was the last thing the person did on the keyboard or with a pointer? A bubble opens on focus only after a key press.
 * `:focus-visible` is not enough to tell: it always matches text fields, so clicking into a field would open its
 * help bubble and keep it open while typing, and it is not reliable in embedded views without window focus.
 * Two passive listeners record the last input; nothing is stored or sent anywhere.
 */
let keyboard = false; // a focus() from a script before any key press (autofocus) is not a keyboard focus
let installed = false;

export function trackInputModality(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener(
    "keydown",
    (event) => {
      if (!event.metaKey && !event.altKey && !event.ctrlKey) keyboard = true;
    },
    true,
  );
  document.addEventListener("pointerdown", () => { keyboard = false; }, true);
}

export function lastInputWasKeyboard(): boolean {
  return keyboard;
}
