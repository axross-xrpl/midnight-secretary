"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { match } from "ts-pattern";
import type {
  PlaceOfferResponse,
  SettlementVisibilityResponse,
  TripPlanResponse,
} from "@/lib/secretary-response";
import type { PlanVisibility } from "./conversation";
import type { VisibilityCategory } from "./flow";
import type { PlanDiff, PlanRow } from "./format";
import {
  DATE_OPTIONS,
  moneyText,
  nightsOf,
  plainSpaces,
  planRows,
  TIMED_OPTIONS,
} from "./format";
import type { VendorKind } from "./styles";
import {
  labelClass,
  neutralPillClass,
  privatePillClass,
  vendorMark,
} from "./styles";
import { useFormatNumber } from "./use-format-number";

/**
 * 候補 1 件の公開範囲を切り替える
 */
export type VisibilityChangeHandler = (
  category: VisibilityCategory,
  value: SettlementVisibilityResponse,
) => void;

// トグルは非公開の入切なので、チェックの有無をそのまま公開範囲に写す
const visibilityOfChecked = (
  checked: boolean,
): SettlementVisibilityResponse => {
  if (checked) {
    return "private";
  }

  return "public";
};

type VendorCircleProps = {
  kind: VendorKind;
};

const VendorCircle = ({ kind }: VendorCircleProps): ReactElement => {
  return (
    <span
      className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-xs text-white ${vendorMark[kind].circleClass}`}
      aria-hidden="true"
    >
      {vendorMark[kind].icon}
    </span>
  );
};

type PrivateToggleProps = {
  category: VisibilityCategory;
  checked: boolean;
  disabled: boolean;
  onChange: VisibilityChangeHandler;
};

const PrivateToggle = ({
  category,
  checked,
  disabled,
  onChange,
}: PrivateToggleProps): ReactElement => {
  const t = useTranslations("Conversation");

  return (
    <label className={`flex flex-none items-center gap-1.5 ${labelClass}`}>
      {/* switch は checked の対応づけを暗黙に頼らず aria-checked も持たせる */}
      <input
        type="checkbox"
        role="switch"
        className="cursor-pointer accent-accent disabled:cursor-default disabled:opacity-40"
        checked={checked}
        aria-checked={checked}
        disabled={disabled}
        onChange={(event) =>
          onChange(category, visibilityOfChecked(event.target.checked))
        }
      />
      {t("plan.privateToggle")}
    </label>
  );
};

type VisibilityBadgeProps = {
  chosen: SettlementVisibilityResponse;
};

const VisibilityBadge = ({ chosen }: VisibilityBadgeProps): ReactElement => {
  const t = useTranslations("Conversation");

  return (
    <span
      className={chosen === "private" ? privatePillClass : neutralPillClass}
    >
      {t(`plan.visibility.${chosen}`)}
    </span>
  );
};

type RowVisibilityProps = {
  category: VisibilityCategory;
  visibility: PlanVisibility;
  onChange: VisibilityChangeHandler;
};

// 提案済みで選べるときはトグル、承認済み以降は記録された公開範囲のバッジ
const RowVisibility = ({
  category,
  visibility,
  onChange,
}: RowVisibilityProps): ReactElement => {
  return match(visibility)
    .with({ mode: "editor" }, ({ value, disabled }) => (
      <PrivateToggle
        category={category}
        checked={value[category] === "private"}
        disabled={disabled}
        onChange={onChange}
      />
    ))
    .with({ mode: "badges" }, ({ value }) => (
      <VisibilityBadge chosen={value[category] ?? "public"} />
    ))
    .exhaustive();
};

type PlaceBodyProps = {
  kind: "dining" | "leisure";
  offer: PlaceOfferResponse;
};

// 飲食とレジャーの行の中身は同じ形で、名前と genre、都市と年齢の下限のバッジ (価格と公開範囲は行の枠が出す)
const PlaceBody = ({ kind, offer }: PlaceBodyProps): ReactElement => {
  const t = useTranslations("Conversation");
  const nameKey = kind === "dining" ? "plan.dining" : "plan.leisure";
  const name =
    offer.genre === undefined
      ? offer.name
      : t(nameKey, { name: offer.name, genre: offer.genre });

  return (
    <>
      <VendorCircle kind={kind} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium">{name}</span>
        {/* 年齢の下限は文言に混ぜず、バッジで出す */}
        <span className={`flex flex-wrap items-center gap-2 ${labelClass}`}>
          {offer.city}
          {offer.ageLimit === undefined ? undefined : (
            <span className={neutralPillClass}>
              {t("plan.ageLimit", { age: offer.ageLimit })}
            </span>
          )}
        </span>
      </span>
    </>
  );
};

type TripItemBodyProps = {
  row: PlanRow;
};

// 行の中身 (事業者のアイコン、見出し、時刻と事業者名)
const TripItemBody = ({ row }: TripItemBodyProps): ReactElement => {
  const t = useTranslations("Conversation");
  const format = useFormatter();

  return match(row)
    .with({ kind: "transport" }, ({ offer }) => (
      <>
        <VendorCircle kind={offer.mode} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">
            {t("plan.transport", {
              from: offer.origin,
              to: offer.destination,
              mode: t(`plan.modes.${offer.mode}`),
            })}
          </span>
          <span className={`block tabular-nums ${labelClass}`}>
            {plainSpaces(
              format.dateTimeRange(
                new Date(offer.departAt),
                new Date(offer.arriveAt),
                TIMED_OPTIONS,
              ),
            )}
            {" · "}
            {offer.vendor}
          </span>
        </span>
      </>
    ))
    .with({ kind: "lodging" }, ({ offer }) => (
      <>
        <VendorCircle kind="lodging" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">
            {t("plan.lodging", {
              hotel: offer.name,
              nights: nightsOf(offer.checkIn, offer.checkOut),
            })}
          </span>
          <span className={`block tabular-nums ${labelClass}`}>
            {plainSpaces(
              format.dateTimeRange(
                new Date(offer.checkIn),
                new Date(offer.checkOut),
                DATE_OPTIONS,
              ),
            )}
            {" · "}
            {offer.vendor}
          </span>
        </span>
      </>
    ))
    .with({ kind: "dining" }, ({ offer }) => (
      <PlaceBody kind="dining" offer={offer} />
    ))
    .with({ kind: "leisure" }, ({ offer }) => (
      <PlaceBody kind="leisure" offer={offer} />
    ))
    .exhaustive();
};

// 前の提案から変わった行と合計に付ける背景 (吹き出しの px-4 の中で左右に 8px はみ出させ、背景を文字より広く見せる)
const changedRowClass = "-mx-2 rounded-md bg-note-bg px-2";

const rowClass = "flex flex-wrap items-center gap-2.5 py-2";

const totalClass =
  "mt-0.5 flex flex-wrap items-baseline justify-end gap-2 border-t-2 border-divider-strong pt-2.5";

type TripItemRowProps = {
  row: PlanRow;
  changed: boolean;
  visibility?: PlanVisibility;
  onVisibilityChange: VisibilityChangeHandler;
};

const TripItemRow = ({
  row,
  changed,
  visibility,
  onVisibilityChange,
}: TripItemRowProps): ReactElement => {
  const t = useTranslations("Conversation");
  const formatNumber = useFormatNumber();

  return (
    <li className={changed ? `${rowClass} ${changedRowClass}` : rowClass}>
      <TripItemBody row={row} />
      <span className="text-[13px] font-bold tabular-nums">
        {moneyText(row.offer.price, formatNumber)}
      </span>
      {/* 色だけに頼らないよう、変わった行には読み上げ用の文言を置く */}
      {changed ? (
        <span className="sr-only">{t("plan.changed")}</span>
      ) : undefined}
      {visibility === undefined ? undefined : (
        <RowVisibility
          category={row.category}
          visibility={visibility}
          onChange={onVisibilityChange}
        />
      )}
    </li>
  );
};

// 差分があり、その行の category が変わった行に入っていれば変わった行 (差分が無ければ変わっていない)
const isChangedRow = (diff: PlanDiff | undefined, row: PlanRow): boolean => {
  return diff?.rows.includes(row.category) ?? false;
};

type PlanDetailsProps = {
  plan: TripPlanResponse;
  visibility?: PlanVisibility;
  diff?: PlanDiff;
  onVisibilityChange: VisibilityChangeHandler;
};

/**
 * 計画の中身 (往路、あれば宿、あれば飲食、あればレジャー、復路、合計、理由)
 *
 * 提案の吹き出しの中に置く
 * `visibility` があれば候補ごとに公開範囲のトグルかバッジを並べる
 * `diff` があれば前の提案から変わった行と合計に背景色を付ける
 */
export const PlanDetails = ({
  plan,
  visibility,
  diff,
  onVisibilityChange,
}: PlanDetailsProps): ReactElement => {
  const t = useTranslations("Conversation");
  const formatNumber = useFormatNumber();

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y divide-border-sub">
        {planRows(plan).map((row) => (
          <TripItemRow
            key={row.offer.id}
            row={row}
            changed={isChangedRow(diff, row)}
            visibility={visibility}
            onVisibilityChange={onVisibilityChange}
          />
        ))}
      </ul>
      <div
        className={
          diff?.total === true ? `${totalClass} ${changedRowClass}` : totalClass
        }
      >
        <span className="text-xs text-muted">{t("plan.total")}</span>
        <span className="text-[19px] font-bold tabular-nums">
          {moneyText(plan.total, formatNumber)}
        </span>
      </div>
      <div className="mt-3 border-t border-dashed border-divider-strong pt-2.5">
        <div className="mb-1 text-xs font-semibold text-accent">
          {t("plan.rationale")}
        </div>
        <p className="text-[12px] leading-relaxed text-muted">
          {plan.rationale}
        </p>
      </div>
    </div>
  );
};
