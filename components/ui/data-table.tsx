"use client"

import { useTable } from "@tanstack/react-table"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { useState } from "react"
import type {
  Column,
  ColumnDef,
  ColumnFiltersState,
  ColumnVisibilityState,
  RowData,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  dataTableFeatures,
} from "@/components/ui/data-table-features"
import type { DataTableFeatures } from "@/components/ui/data-table-features"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type DataTableColumnMeta = {
  className?: string
  headerClassName?: string
}

type DataTableProps<TData extends RowData> = {
  columns: ColumnDef<DataTableFeatures, TData>[]
  data: TData[]
  getRowId: (row: TData) => string
  caption: string
  emptyTitle: string
  emptyDescription: string
  emptyIcon?: ReactNode
  filterColumn?: string
  filterPlaceholder?: string
  enableRowSelection?: boolean
  initialPageSize?: number
  className?: string
  rowClassName?: (row: TData) => string | undefined
}

type DataTableColumnHeaderProps<TData extends RowData, TValue> = {
  column: Column<DataTableFeatures, TData, TValue>
  title: string
  className?: string
}

function DataTableColumnHeader<TData extends RowData, TValue>(
  props: DataTableColumnHeaderProps<TData, TValue>,
) {
  const { column, title, className } = props

  if (!column.getCanSort()) {
    return <span className={className}>{title}</span>
  }

  const direction = column.getIsSorted()
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("-ml-3 h-8 px-3", className)}
      onClick={() => column.toggleSorting(direction === "asc")}
    >
      {title}
      {direction === "asc" ? (
        <ArrowUp />
      ) : direction === "desc" ? (
        <ArrowDown />
      ) : (
        <ArrowUpDown />
      )}
    </Button>
  )
}

function DataTable<TData extends RowData>(props: DataTableProps<TData>) {
  const {
    columns,
    data,
    getRowId,
    caption,
    emptyTitle,
    emptyDescription,
    emptyIcon,
    filterColumn,
    filterPlaceholder = "Filter results...",
    enableRowSelection = false,
    initialPageSize = 10,
    className,
    rowClassName,
  } = props
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const selectionColumn: ColumnDef<DataTableFeatures, TData> = {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) =>
          table.toggleAllPageRowsSelected(Boolean(value))
        }
        aria-label="Select all rows on this page"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  }
  const resolvedColumns = enableRowSelection
    ? [selectionColumn, ...columns]
    : columns

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns: resolvedColumns,
    getRowId,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    enableRowSelection,
    initialState: {
      pagination: { pageIndex: 0, pageSize: initialPageSize },
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
  })
  const filter = filterColumn ? table.getColumn(filterColumn) : undefined
  const visibleColumnCount = table.getVisibleLeafColumns().length
  const filteredRows = table.getFilteredRowModel().rows
  const pageCount = table.getPageCount()
  const pageIndex = table.state.pagination.pageIndex

  return (
    <Card className={cn("gap-4 overflow-hidden p-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-sm">
          {filter ? (
            <Input
              value={(filter.getFilterValue() as string) ?? ""}
              onChange={(event) => filter.setFilterValue(event.target.value)}
              placeholder={filterPlaceholder}
              aria-label={filterPlaceholder}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {filteredRows.length} row{filteredRows.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="sm:ml-auto">
              Columns <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) =>
                    column.toggleVisibility(Boolean(value))
                  }
                >
                  {formatColumnLabel(column.id)}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader className="bg-muted/40">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as
                    | DataTableColumnMeta
                    | undefined
                  return (
                    <TableHead
                      key={header.id}
                      className={cn("h-11 px-4 text-xs", meta?.headerClassName)}
                    >
                      {header.isPlaceholder
                        ? null
                        : <table.FlexRender header={header} />}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={rowClassName?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as
                      | DataTableColumnMeta
                      | undefined
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn("px-4 py-3", meta?.className)}
                      >
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={visibleColumnCount}
                  className="h-64 text-center"
                >
                  <div className="mx-auto flex max-w-sm flex-col items-center">
                    {emptyIcon && (
                      <span className="mb-4 flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-5">
                        {emptyIcon}
                      </span>
                    )}
                    <p className="font-medium">
                      {data.length > 0 ? "No matching results" : emptyTitle}
                    </p>
                    <p className="mt-1 whitespace-normal text-sm leading-6 text-muted-foreground">
                      {data.length > 0
                        ? "Try changing or clearing the table filter."
                        : emptyDescription}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground" aria-live="polite">
          {enableRowSelection
            ? `${table.getFilteredSelectedRowModel().rows.length} of ${filteredRows.length} row(s) selected.`
            : `${filteredRows.length} row${filteredRows.length === 1 ? "" : "s"}`}
        </p>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="text-xs text-muted-foreground">
            Page {pageCount === 0 ? 0 : pageIndex + 1} of {pageCount}
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

function formatColumnLabel(columnId: string) {
  return columnId
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
}

export { DataTable, DataTableColumnHeader }
