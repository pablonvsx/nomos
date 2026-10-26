// The footer of every modal and dialog goes through components/ui/ModalActions,
// which OWNS the space around its buttons. This guard reads the source and fails
// when a screen goes back to building its own footer, or when something above the
// footer brings back the paddings and frame lines that used to add up.

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..");
const DIRS = ["app", "components", "hooks", "modules"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

const files = DIRS.flatMap((d) => sourceFiles(join(ROOT, d))).map((file) => ({
  file,
  name: file.replace(ROOT, ""),
  text: readFileSync(file, "utf8"),
}));

describe("modal footer", () => {
  it("nobody uses Paper's Dialog.Actions: footers are ModalActions (or ModalActionsStacked)", () => {
    const offenders = files.filter(({ text }) => /Dialog\.Actions/.test(text)).map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  it("a dialog that ends in a ModalActions uses ModalBody, not Dialog.Content (whose 24dp bottom padding would add to the footer's gap)", () => {
    const offenders = files
      .filter(({ text, name }) => !name.endsWith("ModalBody.tsx") && /<ModalActions/.test(text) && /<Dialog\.Content/.test(text))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  it("every Dialog.ScrollArea drops Paper's frame lines (MODAL_SCROLL_AREA_STYLE, directly or through a style that spreads it)", () => {
    const offenders: string[] = [];
    for (const { name, text } of files) {
      for (const match of text.matchAll(/<Dialog\.ScrollArea([^>]*)>/g)) {
        const attrs = match[1];
        const direct = attrs.includes("MODAL_SCROLL_AREA_STYLE");
        const viaStyles = /styles\.content/.test(attrs) && /\.\.\.MODAL_SCROLL_AREA_STYLE/.test(text);
        if (!direct && !viaStyles) offenders.push(name);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no ModalActions is given its own vertical padding or margin (the footer owns that space)", () => {
    const offenders: string[] = [];
    for (const { name, text } of files) {
      for (const match of text.matchAll(/<ModalActions[^>]*style=\{([^}]*)\}/g)) {
        if (/(margin|padding)(Top|Bottom|Vertical)/.test(match[1])) offenders.push(name);
      }
    }
    expect(offenders).toEqual([]);
  });
});
