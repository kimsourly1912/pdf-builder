import {
  CircleCheck,
  CircleDot,
  CircleMinus,
  Clock3,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusTone = "danger" | "info" | "neutral" | "success" | "warning";

type StatusBadgeProps = {
  label: string;
  tone?: StatusTone;
  icon?: ReactNode;
  className?: string;
};

const toneClassNames: Record<StatusTone, string> = {
  danger: "border-destructive/25 bg-destructive/10 text-destructive",
  info: "border-info/25 bg-info/10 text-info-foreground",
  neutral: "border-border bg-muted text-muted-foreground",
  success: "border-success/25 bg-success/10 text-success-foreground",
  warning: "border-warning/25 bg-warning/10 text-warning-foreground",
};

const toneIcons: Record<StatusTone, ReactNode> = {
  danger: <TriangleAlert />,
  info: <CircleDot />,
  neutral: <CircleMinus />,
  success: <CircleCheck />,
  warning: <Clock3 />,
};

function StatusBadge(props: StatusBadgeProps) {
  const tone = props.tone ?? "neutral";

  return (
    <Badge
      data-slot="status-badge"
      variant="outline"
      className={cn("capitalize", toneClassNames[tone], props.className)}
    >
      {props.icon ?? toneIcons[tone]}
      {props.label}
    </Badge>
  );
}

export { StatusBadge };
export type { StatusBadgeProps, StatusTone };
