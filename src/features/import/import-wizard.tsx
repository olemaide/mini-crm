"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { DownloadIcon, FileSpreadsheetIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";

import { ActionErrorMessage } from "@/components/action-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActionError } from "@/lib/actions";
import {
  buildErrorCsv,
  chunkRows,
  IMPORT_FIELDS,
  MAX_IMPORT_BYTES,
  parseCsv,
  prepareRows,
  suggestMapping,
  type ImportField,
  type ParsedCsv,
  type PreparedRow,
} from "@/lib/csv";
import { cn } from "@/lib/utils";
import { createImportJob, finalizeImportJob, previewDuplicates } from "./actions";
import { duplicatePolicies, type DuplicatePolicy } from "./schema";

type Step = "upload" | "map" | "preview" | "running" | "done";

type RunResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  errorRows: { row: number; code: string; message: string }[];
};

const CHUNK_SIZE = 500;

/**
 * Downloadable templates, one per locale.
 *
 * They differ in more than language. Excel picks its CSV separator from the
 * system list separator, so a comma-delimited file double-clicked on a German
 * machine lands every row in a single column — and a semicolon file does the
 * same to an English one. Both carry a UTF-8 BOM, without which German Excel
 * decodes them as Windows-1252 and turns "Müller" into "MÃ¼ller" in the very
 * file that is meant to demonstrate the correct format.
 */
const TEMPLATES = {
  en: "/mini-crm-contacts-template.csv",
  de: "/mini-crm-kontakte-vorlage.csv",
} as const;

