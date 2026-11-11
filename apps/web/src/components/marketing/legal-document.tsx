import type { ReactNode } from "react";

type Block = { kind: "h"; text: string } | { kind: "p"; text: string } | { kind: "ul"; items: string[] };

/** The text of a legal document as blocks: a line that starts with "# " is a heading, a run of lines that start with "- " is a list, any other run of lines up to a blank line is a paragraph. */
export function parseLegal(text: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    let para: string[] = [];
    let list: string[] = [];
    const flush = () => {
      if (para.length) blocks.push({ kind: "p", text: para.join("\n") });
      if (list.length) blocks.push({ kind: "ul", items: list });
      para = []; list = [];
    };
    for (const raw of chunk.split("\n")) {
      const line = raw.trimEnd();
      if (!line.trim()) continue;
      if (line.startsWith("# ")) { flush(); blocks.push({ kind: "h", text: line.slice(2).trim() }); }
      else if (line.startsWith("- ")) { if (para.length) flush(); list.push(line.slice(2).trim()); }
      else { if (list.length) flush(); para.push(line); }
    }
    flush();
  }
  return blocks;
}

/** The text of a legal document on a public page. Everything is text: nothing the administrators type is ever treated as HTML. */
export function LegalDocument({ text }: { text: string }): ReactNode {
  return (
    <div className="grid gap-4 text-base leading-relaxed text-white/80" data-testid="legal-document">
      {parseLegal(text).map((b, i) =>
        b.kind === "h" ? <h2 key={i} className="mt-4 text-xl font-semibold text-white">{b.text}</h2>
        : b.kind === "ul" ? <ul key={i} className="grid list-disc gap-1.5 pl-6">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
        : <p key={i} className="whitespace-pre-line">{b.text}</p>)}
    </div>
  );
}
