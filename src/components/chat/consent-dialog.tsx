"use client";

import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * 年齢の証明を送るかの問い (年齢確認を求める店と年齢の下限)
 */
export type ConsentRequest = {
  place: string;
  ageLimit: number;
};

type ConsentDialogProps = {
  request: ConsentRequest;

  /** Escape や背景のクリックで閉じたとき (「今はやめておく」と同じ) */
  onDecline: () => void;

  /** 返答ボタン (証明を送る / 今はやめておく) */
  children: ReactNode;
};

/**
 * 年齢の証明を送るかを問うモーダル
 *
 * 描かれている間は開いたままで、閉じるのは親が外すことで行う (返答ボタンが状態を進める)
 * 題名は設定画面の「年齢確認」の文言を借りる
 */
export const ConsentDialog = ({
  request,
  onDecline,
  children,
}: ConsentDialogProps): ReactElement => {
  const t = useTranslations("Conversation");
  const tProfile = useTranslations("ProfileSettings");

  // 開いたままにするので、閉じようとしたときだけ断ったことにする
  const handleOpenChange = (open: boolean): void => {
    if (!open) {
      onDecline();
    }
  };

  return (
    <Dialog open={true} onOpenChange={handleOpenChange}>
      {/* 返答は 2 つのボタンだけにし、閉じる X で「やめる」を 2 通りにしない */}
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{tProfile("verifications.age")}</DialogTitle>
          <DialogDescription>
            {t("lines.askProof", {
              place: request.place,
              age: request.ageLimit,
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-col">{children}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