export function ImportWizard() {
  const t = useTranslations("import");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<ActionError | null>(null);
  const [isPending, startTransition] = useTransition();

  const [filename, setFilename] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<number, ImportField | null>>({});
  const [policy, setPolicy] = useState<DuplicatePolicy>("skip");
  const [createCompanies, setCreateCompanies] = useState(true);
  const [dragging, setDragging] = useState(false);

  const [prepared, setPrepared] = useState<PreparedRow[]>([]);
  const [stats, setStats] = useState({ valid: 0, errors: 0, inFile: 0, existing: 0 });
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);

  // ------------------------------------------------------------- step 1

  const onFile = useCallback(async (file: File) => {
    setError(null);

    if (file.size > MAX_IMPORT_BYTES) {
      setError({ key: "fileTooLarge" });
      return;
    }

    const buffer = await file.arrayBuffer();
    const outcome = parseCsv(buffer, file.name);

    if (!outcome.ok) {
      setError({ key: `csv_${outcome.error}` });
      return;
    }

    setFilename(file.name);
    setParsed(outcome.data);
    setMapping(suggestMapping(outcome.data.headers));
    setStep("map");
  }, []);

  // ------------------------------------------------------------- step 2

  function goToPreview() {
    if (!parsed) return;
    setError(null);

    const hasIdentity = Object.values(mapping).some(
      (field) =>
        field === "email" ||
        field === "first_name" ||
        field === "last_name" ||
        field === "full_name",
    );
    if (!hasIdentity) {
      setError({ key: "mappingNeedsIdentity" });
      return;
    }

    const outcome = prepareRows(parsed.rows, mapping);
    setPrepared(outcome.rows);
    setStats({
      valid: outcome.validCount,
      errors: outcome.errorCount,
      inFile: outcome.inFileDuplicates,
      existing: 0,
    });
    setStep("preview");

    // How many of these already exist. Advisory — the import runs either way.
    const emails = outcome.rows
      .filter((row) => !row._error && row.email)
      .map((row) => row.email as string);

    startTransition(async () => {
      const preview = await previewDuplicates({ emails, phones: [] });
      if (preview.ok) {
        setStats((current) => ({ ...current, existing: preview.data.emailMatches }));
      }
    });
  }

  // --------------------------------------------------------- steps 3 & 4

  async function runImport() {
    if (!parsed) return;
    setError(null);
    setStep("running");
    setProgress(0);

    const job = await createImportJob({
      filename,
      totalRows: prepared.length,
      duplicatePolicy: policy,
      createCompanies,
      mapping: Object.fromEntries(Object.entries(mapping).map(([index, field]) => [index, field])),
    });

    if (!job.ok) {
      setError(job.error);
      setStep("preview");
      return;
    }

    const chunks = chunkRows(prepared, CHUNK_SIZE);
    const totals: RunResult = { created: 0, updated: 0, skipped: 0, errors: 0, errorRows: [] };

    for (const [index, chunk] of chunks.entries()) {
      const send = () =>
        fetch("/api/import/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: job.data.jobId, rows: chunk }),
        });

      let response: Response;
      try {
        response = await send();

        /*
         * A 429 from the Phase 9 limiter is the one recoverable failure here.
         * Everything else means the chunk can never succeed, but a rate limit
         * clears on its own — and aborting a 5,000-row import because chunk 7
         * arrived a second early would be a worse bug than the flood the
         * limiter exists to stop. One wait, honouring the server's own
         * Retry-After, then a single retry.
         */
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("Retry-After") ?? "5");
          const waitMs =
            Math.min(Math.max(Number.isFinite(retryAfter) ? retryAfter : 5, 1), 60) * 1000;
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          response = await send();
        }
      } catch {
        // Network failure mid-import. The rows already written stay written —
        // the job is marked failed and the user can undo it wholesale.
        await finalizeImportJob({ jobId: job.data.jobId, status: "failed" });
        setError({ key: "importInterrupted" });
        setStep("preview");
        return;
      }

      if (!response.ok) {
        await finalizeImportJob({ jobId: job.data.jobId, status: "failed" });
        setError({ key: "importInterrupted" });
        setStep("preview");
        return;
      }

      const payload = (await response.json()) as {
        result: {
          created: number;
          updated: number;
          skipped: number;
          errors: number;
          error_details: { row: number; code: string; message: string }[];
        };
      };

      totals.created += payload.result.created;
      totals.updated += payload.result.updated;
      totals.skipped += payload.result.skipped;
      totals.errors += payload.result.errors;
      // Keep a bounded sample for the downloadable report.
      if (totals.errorRows.length < 1000) {
        totals.errorRows.push(...payload.result.error_details);
      }

      setProgress(Math.round(((index + 1) / chunks.length) * 100));
    }

    await finalizeImportJob({ jobId: job.data.jobId, status: "completed" });

    setResult(totals);
    setStep("done");
    router.refresh();
  }

  function downloadErrors() {
    if (!result) return;

    const csv = buildErrorCsv(result.errorRows, {
      row: t("errorCsvRow"),
      problem: t("errorCsvProblem"),
      detail: t("errorCsvDetail"),
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${filename.replace(/\.csv$/i, "")}-errors.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setStep("upload");
    setParsed(null);
    setPrepared([]);
    setResult(null);
    setError(null);
    setProgress(0);
    setFilename("");
  }

  // ------------------------------------------------------------- render

  const errorCodeLabel = (code: string) => {
    const key = code as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : code;
  };

  return (
    <div className="space-y-6">
      <ActionErrorMessage error={error} />

      {step === "upload" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("uploadTitle")}</CardTitle>
            <CardDescription>{t("uploadSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) void onFile(file);
              }}
              className={cn(
                "flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center transition-colors",
                dragging ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <UploadIcon className="size-5" />
              </div>
              <p className="text-sm font-medium">{t("dropHere")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("uploadHint")}</p>

              <input
                ref={inputRef}
                type="file"
                accept=".csv,.tsv,text/csv"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onFile(file);
                  event.target.value = "";
                }}
              />
              <Button className="mt-5" onClick={() => inputRef.current?.click()}>
                {t("chooseFile")}
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="text-muted-foreground">{t("templatePrompt")}</span>
              <a
                href={TEMPLATES[locale === "de" ? "de" : "en"]}
                download
                className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
              >
                <DownloadIcon className="size-3.5" />
                {t("templateDownload")}
              </a>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("templateHint")}</p>
          </CardContent>
        </Card>
      ) : null}

      {step === "map" && parsed ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("mapTitle")}</CardTitle>
            <CardDescription>
              {t("mapSubtitle", {
                rows: format.number(parsed.rows.length),
                encoding: parsed.encoding,
                delimiter: parsed.delimiter === "\t" ? t("tab") : parsed.delimiter,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {parsed.raggedRows.length > 0 ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                {t("raggedRows", {
                  count: parsed.raggedRows.length,
                  rows: parsed.raggedRows.slice(0, 5).join(", "),
                })}
              </p>
            ) : null}

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columnHeader")}</TableHead>
                    <TableHead>{t("firstValues")}</TableHead>
                    <TableHead className="w-56">{t("mapsTo")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.headers.map((header, index) => (
                    <TableRow key={`${header}-${index}`}>
                      <TableCell className="font-medium">{header}</TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                        {parsed.rows
                          .slice(0, 3)
                          .map((row) => row[index])
                          .filter((value) => value && value.trim() !== "")
                          .join(" · ") || "—"}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={mapping[index] ?? "__ignore__"}
                          onValueChange={(value) =>
                            value &&
                            setMapping((current) => ({
                              ...current,
                              [index]: value === "__ignore__" ? null : (value as ImportField),
                            }))
                          }
                        >
                          <SelectTrigger size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__ignore__">{t("ignoreColumn")}</SelectItem>
                            {IMPORT_FIELDS.map((field) => (
                              <SelectItem key={field} value={field}>
                                {t(`field_${field}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={reset}>
                {tCommon("cancel")}
              </Button>
              <Button onClick={goToPreview}>{t("continue")}</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "preview" && parsed ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("previewTitle")}</CardTitle>
            <CardDescription>{t("previewSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: t("statValid"), value: stats.valid },
                { label: t("statExisting"), value: stats.existing },
                { label: t("statInFile"), value: stats.inFile },
                { label: t("statErrors"), value: stats.errors },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-semibold tabular-nums">{format.number(stat.value)}</p>
                </div>
              ))}
            </div>

            <Field>
              <FieldLabel htmlFor="policy">{t("policyLabel")}</FieldLabel>
              <Select
                value={policy}
                onValueChange={(value) => value && setPolicy(value as DuplicatePolicy)}
              >
                <SelectTrigger id="policy" className="max-w-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {duplicatePolicies.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`policy_${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{t(`policyHint_${policy}`)}</FieldDescription>
            </Field>

            <Field orientation="horizontal">
              <Checkbox
                id="createCompanies"
                checked={createCompanies}
                onCheckedChange={(checked) => setCreateCompanies(checked === true)}
              />
              <FieldLabel htmlFor="createCompanies" className="font-normal">
                {t("createCompaniesLabel")}
              </FieldLabel>
            </Field>

            {/* Task auto-creation defaults to off, per the build plan: importing
                500 contacts must not silently generate 500 follow-up tasks. */}
            <p className="text-xs text-muted-foreground">{t("noTasksNote")}</p>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("field_first_name")}</TableHead>
                    <TableHead>{t("field_last_name")}</TableHead>
                    <TableHead>{t("field_email")}</TableHead>
                    <TableHead>{t("field_company_name")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prepared.slice(0, 20).map((row) => (
                    <TableRow key={row.row}>
                      <TableCell>{row.first_name ?? "—"}</TableCell>
                      <TableCell>{row.last_name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{row.email ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.company_name ?? row.company_domain ?? "—"}
                      </TableCell>
                      <TableCell>
                        {row._error ? (
                          <span className="text-xs text-destructive">
                            {errorCodeLabel(row._error)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("willImport")}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep("map")} disabled={isPending}>
                {t("back")}
              </Button>
              <Button onClick={() => void runImport()} disabled={isPending || stats.valid === 0}>
                {t("startImport", { count: stats.valid })}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "running" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("runningTitle")}</CardTitle>
            <CardDescription>{t("runningSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground tabular-nums">
              {t("progress", { percent: progress })}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {step === "done" && result ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("doneTitle")}</CardTitle>
            <CardDescription>{t("doneSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: t("statCreated"), value: result.created },
                { label: t("statUpdated"), value: result.updated },
                { label: t("statSkipped"), value: result.skipped },
                { label: t("statErrors"), value: result.errors },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-semibold tabular-nums">{format.number(stat.value)}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {result.errorRows.length > 0 ? (
                <Button variant="outline" onClick={downloadErrors}>
                  <DownloadIcon className="size-4" />
                  {t("downloadErrors")}
                </Button>
              ) : null}
              <Button variant="outline" onClick={reset}>
                <FileSpreadsheetIcon className="size-4" />
                {t("importAnother")}
              </Button>
              <Button
                onClick={() => {
                  toast.success(t("doneToast"));
                  router.push("/contacts");
                }}
              >
                {t("viewContacts")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
