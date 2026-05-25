/**
 * lib/api/excel-export.ts
 *
 * Server-side Excel (.xlsx) generation using SheetJS.
 * Returns a NextResponse with proper headers for browser download.
 */

import * as XLSX from 'xlsx'
import { NextResponse } from 'next/server'

export interface ExcelSheet {
  name: string
  data: Record<string, unknown>[]
  columns?: { header: string; key: string; width?: number }[]
}

/**
 * Generate an Excel file from one or more sheets and return as a downloadable Response.
 */
export function generateExcelResponse(
  sheets: ExcelSheet[],
  filename: string,
): NextResponse {
  const workbook = XLSX.utils.book_new()

  for (const sheet of sheets) {
    let wsData: unknown[][]

    if (sheet.columns) {
      // Build header row + data rows using column config
      const headers = sheet.columns.map(c => c.header)
      const rows = sheet.data.map(row =>
        sheet.columns!.map(c => row[c.key] ?? '')
      )
      wsData = [headers, ...rows]
    } else {
      // Auto-detect from keys of first row
      if (sheet.data.length === 0) {
        wsData = [['No data']]
      } else {
        const keys = Object.keys(sheet.data[0])
        const headers = keys.map(k => k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))
        const rows = sheet.data.map(row => keys.map(k => row[k] ?? ''))
        wsData = [headers, ...rows]
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Set column widths
    if (sheet.columns) {
      ws['!cols'] = sheet.columns.map(c => ({ wch: c.width ?? 15 }))
    }

    XLSX.utils.book_append_sheet(workbook, ws, sheet.name.substring(0, 31))
  }

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
    },
  })
}

/**
 * Format a number as Indonesian Rupiah string for display in Excel.
 */
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)
}

/**
 * Format a date as DD/MM/YYYY for display.
 */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
