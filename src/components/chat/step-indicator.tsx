"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import type { TripResponse } from "@/lib/secretary-response";
import type { Stage } from "./flow";
import { STEP_ORDER, stepIndexOf } from "./flow";
import type { Activity } from "./types";

type StepStatus = "done" | "current" | "todo";

const stepCircleClass = {
  done: "bg-ok text-white",
  current: "bg-accent text-white",
  todo: "bg-neutral-bg text-faint",
} as const satisfies Record<StepStatus, string>;

const stepLabelClass = {
  done: "text-muted",
  current: "font-semibold text-ink",
  todo: "text-muted",
} as const satisfies Record<StepStatus, string>;

const statusOf = (index: number, current: number): StepStatus => {
  if (index < current) {
    return "done";
  }

  if (index === current) {
    return "current";
  }

  return "todo";
};

type StepItemProps = {
  step: Stage;
  index: number;
  status: StepStatus;
};

const StepItem = ({ step, index, status }: StepItemProps): ReactElement => {
  const t = useTranslations("Conversation");

  return (
    <li
      className="flex items-center"
      aria-current={status === "current" ? "step" : undefined}
    >
      {index === 0 ? undefined : (
        <span
          className="mx-2 h-0.5 w-2.5 bg-divider-strong"
          aria-hidden="true"
        />
      )}
      <span
        className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-semibold tabular-nums ${stepCircleClass[status]}`}
      >
        {status === "done" ? "✓" : index + 1}
      </span>
      <span className={`ml-2 text-sm ${stepLabelClass[status]}`}>
        {t(`steps.${step}`)}
      </span>
    </li>
  );
};

type StepIndicatorProps = {
  activity: Activity;
  trip?: TripResponse;
};

/**
 * 提案 / 承認 / 支払い / カレンダー登録 の 4 段
 *
 * 済んだ段は緑の ✓、いまの段は強調、残りは薄く出す
 */
export const StepIndicator = ({
  activity,
  trip,
}: StepIndicatorProps): ReactElement => {
  const current = stepIndexOf(activity, trip);

  return (
    <ol className="flex flex-wrap items-center gap-y-2">
      {STEP_ORDER.map((step, index) => (
        <StepItem
          key={step}
          step={step}
          index={index}
          status={statusOf(index, current)}
        />
      ))}
    </ol>
  );
};
