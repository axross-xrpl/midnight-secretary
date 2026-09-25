"use client";

// shadcn (Base UI 版) の Tabs を写したもの
// 振る舞い (role と矢印キーの移動) は Base UI に任せ、見た目は globals.css のトークンで書き直している
// shadcn の variant のうち、下線のタブ (line) だけを持つ

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "cn";
import type { ReactElement } from "react";

/**
 * 表示中のタブの値を持つ根 (タブ行と中身を縦に並べる)
 */
export const Tabs = ({
  className,
  ...props
}: TabsPrimitive.Root.Props): ReactElement => {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col", className)}
      {...props}
    />
  );
};

/**
 * 下線のタブ行 (`border-b border-border`)。variant は持たない
 */
export const TabsList = ({
  className,
  ...props
}: TabsPrimitive.List.Props): ReactElement => {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "flex items-center gap-1 border-b border-border",
        className,
      )}
      {...props}
    />
  );
};

/**
 * 1 つのタブ。表示中は accent の下線と文字色
 */
export const TabsTrigger = ({
  className,
  ...props
}: TabsPrimitive.Tab.Props): ReactElement => {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "-mb-px border-b-2 border-transparent px-4 py-2.5 text-[13px] font-semibold text-muted outline-none focus-visible:ring-3 focus-visible:ring-accent-border data-active:border-accent data-active:text-accent",
        className,
      )}
      {...props}
    />
  );
};

/**
 * 1 つのタブの中身
 */
export const TabsContent = ({
  className,
  ...props
}: TabsPrimitive.Panel.Props): ReactElement => {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(
        "outline-none focus-visible:ring-3 focus-visible:ring-accent-border",
        className,
      )}
      {...props}
    />
  );
};
