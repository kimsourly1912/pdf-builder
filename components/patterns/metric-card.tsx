import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type MetricCardTone = "neutral" | "primary" | "success" | "warning";

type MetricCardProps = {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  description?: string;
  tone?: MetricCardTone;
  className?: string;
};

const toneClassNames: Record<MetricCardTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
};

function MetricCard(props: MetricCardProps) {
  const tone = props.tone ?? "neutral";

  return (
    <Card data-slot="metric-card" className={cn("gap-0 py-0", props.className)}>
      <CardContent className="flex items-center gap-4 p-5">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
            toneClassNames[tone],
          )}
        >
          {props.icon}
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums">{props.value}</p>
          <p className="text-xs font-medium text-muted-foreground">
            {props.label}
          </p>
          {props.description && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {props.description}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export { MetricCard };
export type { MetricCardProps, MetricCardTone };
