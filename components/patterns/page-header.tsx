import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
};

function PageHeader(props: PageHeaderProps) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        props.className,
      )}
    >
      <div className="min-w-0">
        {props.eyebrow && (
          <Badge variant="secondary" className="mb-2 rounded-md font-medium">
            {props.eyebrow}
          </Badge>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">
          {props.title}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
          {props.description}
        </p>
      </div>
      {props.actions && (
        <div className="flex shrink-0 flex-wrap gap-2">{props.actions}</div>
      )}
    </div>
  );
}

export { PageHeader };
export type { PageHeaderProps };
