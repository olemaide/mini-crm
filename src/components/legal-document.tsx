import { getFormatter, getTranslations } from "next-intl/server";
import { TriangleAlertIcon } from "lucide-react";

import { hasUnfilledDetails, type LegalDocument } from "@/lib/legal/documents";

/**
 * Renders one of the German legal documents.
 *
 * The document body is data, not translated copy — see lib/legal/documents.ts
 * for why. Only the surrounding chrome (the "as of" line, the German-authoritative
 * note, the draft warning) comes from the message catalogue, because those are
 * remarks *about* the document rather than part of it.
 *
 * `lang="de"` is scoped to the document body and deliberately not put on the
 * whole article: `lang` inherits and cannot be un-set from a child, so wrapping
 * everything would have a screen reader announce the English chrome in a German
 * voice. `max-w-prose` keeps the measure readable for long-form text.
 */
export async function LegalDocumentView({ document }: { document: LegalDocument }) {
  const t = await getTranslations("legal");
  const format = await getFormatter();
  const isDraft = hasUnfilledDetails(document);

  return (
    <article className="max-w-prose space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight" lang="de">
          {document.title}
        </h1>
        <p className="text-xs text-muted-foreground">
          {t("lastUpdated", {
            date: format.dateTime(new Date(document.updatedAt), { dateStyle: "long" }),
          })}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground" lang="de">
          {document.intro}
        </p>
      </header>

      {isDraft ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
        >
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <p>{t("draftWarning")}</p>
        </div>
      ) : null}

      <div className="space-y-8" lang="de">
        {document.sections.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="text-base font-medium">{section.heading}</h2>

            {section.blocks.map((block, index) => {
              // Blocks have no natural identity, and reordering them is a content
              // edit that reloads the page anyway, so the index is a fair key.
              const key = `${section.heading}-${index}`;

              if (block.kind === "paragraph") {
                return (
                  <p key={key} className="text-sm leading-relaxed text-muted-foreground">
                    {block.text}
                  </p>
                );
              }

              if (block.kind === "list") {
                return (
                  <ul
                    key={key}
                    className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground"
                  >
                    {block.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                );
              }

              return (
                <dl key={key} className="space-y-2 text-sm leading-relaxed">
                  {block.items.map((item) => (
                    <div key={item.term} className="sm:grid sm:grid-cols-[10rem_1fr] sm:gap-4">
                      <dt className="font-medium">{item.term}</dt>
                      <dd className="text-muted-foreground">{item.description}</dd>
                    </div>
                  ))}
                </dl>
              );
            })}
          </section>
        ))}
      </div>

      <footer className="border-t pt-4">
        <p className="text-xs text-muted-foreground">{t("germanOnly")}</p>
      </footer>
    </article>
  );
}
