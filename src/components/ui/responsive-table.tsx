import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Right-align numeric columns (money). */
  numeric?: boolean;
}

export interface ResponsiveTableProps<T> {
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  className?: string;
}

/**
 * One semantic table. On phones (below md) the CSS in globals.css turns each row into a labelled
 * card: every cell carries its column header as data-label, so the layout changes but the markup
 * and the reading order stay the same for assistive technology.
 */
export function ResponsiveTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  className,
}: ResponsiveTableProps<T>) {
  return (
    <div className={cn("responsive-table-wrap", className)}>
      <table className="responsive-table w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "border-b border-border px-3 py-2 text-left font-semibold text-muted-foreground",
                  c.numeric && "text-right",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="responsive-table__row">
              {columns.map((c) => (
                <td
                  key={c.key}
                  data-label={c.header}
                  className={cn(
                    "border-b border-border px-3 py-3 align-top text-foreground",
                    c.numeric && "text-right tabular-nums",
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
