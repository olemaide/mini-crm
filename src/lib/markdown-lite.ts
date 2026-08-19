/**
 * A deliberately tiny Markdown subset for note bodies.
 *
 * Why hand-rolled rather than `marked` + `DOMPurify`:
 *
 * This parser emits **data**, not HTML. The renderer turns that data into React
 * elements, so user text always arrives as a text node and there is no
 * `dangerouslySetInnerHTML` anywhere in the path. Sanitising is not a step that
 * can be forgotten or mis-configured — there is no HTML to sanitise. A full
 * Markdown library would give us image embeds, raw HTML passthrough and
 * reference links, all of which would then need to be configured back off.
 *
 * Supported: **bold**, *italic*, _italic_, `code`, [text](url), bare URLs,
 * `-`/`*` bullet lists, `1.` ordered lists, blank-line paragraphs.
 * Everything else is literal text.
 */

export type Inline =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; value: string; href: string };

export type Block =
  { kind: "paragraph"; lines: Inline[][] } | { kind: "list"; ordered: boolean; items: Inline[][] };

/**
 * The one place a URL can enter the DOM as an href.
 *
 * Anything that is not http(s) or mailto is refused outright — `javascript:`
 * and `data:` are the whole reason this function exists. A bare domain is
 * upgraded to https rather than left as a relative path, which is what a
 * browser would otherwise make of `acme.com`.
 */
export function safeHref(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  if (/^(https?:\/\/|mailto:)/i.test(value)) return value;
  // Scheme-like but not allow-listed: refuse rather than guess.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  if (/^[\w-]+(\.[\w-]+)+([/?#]|$)/.test(value)) return `https://${value}`;
  return null;
}

// Order matters: code first so `**` inside a span stays literal, links before
// emphasis so a bracketed label containing `*` is not torn apart.
const INLINE_PATTERN = new RegExp(
  [
    "(`[^`\\n]+`)",
    "(\\[[^\\]\\n]*\\]\\([^)\\s]+\\))",
    "(\\*\\*[^*\\n]+\\*\\*)",
    "(\\*[^*\\n]+\\*)",
    "((?<![\\w])_[^_\\n]+_(?![\\w]))",
    "((?:https?://|mailto:)[^\\s<>]+)",
  ].join("|"),
  "g",
);

/** Trailing punctuation belongs to the sentence, not to the bare URL in it. */
function trimUrlPunctuation(url: string): { href: string; trailing: string } {
  const match = /[.,;:!?]+$/.exec(url);
  if (!match) return { href: url, trailing: "" };
  return { href: url.slice(0, match.index), trailing: match[0] };
}

function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;

  const push = (node: Inline) => {
    if (node.kind === "text" && node.value === "") return;
    const prev = out[out.length - 1];
    if (node.kind === "text" && prev?.kind === "text") prev.value += node.value;
    else out.push(node);
  };

  INLINE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    push({ kind: "text", value: text.slice(last, match.index) });
    last = match.index + match[0].length;

    const [, code, link, bold, star, underscore, url] = match;

    if (code !== undefined) {
      push({ kind: "code", value: code.slice(1, -1) });
    } else if (link !== undefined) {
      const split = link.indexOf("](");
      const label = link.slice(1, split);
      const href = safeHref(link.slice(split + 2, -1));
      // A refused target degrades to the literal source text. Silently
      // rendering the label alone would hide where it pointed.
      if (href === null) push({ kind: "text", value: link });
      else push({ kind: "link", value: label === "" ? href : label, href });
    } else if (bold !== undefined) {
      push({ kind: "bold", value: bold.slice(2, -2) });
    } else if (star !== undefined) {
      push({ kind: "italic", value: star.slice(1, -1) });
    } else if (underscore !== undefined) {
      push({ kind: "italic", value: underscore.slice(1, -1) });
    } else if (url !== undefined) {
      const { href, trailing } = trimUrlPunctuation(url);
      const safe = safeHref(href);
      if (safe === null) push({ kind: "text", value: url });
      else {
        push({ kind: "link", value: href, href: safe });
        push({ kind: "text", value: trailing });
      }
    }
  }

  push({ kind: "text", value: text.slice(last) });
  return out;
}

const BULLET = /^\s{0,3}[-*]\s+(.*)$/;
const ORDERED = /^\s{0,3}\d{1,3}[.)]\s+(.*)$/;

export function parseMarkdownLite(source: string): Block[] {
  const blocks: Block[] = [];
  // Normalise line endings first: a note pasted from Outlook on Windows
  // arrives with CRLF and would otherwise leave \r inside every line.
  const lines = source.replace(/\r\n?/g, "\n").split("\n");

  let paragraph: Inline[][] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", lines: paragraph });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
    list = null;
  };

  for (const line of lines) {
    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);

    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = ordered !== null;
      // A change of marker starts a new list rather than mixing the two.
      if (list && list.ordered !== isOrdered) flushList();
      list ??= { ordered: isOrdered, items: [] };
      list.items.push(parseInline(bullet?.[1] ?? ordered?.[1] ?? ""));
      continue;
    }

    flushList();

    if (line.trim() === "") {
      flushParagraph();
      continue;
    }

    paragraph.push(parseInline(line));
  }

  flushList();
  flushParagraph();
  return blocks;
}
