import * as React from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

/**
 * A responsive item grid for entering items in vouchers/invoices.
 * Desktop: Editable table.
 * Mobile: Accordion list.
 */
export function ResponsiveItemGrid({ 
  columns, 
  data, 
  onRemoveItem,
  renderMobileAccordionHeader,
  renderMobileAccordionContent
}) {
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
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="h-24 text-center">
                  No items added.
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {columns.map((col, colIndex) => (
                    <TableCell key={colIndex} className={col.className}>
                      {col.cell ? col.cell(row, rowIndex) : row[col.accessorKey]}
                    </TableCell>
                  ))}
                  <TableCell>
                    {onRemoveItem && (
                      <Button variant="ghost" size="icon" onClick={() => onRemoveItem(rowIndex)} className="h-8 w-8 text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Accordion */}
      <div className="md:hidden">
        {data.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground border rounded-lg bg-card">
            No items added.
          </div>
        ) : (
          <Accordion type="single" collapsible className="w-full space-y-2">
            {data.map((row, rowIndex) => (
              <AccordionItem key={rowIndex} value={`item-${rowIndex}`} className="border rounded-lg bg-card px-4">
                <AccordionTrigger className="hover:no-underline py-3 text-sm">
                  {renderMobileAccordionHeader(row, rowIndex)}
                </AccordionTrigger>
                <AccordionContent className="pt-2 pb-4 space-y-4">
                  {renderMobileAccordionContent(row, rowIndex)}
                  {onRemoveItem && (
                    <Button variant="destructive" size="sm" onClick={() => onRemoveItem(rowIndex)} className="w-full mt-4">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove Item
                    </Button>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  )
}
