"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import {
  cardClass,
  faintLabelClass,
  labelClass,
} from "@/components/chat/styles";
import { useFormatNumber } from "@/components/chat/use-format-number";
import type { MstBalance } from "@/server/wallet/read-mst-balance";

type Props = {
  balance: MstBalance;
};

/**
 * 保有しているデモトークンの残高を出すカード
 *
 * 残高はまだ固定値なので、その旨をカードの中に添える (`readMstBalance`)
 */
export const BalanceCard = ({ balance }: Props): ReactElement => {
  const t = useTranslations("Home");
  const formatNumber = useFormatNumber();

  return (
    <div
      className={`${cardClass} flex flex-wrap items-end justify-between gap-4`}
    >
      <div>
        <p className={labelClass}>{t("balance.title")}</p>
        <p className="mt-1 text-[28px] font-bold tabular-nums">
          {formatNumber(balance.amount)}{" "}
          <span className="text-[15px] font-semibold text-muted">
            {balance.symbol}
          </span>
        </p>
      </div>
      <p className={faintLabelClass}>{t("balance.note")}</p>
    </div>
  );
};
