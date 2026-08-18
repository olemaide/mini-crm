"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActionResult } from "@/lib/actions";
import { createStage, deleteStage, reorderStage, updateStage } from "./actions";
import type { StageOption } from "./queries";

export function StageManager({
  pipelineId,
  stages,
}: {
  pipelineId: string;
  stages: StageOption[];
}) {
  const t = useTranslations("pipeline");
  const tCommon = useTranslations("common");
  const tError = useTranslations("errors.action");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newProbability, setNewProbability] = useState("50");
  const [deleting, setDeleting] = useState<StageOption | null>(null);
  const [moveTarget, setMoveTarget] = useState<string>("");

  function run(fn: () => Promise<ActionResult<unknown>>, success?: string) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        const key = result.error.key as Parameters<typeof tError>[0];
        toast.error(tError.has(key) ? tError(key) : tError("unexpected"));
        return;
      }
      if (success) toast.success(success);
      router.refresh();
    });
  }

  /**
   * Reordering writes a single fractional position: halfway between the two
   * stages the moved one is landing between. No renumbering of the rest.
   */
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;

    const before = direction === -1 ? stages[target - 1] : stages[target];
    const after = direction === -1 ? stages[target] : stages[target + 1];

    const position =
      before && after
        ? (before.position + after.position) / 2
        : before
          ? before.position + 1000
          : (after?.position ?? 1000) - 1000;

    const stage = stages[index];
    if (!stage) return;
    run(() => reorderStage({ id: stage.id, position }));
  }

  const reassignTargets = stages.filter((stage) => stage.id !== deleting?.id);
  /* Same reason as the deal form: the trigger falls back to the raw id when the
     root has no value→label map. */
  const reassignItems = reassignTargets.map((stage) => ({ value: stage.id, label: stage.name }));

  return (
    <div className="space-y-5">
      <ul className="divide-y divide-border rounded-lg border">
        {stages.map((stage, index) => (
          <li key={stage.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex shrink-0 flex-col">
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                disabled={isPending || index === 0}
                aria-label={t("moveUp", { name: stage.name })}
                onClick={() => move(index, -1)}
              >
                <ArrowUpIcon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                disabled={isPending || index === stages.length - 1}
                aria-label={t("moveDown", { name: stage.name })}
                onClick={() => move(index, 1)}
              >
                <ArrowDownIcon className="size-3.5" />
              </Button>
            </div>

            <Input
              defaultValue={stage.name}
              disabled={isPending}
              aria-label={t("stageName")}
              className="max-w-56 flex-1"
              onBlur={(event) => {
                const name = event.target.value.trim();
                if (name === "" || name === stage.name) return;
                run(() => updateStage({ id: stage.id, name, probability: stage.probability }));
              }}
            />

            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                max={100}
                defaultValue={stage.probability}
                disabled={isPending || stage.isWon || stage.isLost}
                aria-label={t("probability")}
                className="w-20"
                onBlur={(event) => {
                  const probability = Number(event.target.value);
                  if (!Number.isFinite(probability) || probability === stage.probability) return;
                  run(() => updateStage({ id: stage.id, name: stage.name, probability }));
                }}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>

            {stage.isWon ? <Badge>{t("wonStage")}</Badge> : null}
            {stage.isLost ? <Badge variant="outline">{t("lostStage")}</Badge> : null}

            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {t("stageDealCount", { count: stage.dealCount })}
            </span>

            <Button
              variant="ghost"
              size="icon"
              disabled={isPending || stage.isWon || stage.isLost}
              aria-label={tCommon("delete")}
              onClick={() => {
                setDeleting(stage);
                setMoveTarget(stages.find((s) => s.id !== stage.id)?.id ?? "");
              }}
            >
              <TrashIcon className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
          <Field className="flex-1">
            <FieldLabel htmlFor="newStage">{t("stageName")}</FieldLabel>
            <Input
              id="newStage"
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
          </Field>
          <Field className="w-28">
            <FieldLabel htmlFor="newProbability">{t("probability")}</FieldLabel>
            <Input
              id="newProbability"
              type="number"
              min={0}
              max={100}
              value={newProbability}
              onChange={(event) => setNewProbability(event.target.value)}
            />
          </Field>
          <Button
            disabled={isPending || newName.trim() === ""}
            onClick={() =>
              run(
                () =>
                  createStage({
                    pipelineId,
                    name: newName.trim(),
                    probability: Number(newProbability),
                  }),
                t("stageCreated"),
              )
            }
          >
            {tCommon("create")}
          </Button>
          <Button variant="outline" onClick={() => setAdding(false)} disabled={isPending}>
            {tCommon("cancel")}
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <PlusIcon className="size-4" />
          {t("addStage")}
        </Button>
      )}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteStageTitle", { name: deleting?.name ?? "" })}</DialogTitle>
            <DialogDescription>
              {/* Deals are moved, never deleted. Losing a column must not lose
                  the pipeline value sitting in it. */}
              {t("deleteStageBody", { count: deleting?.dealCount ?? 0 })}
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="moveTarget">{t("moveDealsTo")}</FieldLabel>
            <Select
              items={reassignItems}
              value={moveTarget}
              onValueChange={(value) => value && setMoveTarget(value)}
            >
              <SelectTrigger id="moveTarget">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reassignTargets.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={isPending || moveTarget === ""}
              onClick={() => {
                if (!deleting) return;
                run(
                  () => deleteStage({ id: deleting.id, moveDealsToStageId: moveTarget }),
                  t("stageDeleted"),
                );
                setDeleting(null);
              }}
            >
              {tCommon("delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
