"use client";

// shadcn (Base UI 版) の Dialog を写したもの
// 振る舞いは Base UI に任せ、見た目は globals.css のトークンで書き直している

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { XIcon } from "lucide-react";
import type { ComponentProps, ReactElement } from "react";

/**
 * ダイアログの開閉の状態を持つ根
 */
export const Dialog = (props: DialogPrimitive.Root.Props): ReactElement => {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
};

/**
 * 押すとダイアログを開くボタン
 */
export const DialogTrigger = (
  props: DialogPrimitive.Trigger.Props,
): ReactElement => {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
};

/**
 * 押すとダイアログを閉じるボタン
 */
export const DialogClose = (
  props: DialogPrimitive.Close.Props,
): ReactElement => {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
};

const DialogPortal = (props: DialogPrimitive.Portal.Props): ReactElement => {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
};

const DialogOverlay = ({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props): ReactElement => {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/30 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
};

const closeButtonClass =
  "absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-md text-muted outline-none transition-colors hover:bg-neutral-bg hover:text-ink focus-visible:ring-3 focus-visible:ring-accent-border";

type DialogContentProps = DialogPrimitive.Popup.Props & {
  /** 右上の閉じるボタン。既定は出す */
  showCloseButton?: boolean;
};

/**
 * Portal + 背景 + 本体。中央に固定し、sm 以上で最大 28rem
 */
export const DialogContent = ({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogContentProps): ReactElement => {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-surface p-5 text-ink shadow-lg outline-none sm:max-w-md data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className={closeButtonClass}
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : undefined}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
};

/**
 * 題名と説明を縦に並べる枠
 */
export const DialogHeader = ({
  className,
  ...props
}: ComponentProps<"div">): ReactElement => {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
};

/**
 * 本体の下端に付くボタンの行
 *
 * 本体の padding を打ち消して左右と下の縁まで地色を敷く
 */
export const DialogFooter = ({
  className,
  ...props
}: ComponentProps<"div">): ReactElement => {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-5 -mb-5 flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-card-inner p-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
};

/**
 * ダイアログの題名 (読み上げではダイアログの名前になる)
 */
export const DialogTitle = ({
  className,
  ...props
}: DialogPrimitive.Title.Props): ReactElement => {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  );
};

/**
 * ダイアログの説明 (読み上げではダイアログの説明になる)
 */
export const DialogDescription = ({
  className,
  ...props
}: DialogPrimitive.Description.Props): ReactElement => {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted", className)}
      {...props}
    />
  );
};
