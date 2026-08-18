"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, MoveRightIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { centsToMajorUnit } from "@/lib/money";
import { cn } from "@/lib/utils";
import { moveDeal } from "./actions";
import { LostReasonDialog } from "./lost-reason-dialog";
import type { Board, BoardCard, BoardStage } from "./queries";

/** Gap left between fractional positions when appending. */
const POSITION_GAP = 1000;

/**
 * Computes the fractional position for a card dropped at `index` in `cards`.
 *
 * Halving the gap between neighbours writes one row instead of renumbering the
 * column. `numeric` in Postgres has arbitrary precision, so repeated halving
 * cannot silently collapse two cards onto the same value the way a float would.
 */
function positionFor(cards: BoardCard[], index: number): number {
  const prev = index > 0 ? cards[index - 1]?.position : undefined;
  const next = cards[index]?.position;

  if (prev === undefined && next === undefined) return POSITION_GAP;
  if (prev === undefined) return Number(next) - POSITION_GAP;
  if (next === undefined) return Number(prev) + POSITION_GAP;
  return (Number(prev) + Number(next)) / 2;
}

function DealCard({
  card,
  stages,
  currentStageId,
  onMoveTo,
  dragging,
}: {
  card: BoardCard;
  stages: BoardStage[];
  currentStageId: string;
  onMoveTo: (stageId: string) => void;
  dragging?: boolean;
}) {
  const t = useTranslations("pipeline");
  const format = useFormatter();
  // A stable per-render timestamp rather than Date.now(): calling the clock
  // during render is impure, and it would also make the server and client
  // renders disagree, which is a hydration mismatch waiting to happen.
  const now = useNow();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", stageId: currentStageId },
  });

  const daysInStage = Math.floor(
    (now.getTime() - new Date(card.stage_entered_at).getTime()) / 86_400_000,
  );

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "rounded-lg border bg-card p-3 shadow-xs",
        isDragging && "opacity-40",
        dragging && "rotate-2 shadow-lg",
      )}
    >
      <div className="flex items-start gap-1.5">
        {/*
          The drag handle carries the dnd-kit listeners, not the whole card, so
          the links inside stay clickable and text stays selectable.
        */}
        <button
          type="button"
          className="-ml-1 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={t("dragHandle", { title: card.title })}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-4" />
        </button>

        <div className="min-w-0 flex-1">
          <Link
            href={`/deals/${card.id}`}
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            {card.title}
          </Link>

          <p className="mt-1 text-sm font-semibold tabular-nums">
            {format.number(centsToMajorUnit(card.value_cents), {
              style: "currency",
              currency: card.currency,
              maximumFractionDigits: 0,
            })}
          </p>

          {card.company || card.contact ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {card.company?.name ?? card.contact?.name}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {daysInStage >= 14 ? (
              <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
                {t("daysInStage", { days: daysInStage })}
              </Badge>
            ) : null}
            {card.owner?.name ? (
              <span className="text-xs text-muted-foreground">{card.owner.name}</span>
            ) : null}
          </div>
        </div>

        {/*
          Non-drag fallback. Dragging is unusable with a screen reader, awkward
          on a phone, and impossible for some motor impairments — every card
          must be movable without it.
        */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label={t("moveTo", { title: card.title })}
              />
            }
          >
            <MoveRightIcon className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {t("moveToStage")}
            </DropdownMenuLabel>
            {stages.map((stage) => (
              <DropdownMenuItem
                key={stage.id}
                disabled={stage.id === currentStageId}
                onClick={() => onMoveTo(stage.id)}
              >
                {stage.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function StageColumn({
  stage,
  stages,
  onMoveTo,
}: {
  stage: BoardStage;
  stages: BoardStage[];
  onMoveTo: (cardId: string, stageId: string) => void;
}) {
  const t = useTranslations("pipeline");
  const format = useFormatter();
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { type: "stage" } });

  const currency = stage.cards[0]?.currency ?? "EUR";
  const money = (cents: number) =>
    format.number(centsToMajorUnit(cents), {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 px-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            {stage.name}
            {stage.is_won ? <span className="size-1.5 rounded-full bg-emerald-500" /> : null}
            {stage.is_lost ? <span className="size-1.5 rounded-full bg-muted-foreground" /> : null}
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {format.number(stage.deal_count)}
          </span>
        </div>
        <p className="mt-0.5 text-sm font-semibold tabular-nums">{money(stage.total_cents)}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {t("weightedShort", { value: money(stage.weighted_cents), percent: stage.probability })}
        </p>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2 rounded-lg bg-muted/40 p-2 transition-colors",
          isOver && "bg-primary/5 ring-2 ring-primary/30",
        )}
      >
        <SortableContext
          items={stage.cards.map((card) => card.id)}
          strategy={verticalListSortingStrategy}
        >
          {stage.cards.map((card) => (
            <DealCard
              key={card.id}
              card={card}
              stages={stages}
              currentStageId={stage.id}
              onMoveTo={(stageId) => onMoveTo(card.id, stageId)}
            />
          ))}
        </SortableContext>

        {stage.cards.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">{t("emptyStage")}</p>
        ) : null}

        {stage.deal_count > stage.cards.length ? (
          <p className="px-1 pt-1 text-center text-xs text-muted-foreground">
            {t("moreCards", { count: stage.deal_count - stage.cards.length })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function KanbanBoard({ board }: { board: Board }) {
  const t = useTranslations("pipeline");
  const tError = useTranslations("errors.action");
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Local mirror so a drag lands instantly. The server is the source of truth;
  // this is rolled back if the write fails.
  const [stages, setStages] = useState<BoardStage[]>(board.stages);
  const [activeCard, setActiveCard] = useState<BoardCard | null>(null);
  const [pendingLost, setPendingLost] = useState<{
    cardId: string;
    stageId: string;
    position: number;
  } | null>(null);

  // Re-sync when the server sends fresh data (filters, refresh after a write).
  const [syncedTo, setSyncedTo] = useState(board);
  if (syncedTo !== board) {
    setSyncedTo(board);
    setStages(board.stages);
  }

  const sensors = useSensors(
    // A small distance threshold keeps a click on the handle from starting a
    // drag, so the card's links and menu still work.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const cardIndex = useMemo(() => {
    const map = new Map<string, { card: BoardCard; stageId: string }>();
    for (const stage of stages) {
      for (const card of stage.cards) map.set(card.id, { card, stageId: stage.id });
    }
    return map;
  }, [stages]);

  function commit(cardId: string, stageId: string, position: number, lostReason?: string | null) {
    const snapshot = stages;

    setStages((current) => {
      const entry = cardIndex.get(cardId);
      if (!entry) return current;

      const moved = { ...entry.card, position };
      return current.map((stage) => {
        const without = stage.cards.filter((card) => card.id !== cardId);

        if (stage.id !== stageId) {
          if (stage.id !== entry.stageId) return stage;
          const delta = entry.card.value_cents;
          return {
            ...stage,
            cards: without,
            deal_count: Math.max(0, stage.deal_count - 1),
            total_cents: stage.total_cents - delta,
            weighted_cents: stage.weighted_cents - Math.round((delta * stage.probability) / 100),
          };
        }

        const cards = [...without, moved].sort((a, b) => Number(a.position) - Number(b.position));
        const isNewHere = entry.stageId !== stageId;
        const delta = entry.card.value_cents;

        return {
          ...stage,
          cards,
          deal_count: isNewHere ? stage.deal_count + 1 : stage.deal_count,
          total_cents: isNewHere ? stage.total_cents + delta : stage.total_cents,
          weighted_cents: isNewHere
            ? stage.weighted_cents + Math.round((delta * stage.probability) / 100)
            : stage.weighted_cents,
        };
      });
    });

    startTransition(async () => {
      const result = await moveDeal({
        id: cardId,
        stageId,
        position,
        lostReason: lostReason ?? null,
      });
      if (!result.ok) {
        setStages(snapshot);
        const key = result.error.key as Parameters<typeof tError>[0];
        toast.error(tError.has(key) ? tError(key) : tError("unexpected"));
        return;
      }
      router.refresh();
    });
  }

  function requestMove(cardId: string, stageId: string, position: number) {
    const target = stages.find((stage) => stage.id === stageId);
    const from = cardIndex.get(cardId);
    if (!target || !from || from.stageId === stageId) {
      if (from && from.stageId === stageId) commit(cardId, stageId, position);
      return;
    }

    // Losing a deal without recording why makes the loss data worthless later.
    if (target.is_lost) {
      setPendingLost({ cardId, stageId, position });
      return;
    }

    commit(cardId, stageId, position);
  }

  function onDragStart(event: DragStartEvent) {
    setActiveCard(cardIndex.get(String(event.active.id))?.card ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    const from = cardIndex.get(String(active.id));
    if (!from) return;

    // `over` is either a column (empty space) or another card.
    const overId = String(over.id);
    const overCard = cardIndex.get(overId);
    const targetStageId = overCard?.stageId ?? overId;

    const target = stages.find((stage) => stage.id === targetStageId);
    if (!target) return;

    const others = target.cards.filter((card) => card.id !== active.id);
    const insertAt = overCard ? others.findIndex((card) => card.id === overId) : others.length;
    const index = insertAt === -1 ? others.length : insertAt;

    if (from.stageId === targetStageId) {
      const currentIndex = target.cards.findIndex((card) => card.id === active.id);
      if (currentIndex === index) return;
    }

    requestMove(String(active.id), targetStageId, positionFor(others, index));
  }

  function moveToStage(cardId: string, stageId: string) {
    const target = stages.find((stage) => stage.id === stageId);
    if (!target) return;
    // Menu moves go to the top of the target column.
    requestMove(cardId, stageId, positionFor(target.cards, 0));
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveCard(null)}
        accessibility={{
          // Screen-reader narration for the keyboard drag path. Without these
          // a keyboard user gets silence and has no idea what moved where.
          announcements: {
            onDragStart: ({ active }) =>
              t("a11yPickedUp", { title: cardIndex.get(String(active.id))?.card.title ?? "" }),
            onDragOver: ({ active, over }) =>
              over
                ? t("a11yOver", {
                    title: cardIndex.get(String(active.id))?.card.title ?? "",
                    stage:
                      stages.find(
                        (stage) =>
                          stage.id === (cardIndex.get(String(over.id))?.stageId ?? String(over.id)),
                      )?.name ?? "",
                  })
                : undefined,
            onDragEnd: () => t("a11yDropped"),
            onDragCancel: () => t("a11yCancelled"),
          },
        }}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <StageColumn key={stage.id} stage={stage} stages={stages} onMoveTo={moveToStage} />
          ))}
        </div>

        <DragOverlay>
          {activeCard ? (
            <div className="w-72 rotate-2 rounded-lg border bg-card p-3 shadow-lg">
              <p className="text-sm font-medium">{activeCard.title}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <LostReasonDialog
        open={pendingLost !== null}
        onCancel={() => setPendingLost(null)}
        onConfirm={(reason) => {
          if (!pendingLost) return;
          commit(pendingLost.cardId, pendingLost.stageId, pendingLost.position, reason);
          setPendingLost(null);
        }}
      />
    </>
  );
}
