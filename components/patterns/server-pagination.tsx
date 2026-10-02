"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PageMeta } from "@/features/pagination/pagination";

type ServerPaginationProps = {
  meta: PageMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  disabled?: boolean;
  pageSizes?: readonly number[];
};

export function ServerPagination(props: ServerPaginationProps) {
  const pageSizes = props.pageSizes ?? [10, 25, 50, 100];
  const firstItem = props.meta.totalItems === 0
    ? 0
    : (props.meta.page - 1) * props.meta.pageSize + 1;
  const lastItem = Math.min(
    props.meta.page * props.meta.pageSize,
    props.meta.totalItems,
  );

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground" aria-live="polite">
        {firstItem}–{lastItem} of {props.meta.totalItems} result
        {props.meta.totalItems === 1 ? "" : "s"}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
        {props.onPageSizeChange && (
          <Select
            value={String(props.meta.pageSize)}
            disabled={props.disabled}
            onValueChange={(value) => props.onPageSizeChange?.(Number(value))}
          >
            <SelectTrigger className="h-8 w-28" aria-label="Results per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {pageSizes.map((pageSize) => (
                <SelectItem key={pageSize} value={String(pageSize)}>
                  {pageSize} per page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <span className="text-xs text-muted-foreground">
          Page {props.meta.totalPages === 0 ? 0 : props.meta.page} of {props.meta.totalPages}
        </span>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={props.disabled || !props.meta.hasPreviousPage}
            onClick={() => props.onPageChange(props.meta.page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={props.disabled || !props.meta.hasNextPage}
            onClick={() => props.onPageChange(props.meta.page + 1)}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
