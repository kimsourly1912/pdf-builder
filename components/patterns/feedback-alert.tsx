import { CircleCheck, CircleHelp, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type FeedbackTone = "error" | "info" | "success" | "warning";

type FeedbackAlertProps = {
  title: string;
  description: ReactNode;
  tone?: FeedbackTone;
  className?: string;
};

const toneClassNames: Record<FeedbackTone, string> = {
  error:
    "border-destructive/25 bg-destructive/10 text-destructive [&_[data-slot=alert-description]]:text-destructive/85",
  info:
    "border-info/25 bg-info/10 text-info-foreground [&_[data-slot=alert-description]]:text-info-foreground/80",
  success:
    "border-success/25 bg-success/10 text-success-foreground [&_[data-slot=alert-description]]:text-success-foreground/80",
  warning:
    "border-warning/25 bg-warning/10 text-warning-foreground [&_[data-slot=alert-description]]:text-warning-foreground/80",
};

const toneIcons: Record<FeedbackTone, ReactNode> = {
  error: <TriangleAlert />,
  info: <Info />,
  success: <CircleCheck />,
  warning: <CircleHelp />,
};

function FeedbackAlert(props: FeedbackAlertProps) {
  const tone = props.tone ?? "info";

  return (
    <Alert
      data-slot="feedback-alert"
      role={tone === "error" ? "alert" : "status"}
      className={cn(toneClassNames[tone], props.className)}
    >
      {toneIcons[tone]}
      <AlertTitle>{props.title}</AlertTitle>
      <AlertDescription>{props.description}</AlertDescription>
    </Alert>
  );
}

export { FeedbackAlert };
export type { FeedbackAlertProps, FeedbackTone };
