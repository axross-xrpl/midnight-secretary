"use client";

// shadcn (Base UI) の Tabs。振る舞い (role / 矢印キー) だけ借り、見た目は globals.css のトークンに置き換えている
// line は下線のタブ (予定一覧の参考実装の見た目)、default は面の中で切り替えるピル

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className,
      )}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list flex items-center text-muted group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "w-fit gap-1 rounded-lg bg-card-inner p-1",
        line: "gap-1 border-b border-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium text-muted transition-colors outline-none group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-ink focus-visible:ring-3 focus-visible:ring-accent-border disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=default]/tabs-list:rounded-md group-data-[variant=default]/tabs-list:px-3 group-data-[variant=default]/tabs-list:py-1 group-data-[variant=default]/tabs-list:text-sm group-data-[variant=default]/tabs-list:data-active:bg-surface group-data-[variant=default]/tabs-list:data-active:text-ink group-data-[variant=default]/tabs-list:data-active:shadow-sm",
        "group-data-[variant=line]/tabs-list:-mb-px group-data-[variant=line]/tabs-list:border-b-2 group-data-[variant=line]/tabs-list:border-transparent group-data-[variant=line]/tabs-list:px-4 group-data-[variant=line]/tabs-list:py-2.5 group-data-[variant=line]/tabs-list:text-base group-data-[variant=line]/tabs-list:data-active:border-accent group-data-[variant=line]/tabs-list:data-active:text-accent",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
