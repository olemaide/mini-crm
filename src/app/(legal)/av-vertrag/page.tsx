import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalDocumentView } from "@/components/legal-document";
import { legalDocument } from "@/lib/legal/documents";

const SLUG = "av-vertrag";

export async function generateMetadata(): Promise<Metadata> {
  // The document's own German title, not a translated one: this is the name of
  // a legal text and it does not change with the interface language.
  return { title: legalDocument(SLUG)?.title };
}

export default async function DpaPage() {
  const document = legalDocument(SLUG);
  // Unreachable while the catalogue and the routes agree. Kept so renaming a
  // slug in one place produces a 404 rather than a render crash.
  if (!document) notFound();

  return <LegalDocumentView document={document} />;
}
