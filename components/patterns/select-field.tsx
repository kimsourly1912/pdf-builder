"use client";

import * as React from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const EmptyOptionContext = React.createContext("");

type SelectFieldProps = Omit<React.ComponentProps<typeof SelectTrigger>, "value" | "onChange" | "children"> & {
  value: string | number;
  onValueChange: (value: string) => void;
  name?: string;
  required?: boolean;
  placeholder?: React.ReactNode;
  hideIndicator?: boolean;
  children: React.ReactNode;
};

/** A controlled shadcn select with a focusable trigger and an optional clear item. */
export const SelectField = React.forwardRef<HTMLButtonElement, SelectFieldProps>(function SelectField({
  value, onValueChange, name, required, disabled, placeholder, hideIndicator,
  className, children, ...triggerProps
}, ref) {
  // Radix items cannot have an empty value. Keep the actual form value empty,
  // and translate only the clear item's internal value at the interaction boundary.
  const emptyOption = `empty-${React.useId()}`;
  return (
    <EmptyOptionContext.Provider value={emptyOption}>
      <Select value={String(value)} onValueChange={(next) => onValueChange(next === emptyOption ? "" : next)} name={name} required={required} disabled={disabled}>
        <SelectTrigger {...triggerProps} ref={ref} disabled={disabled} type="button" style={hideIndicator ? { ...triggerProps.style, height: "100%" } : triggerProps.style} className={cn("min-w-0", hideIndicator && "[&>svg]:hidden", className)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent
          className="max-w-[calc(100vw-2rem)]"
          // Keep option bounds stable during opening and closing animations.
          style={{ "--tw-enter-scale": 1, "--tw-exit-scale": 1 } as React.CSSProperties}
        >
          {children}
        </SelectContent>
      </Select>
    </EmptyOptionContext.Provider>
  );
});

export function SelectFieldOption({ value, ...props }: Omit<React.ComponentProps<typeof SelectItem>, "value"> & { value: string | number }) {
  const emptyOption = React.useContext(EmptyOptionContext);
  return <SelectItem {...props} value={String(value) === "" ? emptyOption : String(value)} className={cn("whitespace-normal break-words", props.className)} />;
}
