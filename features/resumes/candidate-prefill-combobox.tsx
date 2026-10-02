"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CANDIDATE_PREFILL_GROUPS,
  CANDIDATE_PREFILL_OPTIONS,
  candidatePrefillLabel,
} from "@/features/resumes/candidate-prefill-options";
import type { CandidatePrefillKey } from "@/features/resumes/resume.types";
import { cn } from "@/lib/utils";

export function CandidatePrefillCombobox(props: {
  value?: CandidatePrefillKey;
  onValueChange: (value: CandidatePrefillKey | undefined) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = props.value
    ? candidatePrefillLabel(props.value)
    : "No automatic prefill";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Choose candidate data for automatic prefill"
          disabled={props.disabled}
          className={cn(
            "h-9 w-full min-w-0 justify-between px-3 font-normal",
            props.className,
          )}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Search name, email, employer, DOB…" />
          <CommandList className="max-h-80">
            <CommandEmpty>No matching resume field.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="no automatic prefill none"
                onSelect={() => {
                  props.onValueChange(undefined);
                  setOpen(false);
                }}
              >
                <Check className={cn("size-4", props.value ? "opacity-0" : "opacity-100")} />
                <span>No automatic prefill</span>
              </CommandItem>
            </CommandGroup>
            {CANDIDATE_PREFILL_GROUPS.map((group) => (
              <CommandGroup key={group} heading={group}>
                {CANDIDATE_PREFILL_OPTIONS
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <CommandItem
                      key={item.key}
                      value={[item.label, item.key, ...item.keywords].join(" ")}
                      onSelect={() => {
                        props.onValueChange(item.key);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("size-4", props.value === item.key ? "opacity-100" : "opacity-0")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.label}</span>
                        <span className="block truncate font-mono text-[10px] text-muted-foreground">{item.key}</span>
                      </span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
