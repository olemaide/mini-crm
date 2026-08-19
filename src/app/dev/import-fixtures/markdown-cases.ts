import { parseMarkdownLite, safeHref, type Block, type Inline } from "@/lib/markdown-lite";

/**
 * Expected results for the markdown-lite parser.
 *
 * The parser is the only thing standing between a note body and the DOM, so
 * the cases that matter most are the ones where a hostile URL must come out as
 * literal text. Those are marked "XSS" below — if one of them ever starts
 * passing as a link, the renderer would emit an executable href.
 *
 * Notation: b(x) bold, i(x) italic, c(x) code, a(href→label) link, bare text
 * as-is. Paragraph lines are joined with |, list items with ; .
 */
function serializeInline(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "bold":
          return `b(${node.value})`;
        case "italic":
          return `i(${node.value})`;
        case "code":
          return `c(${node.value})`;
        case "link":
          return `a(${node.href}→${node.value})`;
        default:
          return node.value;
      }
    })
    .join("");
}

function serializeBlocks(blocks: Block[]): string {
  return blocks
    .map((block) =>
      block.kind === "list"
        ? `${block.ordered ? "OL" : "UL"}{${block.items.map(serializeInline).join("; ")}}`
        : `P{${block.lines.map(serializeInline).join("|")}}`,
    )
    .join(" ");
}

export function runMarkdownCase(input: string): string {
  return serializeBlocks(parseMarkdownLite(input));
}

export const MARKDOWN_CASES: { input: string; expected: string; why: string }[] = [
  // ---- emphasis
  { input: "**bold**", expected: "P{b(bold)}", why: "bold" },
  { input: "*italic*", expected: "P{i(italic)}", why: "italic, asterisk" },
  { input: "_italic_", expected: "P{i(italic)}", why: "italic, underscore" },
  {
    input: "snake_case_name stays put",
    expected: "P{snake_case_name stays put}",
    why: "underscores inside a word are not emphasis",
  },
  { input: "**unclosed", expected: "P{**unclosed}", why: "unterminated marker is literal" },
  {
    input: "Call **Anna** about *pricing*",
    expected: "P{Call b(Anna) about i(pricing)}",
    why: "mixed inline",
  },

  // ---- code spans win over emphasis
  {
    input: "`**not bold**`",
    expected: "P{c(**not bold**)}",
    why: "markers inside code stay literal",
  },
  { input: "use `npm i`", expected: "P{use c(npm i)}", why: "inline code" },

  // ---- links
  {
    input: "[Acme](https://acme.example)",
    expected: "P{a(https://acme.example→Acme)}",
    why: "explicit link",
  },
  {
    input: "[Acme](acme.example)",
    expected: "P{a(https://acme.example→Acme)}",
    why: "bare domain upgraded to https, not treated as a relative path",
  },
  {
    input: "See https://acme.example/pricing for details",
    expected: "P{See a(https://acme.example/pricing→https://acme.example/pricing) for details}",
    why: "bare URL autolinked",
  },
  {
    input: "See https://acme.example.",
    expected: "P{See a(https://acme.example→https://acme.example).}",
    why: "the full stop ends the sentence, not the URL",
  },
  {
    input: "[](https://acme.example)",
    expected: "P{a(https://acme.example→https://acme.example)}",
    why: "empty label falls back to the URL",
  },
  {
    input: "mailto:sales@acme.example",
    expected: "P{a(mailto:sales@acme.example→mailto:sales@acme.example)}",
    why: "mailto is allow-listed",
  },

  // ---- XSS: every one of these must render as inert text
  {
    input: "[click](javascript:alert(1))",
    expected: "P{[click](javascript:alert(1))}",
    why: "XSS — javascript: refused, shown literally so the target is visible",
  },
  {
    input: "[click](JaVaScRiPt:alert(1))",
    expected: "P{[click](JaVaScRiPt:alert(1))}",
    why: "XSS — scheme check is case-insensitive",
  },
  {
    input: "[click](data:text/html;base64,PHNjcmlwdD4=)",
    expected: "P{[click](data:text/html;base64,PHNjcmlwdD4=)}",
    why: "XSS — data: refused",
  },
  {
    input: "[click](vbscript:msgbox)",
    expected: "P{[click](vbscript:msgbox)}",
    why: "XSS — any unknown scheme refused",
  },
  {
    input: "<script>alert(1)</script>",
    expected: "P{<script>alert(1)</script>}",
    why: "XSS — raw HTML is never markup here, only text",
  },
  {
    input: "<img src=x onerror=alert(1)>",
    expected: "P{<img src=x onerror=alert(1)>}",
    why: "XSS — attribute injection is text too",
  },

  // ---- blocks
  {
    input: "- one\n- two",
    expected: "UL{one; two}",
    why: "dash bullets",
  },
  {
    input: "* one\n* two",
    expected: "UL{one; two}",
    why: "asterisk bullets are a list, not italics",
  },
  {
    input: "1. first\n2. second",
    expected: "OL{first; second}",
    why: "ordered list",
  },
  {
    input: "- bullet\n1. number",
    expected: "UL{bullet} OL{number}",
    why: "a change of marker starts a new list",
  },
  {
    input: "Intro\n- a\nOutro",
    expected: "P{Intro} UL{a} P{Outro}",
    why: "a list interrupts and then ends a paragraph",
  },
  {
    input: "one\ntwo",
    expected: "P{one|two}",
    why: "a single newline is a line break inside one paragraph",
  },
  {
    input: "one\n\ntwo",
    expected: "P{one} P{two}",
    why: "a blank line starts a new paragraph",
  },
  {
    input: "one\r\ntwo",
    expected: "P{one|two}",
    why: "CRLF from a Windows paste is normalised",
  },
  {
    input: "- **Anna** wants a [demo](https://acme.example)",
    expected: "UL{b(Anna) wants a a(https://acme.example→demo)}",
    why: "inline parsing runs inside list items",
  },
  { input: "   ", expected: "", why: "whitespace only produces no blocks" },
];

/** Scheme handling on its own, away from the surrounding parse. */
export const HREF_CASES: { input: string; expected: string | null }[] = [
  { input: "https://acme.example", expected: "https://acme.example" },
  { input: "http://acme.example", expected: "http://acme.example" },
  { input: "mailto:a@b.test", expected: "mailto:a@b.test" },
  { input: "acme.example/pricing", expected: "https://acme.example/pricing" },
  { input: "javascript:alert(1)", expected: null },
  { input: "  javascript:alert(1)  ", expected: null },
  { input: "data:text/html,<script>", expected: null },
  { input: "file:///etc/passwd", expected: null },
  { input: "/relative/path", expected: null },
  { input: "", expected: null },
];

export function runHrefCase(input: string): string | null {
  return safeHref(input);
}
