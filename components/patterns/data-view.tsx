import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DataViewProps = {
  children: ReactNode;
  className?: string;
};

type DataViewHeaderProps = {
  children: ReactNode;
  className?: string;
};

type DataViewContentProps = {
  children: ReactNode;
  className?: string;
};

function DataView(props: DataViewProps) {
  return (
    <Card
      data-slot="data-view"
      className={cn("gap-0 overflow-hidden py-0 shadow-none", props.className)}
    >
      {props.children}
    </Card>
  );
}

function DataViewHeader(props: DataViewHeaderProps) {
  return (
    <div
      data-slot="data-view-header"
      className={cn(
        "flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}

function DataViewContent(props: DataViewContentProps) {
  return (
    <div data-slot="data-view-content" className={cn("min-w-0", props.className)}>
      {props.children}
    </div>
  );
}

export { DataView, DataViewContent, DataViewHeader };
export type { DataViewContentProps, DataViewHeaderProps, DataViewProps };
