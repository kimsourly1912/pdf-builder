"use client"

import type { ReactNode } from "react"

import { Card } from "@/components/ui/card"
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

export type DataTableColumn<TData> = {
  id: string
  header: ReactNode
  cell: (row: TData) => ReactNode
  className?: string
  headerClassName?: string
}

type DataTableProps<TData> = {
  columns: DataTableColumn<TData>[]
  data: TData[]
  getRowId: (row: TData) => string
  caption: string
  emptyTitle: string
  emptyDescription: string
  emptyIcon?: ReactNode
  className?: string
  rowClassName?: (row: TData) => string | undefined
}

function DataTable<TData>({
  columns,
  data,
  getRowId,
  caption,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  className,
  rowClassName,
}: DataTableProps<TData>) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <Table>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.id}
                className={cn("h-11 px-4 text-xs", column.headerClassName)}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length > 0 ? (
            data.map((row) => (
              <TableRow key={getRowId(row)} className={rowClassName?.(row)}>
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    className={cn("px-4 py-3", column.className)}
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="h-64 text-center">
                <div className="mx-auto flex max-w-sm flex-col items-center">
                  {emptyIcon && (
                    <span className="mb-4 flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-5">
                      {emptyIcon}
                    </span>
                  )}
                  <p className="font-medium">{emptyTitle}</p>
                  <p className="mt-1 whitespace-normal text-sm leading-6 text-muted-foreground">
                    {emptyDescription}
                  </p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  )
}

export { DataTable }
