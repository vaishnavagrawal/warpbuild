"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@nextjs-starter/ui/components/table";
import { Badge } from "@nextjs-starter/ui/components/badge";
import { cn } from "@nextjs-starter/ui/lib/utils";
import { ClockIcon, TableIcon } from "lucide-react";

export interface SqlResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  sql: string;
  durationMs: number;
}

interface SqlResultTableProps {
  result: SqlResult;
  className?: string;
}

export function SqlResultTable({ result, className }: SqlResultTableProps) {
  const { columns, rows, rowCount, truncated, durationMs } = result;

  if (rows.length === 0) {
    return (
      <div className={cn("rounded-md border p-4 text-center text-sm text-muted-foreground", className)}>
        Query returned no rows.
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {columns.map((col) => (
                <TableHead key={col} className="font-semibold">
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                {columns.map((col) => (
                  <TableCell key={col}>
                    {formatCell(row[col])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Footer metadata */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <TableIcon className="size-3" />
          {rowCount} row{rowCount !== 1 ? "s" : ""}
        </span>
        <span className="inline-flex items-center gap-1">
          <ClockIcon className="size-3" />
          {durationMs}ms
        </span>
        {truncated && (
          <Badge variant="secondary" className="text-xs">
            Truncated
          </Badge>
        )}
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
