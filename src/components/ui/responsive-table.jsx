import * as React from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/**
 * A responsive table that renders a standard data table on desktop
 * and converts to a list of cards on mobile.
 */
export function ResponsiveTable({ columns, data, renderMobileCard }) {
  return (
    <div className="w-full">
      {/* Desktop Table */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col, index) => (
                <TableHead key={index} className={col.className}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {columns.map((col, colIndex) => (
                    <TableCell key={colIndex} className={col.className}>
                      {col.cell ? col.cell(row) : row[col.accessorKey]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {data.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground border rounded-lg bg-card">
            No results.
          </div>
        ) : (
          data.map((row, rowIndex) => (
            <React.Fragment key={rowIndex}>
              {renderMobileCard(row)}
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  )
}
