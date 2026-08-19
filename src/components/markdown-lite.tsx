import { Fragment } from "react";

import { parseMarkdownLite, type Inline } from "@/lib/markdown-lite";

/**
 * Renders the markdown-lite subset as React elements.
 *
 * Every user string below lands in a text node or an already-validated href.
 * There is no `dangerouslySetInnerHTML` here, and there must never be one — the
 * absence of an HTML string in the pipeline is what makes note bodies safe,
 * not a sanitiser that could be mis-configured.
 */
function InlineNodes({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.kind) {
          case "bold":
            return <strong key={index}>{node.value}</strong>;
          case "italic":
            return <em key={index}>{node.value}</em>;
          case "code":
            return (
              <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
                {node.value}
              </code>
            );
          case "link":
            return (
              <a
                key={index}
                href={node.href}
                target="_blank"
                rel="noreferrer noopener nofollow"
                className="text-primary underline underline-offset-2"
              >
                {node.value}
              </a>
            );
          default:
            return <Fragment key={index}>{node.value}</Fragment>;
        }
      })}
    </>
  );
}

export function MarkdownLite({ source, className }: { source: string; className?: string }) {
  const blocks = parseMarkdownLite(source);

  return (
    <div className={className}>
      {blocks.map((block, index) => {
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List
              key={index}
              className={
                block.ordered
                  ? "my-1 ml-5 list-decimal space-y-0.5"
                  : "my-1 ml-5 list-disc space-y-0.5"
              }
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <InlineNodes nodes={item} />
                </li>
              ))}
            </List>
          );
        }

        return (
          <p key={index} className="my-1 first:mt-0 last:mb-0">
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                <InlineNodes nodes={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
