"use client";

// shadcn (Base UI 版) の Switch を写したもの
// 振る舞いは Base UI に任せ、見た目は globals.css のトークンで書き直している
// shadcn の size のうち、既定の大きさだけを持つ

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "cn";
import type { ReactElement } from "react";

/**
 * トグル。size は 1 つ (32 x 18px)
 */
export const Switch = ({
  className,
  ...props
}: SwitchPrimitive.Root.Props): ReactElement => {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-3 focus-visible:ring-accent-border data-checked:bg-accent data-unchecked:bg-ghost-border data-disabled:cursor-default data-disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 rounded-full bg-white shadow-sm transition-transform data-checked:translate-x-[calc(100%-2px)] data-unchecked:translate-x-0"
      />
    </SwitchPrimitive.Root>
  );
};
