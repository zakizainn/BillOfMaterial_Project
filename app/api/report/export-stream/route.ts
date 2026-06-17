import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import ExcelJS from 'exceljs';

const BATCH_SIZE = 1000;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dari    = searchParams.get('dari');
    const sampai  = searchParams.get('sampai');
    const periode = searchParams.get('periode');
    const mode    = searchParams.get('mode') || 'single';
    const assyFilter    = searchParams.getAll('assy');
    const hasAssyFilter = assyFilter && assyFilter.length > 0;

    const p1 = mode === 'gabungan' ? dari   : periode;
    const p2 = mode === 'gabungan' ? sampai : periode;

    // ── Query aggregate — semua kalkulasi di PostgreSQL ──────────────────────
    //
    // Untuk mode gabungan (multi-periode):
    //   - 1 kolom per ASSY (bukan × periode)
    //   - qty_per_unit  = qty dari bom_detail (sama semua periode, ambil MAX)
    //   - prod_qty      = SUM prod_qty semua periode per ASSY
    //   - total_usage   = CEIL(SUM(qty_per_unit × prod_qty per periode))
    //
    // Untuk mode single (1 periode):
    //   - sama, tapi hanya 1 periode → SUM = nilai periode itu sendiri
    // ─────────────────────────────────────────────────────────────────────────

    const [assyRes, partsRes, qtyAggRes] = await Promise.all([
      // 1. Daftar ASSY yang ada di BOM periode ini
      pool.query(
        hasAssyFilter
          ? `SELECT DISTINCT assy_code FROM mv_bom_gabungan
             WHERE periode >= $1 AND periode <= $2 AND assy_code = ANY($3::text[])
             ORDER BY assy_code`
          : `SELECT DISTINCT assy_code FROM mv_bom_gabungan
             WHERE periode >= $1 AND periode <= $2 ORDER BY assy_code`,
        hasAssyFilter ? [p1, p2, assyFilter] : [p1, p2]
      ),

      // 2. Daftar part unik + price terbaru
      pool.query(
        hasAssyFilter
          ? `SELECT DISTINCT m.part_no, m.part_no_as400, m.supplier_name, m.part_name, m.unit,
                    (SELECT pp.price FROM part_price pp
                     WHERE pp.part_no = m.part_no AND pp.periode >= $1 AND pp.periode <= $2
                     ORDER BY pp.periode DESC LIMIT 1) AS price
             FROM mv_bom_gabungan m
             WHERE m.periode >= $1 AND m.periode <= $2 AND m.assy_code = ANY($3::text[])
             ORDER BY m.part_no`
          : `SELECT DISTINCT m.part_no, m.part_no_as400, m.supplier_name, m.part_name, m.unit,
                    (SELECT pp.price FROM part_price pp
                     WHERE pp.part_no = m.part_no AND pp.periode >= $1 AND pp.periode <= $2
                     ORDER BY pp.periode DESC LIMIT 1) AS price
             FROM mv_bom_gabungan m
             WHERE m.periode >= $1 AND m.periode <= $2
             ORDER BY m.part_no`,
        hasAssyFilter ? [p1, p2, assyFilter] : [p1, p2]
      ),

      // 3. Aggregate qty per (part_no, assy_code) — semua periode digabung
      //    qty_per_unit  : MAX (harusnya sama tiap periode, ambil MAX untuk safety)
      //    prod_qty_sum  : SUM prod_qty semua periode untuk ASSY ini
      //    total_usage   : CEIL(SUM(qty_per_unit × prod_qty)) per periode, lalu dijumlah
      pool.query(
        hasAssyFilter
          ? `SELECT
               m.part_no,
               m.assy_code,
               MAX(m.qty_per_unit)                              AS qty_per_unit,
               COALESCE(SUM(pp.prod_qty), 0)                   AS prod_qty_sum,
               CEIL(SUM(m.qty_per_unit * COALESCE(pp.prod_qty, 0))) AS total_usage
             FROM mv_bom_gabungan m
             LEFT JOIN prod_plan pp
               ON pp.assy_code = m.assy_code
              AND pp.periode   = m.periode
              AND pp.sequence  IS NULL
             WHERE m.periode >= $1 AND m.periode <= $2
               AND m.assy_code = ANY($3::text[])
             GROUP BY m.part_no, m.assy_code`
          : `SELECT
               m.part_no,
               m.assy_code,
               MAX(m.qty_per_unit)                              AS qty_per_unit,
               COALESCE(SUM(pp.prod_qty), 0)                   AS prod_qty_sum,
               CEIL(SUM(m.qty_per_unit * COALESCE(pp.prod_qty, 0))) AS total_usage
             FROM mv_bom_gabungan m
             LEFT JOIN prod_plan pp
               ON pp.assy_code = m.assy_code
              AND pp.periode   = m.periode
              AND pp.sequence  IS NULL
             WHERE m.periode >= $1 AND m.periode <= $2
             GROUP BY m.part_no, m.assy_code`,
        hasAssyFilter ? [p1, p2, assyFilter] : [p1, p2]
      ),
    ]);

    const assyCodes: string[] = assyRes.rows.map((r: { assy_code: string }) => r.assy_code);
    const parts      = partsRes.rows;
    const totalParts = parts.length;

    // ── Build lookup maps ────────────────────────────────────────────────────
    // prodQtySum per assy_code (untuk row PROD QTY)
    const prodQtyMap = new Map<string, number>();
    // qty_per_unit per (part_no|assy_code)
    const qtyMap     = new Map<string, number>();
    // total_usage per (part_no|assy_code)
    const usageMap   = new Map<string, number>();

    for (const r of qtyAggRes.rows) {
      const key = `${r.part_no}|${r.assy_code}`;
      qtyMap.set(key, Number(r.qty_per_unit));
      usageMap.set(key, Number(r.total_usage));
      // prodQtySum sama untuk semua part dalam 1 assy — set sekali
      if (!prodQtyMap.has(r.assy_code))
        prodQtyMap.set(r.assy_code, Number(r.prod_qty_sum));
    }

    // Pre-build suffix keys per kolom (hindari concat di inner loop)
    const colSuffixes: string[] = assyCodes.map(a => `|${a}`);
    const colCount = assyCodes.length;

    const stream = new ReadableStream({
      async start(controller) {
        if (request.signal.aborted) { controller.close(); return; }

        try {
          const { Writable } = await import('stream');

          const writableStream = new Writable({
            write(chunk: Buffer, _enc, cb) {
              if (request.signal.aborted) { cb(new Error('Cancelled')); return; }
              controller.enqueue(new Uint8Array(chunk));
              cb();
            },
            final(cb) { controller.close(); cb(); }
          });

          const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
            stream: writableStream,
            useStyles: false,
            useSharedStrings: true,
            zip: { zlib: { level: 6 } }, // level 6 — balance antara speed & size
          });

          const ws = workbook.addWorksheet('Report');
          const baseHeaders = ['Part No', 'Part No AS400', 'Supplier', 'Part Name', 'Unit'];

          // ── Header row: base + ASSY codes + summary cols ──────────────────
          ws.addRow([
            ...baseHeaders,
            ...assyCodes,
            'Price',
            'Total BOM',
            'Total Usage',
          ]).commit();

          // ── PROD QTY row (SUM semua periode per ASSY) ────────────────────
          const prodRow: (string | number)[] = ['PROD QTY (SUM) →', '', '', '', ''];
          for (const assy of assyCodes)
            prodRow.push(prodQtyMap.get(assy) ?? 0);
          prodRow.push('', '', '');
          ws.addRow(prodRow).commit();

          // ── Data rows ────────────────────────────────────────────────────
          const colSums  = new Float64Array(colCount); // total qty per ASSY (footer)
          let grandTotalUsage = 0;

          for (let i = 0; i < parts.length; i += BATCH_SIZE) {
            if (request.signal.aborted) break;

            const batch = parts.slice(i, Math.min(i + BATCH_SIZE, parts.length));

            for (const part of batch) {
              const pno = part.part_no;

              const row: (string | number)[] = [
                pno,
                part.part_no_as400 || '',
                part.supplier_name || '',
                part.part_name     || '',
                part.unit          || '',
              ];

              let totalBom   = 0;
              let totalUsage = 0;

              for (let ci = 0; ci < colCount; ci++) {
                const key   = pno + colSuffixes[ci];
                const qty   = qtyMap.get(key)   ?? 0;
                const usage = usageMap.get(key)  ?? 0;
                row.push(qty);
                totalBom   += qty;
                totalUsage += usage;
                if (qty > 0) colSums[ci] += qty;
              }

              grandTotalUsage += Math.ceil(totalUsage);
              row.push(
                part.price != null ? Number(part.price) : '',
                totalBom,
                Math.ceil(totalUsage),
              );
              ws.addRow(row).commit();
            }

            await new Promise(resolve => setImmediate(resolve));
          }

          // ── Footer: TOTAL PER ASSY ────────────────────────────────────────
          if (!request.signal.aborted) {
            const footerRow: (string | number)[] = ['∑ TOTAL PER ASSY', '', '', '', ''];
            for (let ci = 0; ci < colCount; ci++)
              footerRow.push(colSums[ci] > 0 ? colSums[ci] : '—');
            footerRow.push('—', '—', grandTotalUsage > 0 ? grandTotalUsage : '—');
            ws.addRow(footerRow).commit();
          }

          if (!request.signal.aborted) await workbook.commit();

        } catch (err: unknown) {
          if (err instanceof Error && err.message === 'Cancelled') {
            controller.close();
          } else {
            controller.error(err);
          }
        }
      },

      cancel() {
        console.log('[Export Aggregate] Stream cancelled by client');
      }
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="report_aggregate_${p1}_${p2}.xlsx"`,
        'X-Total-Parts': String(totalParts),
        'X-Total-Cols':  String(colCount),
        'X-Mode':        'aggregate',
      },
    });

  } catch (error) {
    console.error('[Export Aggregate] Error:', error);
    return NextResponse.json(
      { error: 'Export failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}