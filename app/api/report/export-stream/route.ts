import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import ExcelJS from 'exceljs';

const BATCH_SIZE = 1000; // naikkan dari 500 → 1000

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

    // Fetch semua data paralel
    const [periodeRes, assyRes, prodRes, partsRes, qtyRes] = await Promise.all([
      mode === 'gabungan'
        ? pool.query(
            `SELECT DISTINCT periode FROM mv_bom_gabungan
             WHERE periode >= $1 AND periode <= $2 ORDER BY periode`,
            [p1, p2]
          )
        : Promise.resolve({ rows: [{ periode }] }),

      pool.query(
        hasAssyFilter
          ? `SELECT DISTINCT assy_code FROM mv_bom_gabungan
             WHERE periode >= $1 AND periode <= $2 AND assy_code = ANY($3::text[])
             ORDER BY assy_code`
          : `SELECT DISTINCT assy_code FROM mv_bom_gabungan
             WHERE periode >= $1 AND periode <= $2 ORDER BY assy_code`,
        hasAssyFilter ? [p1, p2, assyFilter] : [p1, p2]
      ),

      pool.query(
        `SELECT assy_code, periode, COALESCE(prod_qty, 0) AS prod_qty
         FROM prod_plan WHERE periode >= $1 AND periode <= $2`,
        [p1, p2]
      ),

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

      pool.query(
        hasAssyFilter
          ? `SELECT part_no, assy_code, periode, qty_per_unit
             FROM mv_bom_gabungan
             WHERE periode >= $1 AND periode <= $2 AND assy_code = ANY($3::text[])`
          : `SELECT part_no, assy_code, periode, qty_per_unit
             FROM mv_bom_gabungan
             WHERE periode >= $1 AND periode <= $2`,
        hasAssyFilter ? [p1, p2, assyFilter] : [p1, p2]
      ),
    ]);

    const periodeList: string[] = periodeRes.rows
      .map((r: { periode: string | null }) => r.periode || '').filter(Boolean);
    const assyCodes: string[] = assyRes.rows
      .map((r: { assy_code: string | null }) => r.assy_code || '').filter(Boolean);
    const parts      = partsRes.rows;
    const totalParts = parts.length;

    // Build lookup maps O(n) sekali saja
    const prodMap = new Map<string, number>();
    for (const r of prodRes.rows)
      prodMap.set(`${r.assy_code}|${r.periode}`, Number(r.prod_qty));

    // Gunakan Float32Array untuk qty — 4x lebih hemat memory dari Map<string,number>
    // Key encoding: partIdx * colCount + colIdx
    type ColDef = { assy: string; per: string; prodQty: number };
    const cols: ColDef[] = [];
    if (mode === 'gabungan') {
      for (const assy of assyCodes)
        for (const per of periodeList)
          cols.push({ assy, per, prodQty: prodMap.get(`${assy}|${per}`) ?? 0 });
    } else {
      for (const assy of assyCodes)
        cols.push({ assy, per: periode!, prodQty: prodMap.get(`${assy}|${periode!}`) ?? 0 });
    }

    // Build string-key Map untuk lookup cepat
    // Format key berbeda untuk mode gabungan vs single (sama dengan halaman report)
    const qtyMap = new Map<string, number>();
    for (const r of qtyRes.rows) {
      if (mode === 'gabungan') {
        qtyMap.set(`${r.part_no}|${r.assy_code}|${r.periode}`, Number(r.qty_per_unit));
      } else {
        // Mode single: key tanpa periode, sama seperti di halaman report
        qtyMap.set(`${r.part_no}|${r.assy_code}`, Number(r.qty_per_unit));
      }
    }

    // Pre-compute prodQty array untuk akses O(1) tanpa object lookup
    const prodQtyArr = new Float64Array(cols.length);
    for (let i = 0; i < cols.length; i++)
      prodQtyArr[i] = cols[i].prodQty;

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const stream = new ReadableStream({
      async start(controller) {
        // Cek cancel signal di awal
        if (request.signal.aborted) {
          controller.close();
          return;
        }

        try {
          const { Writable } = await import('stream');

          const writableStream = new Writable({
            write(chunk: Buffer, _enc, cb) {
              // Cek cancel setiap chunk
              if (request.signal.aborted) {
                cb(new Error('Cancelled'));
                return;
              }
              controller.enqueue(new Uint8Array(chunk));
              cb();
            },
            final(cb) { controller.close(); cb(); }
          });

          const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
            stream: writableStream,
            useStyles: false,
            useSharedStrings: false,
          });

          const ws = workbook.addWorksheet('Report');
          const baseHeaders = ['Part No', 'Part No AS400', 'Supplier', 'Part Name', 'Unit'];

          if (mode === 'gabungan') {
            // Row 1: assy headers
            const row1: (string | number)[] = [...baseHeaders];
            for (const assy of assyCodes)
              for (let i = 0; i < periodeList.length; i++) row1.push(assy);
            row1.push('Price', 'Total', 'Total Usage');
            ws.addRow(row1).commit();

            // Row 2: periode sub-headers
            const row2: (string | number)[] = new Array(5).fill('');
            for (const _assy of assyCodes)
              for (const per of periodeList) {
                const [y, m] = per.split('-').map(Number);
                row2.push(`${MONTHS[m - 1]} ${y}`);
              }
            row2.push('', '', '');
            ws.addRow(row2).commit();

            // Row 3: prod qty
            const row3: (string | number)[] = ['PROD QTY →', '', '', '', ''];
            for (let i = 0; i < cols.length; i++) row3.push(prodQtyArr[i]);
            row3.push('', '', '');
            ws.addRow(row3).commit();

          } else {
            ws.addRow([...baseHeaders, ...assyCodes, 'Price', 'Total', 'Total Usage']).commit();
            const prodRow: (string | number)[] = ['PROD QTY →', '', '', '', ''];
            for (let i = 0; i < cols.length; i++) prodRow.push(prodQtyArr[i]);
            prodRow.push('', '', '');
            ws.addRow(prodRow).commit();
          }

          // ── Data rows — optimasi inner loop ──
          const colCount = cols.length;

          // Array untuk menyimpan total per kolom (untuk footer TOTAL PER ASSY)
          const colSums = new Float64Array(colCount);
          let grandTotalUsage = 0;

          for (let i = 0; i < parts.length; i += BATCH_SIZE) {
            // Cek cancel setiap batch
            if (request.signal.aborted) break;

            const end   = Math.min(i + BATCH_SIZE, parts.length);
            const batch = parts.slice(i, end);

            for (const part of batch) {
              const pno = part.part_no;

              // Pre-allocate row array sekali
              const row: (string | number)[] = [
                pno,
                part.part_no_as400 || '',
                part.supplier_name || '',
                part.part_name     || '',
                part.unit          || '',
              ];

              let totalBom = 0;
              let totalUsage = 0;

              // Inner loop — akses array langsung, hindari object property lookup
              for (let ci = 0; ci < colCount; ci++) {
                const col = cols[ci];
                // Key format berbeda untuk mode gabungan vs single (sama dengan halaman report)
                const key = mode === 'gabungan'
                  ? `${pno}|${col.assy}|${col.per}`
                  : `${pno}|${col.assy}`;
                const qty = qtyMap.get(key) ?? 0;
                row.push(qty);
                totalBom   += qty;
                totalUsage += qty * prodQtyArr[ci]; // array akses lebih cepat dari col.prodQty
                // Footer: hanya akumulasi jika qty > 0 (sama dengan logika di halaman report)
                if (qty > 0) {
                  colSums[ci] += qty;
                }
              }

              const usageRounded = Math.ceil(totalUsage);
              row.push(part.price != null ? Number(part.price) : '');
              row.push(totalBom, usageRounded);
              grandTotalUsage += usageRounded;
              ws.addRow(row).commit();
            }

            // Yield ke event loop tiap batch agar tidak block & bisa detect cancel
            await new Promise(resolve => setImmediate(resolve));
          }

          // ── Footer row: TOTAL PER ASSY ──
          // colSums berisi jumlah qty komponen per kolom ASSY (tanpa melibatkan prod qty)
          // grandTotalUsage adalah penjumlahan dari kolom TOTAL USAGE setiap baris
          if (!request.signal.aborted) {
            const footerRow: (string | number)[] = ['∑ TOTAL PER ASSY', '', '', '', ''];
            for (let ci = 0; ci < colCount; ci++) {
              footerRow.push(colSums[ci] > 0 ? colSums[ci] : '—');
            }
            // Kolom Price dikosongkan, Total BOM dikosongkan, kolom Total Usage diisi grandTotalUsage
            footerRow.push('—', '—', grandTotalUsage > 0 ? grandTotalUsage : '—');
            ws.addRow(footerRow).commit();
          }

          if (!request.signal.aborted) {
            await workbook.commit();
          }

        } catch (err: unknown) {
          if (err instanceof Error && err.message === 'Cancelled') {
            controller.close();
          } else {
            controller.error(err);
          }
        }
      },

      cancel() {
        // ReadableStream cancel dipanggil saat client disconnect
        console.log('[Export] Stream cancelled by client');
      }
    });

    // Propagate abort signal ke stream
    request.signal.addEventListener('abort', () => {
      // Signal sudah di-handle di dalam stream via request.signal.aborted checks
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="report_${p1}_${p2}.xlsx"`,
        'X-Total-Parts': String(totalParts),
        'X-Total-Cols':  String(cols.length),
      },
    });

  } catch (error) {
    console.error('[Export] Error:', error);
    return NextResponse.json(
      { error: 'Export failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
