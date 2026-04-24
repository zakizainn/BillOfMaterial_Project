import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import pool from '@/lib/db';

// GET /api/report?periode=2026-06&page=1&limit=50&search=
// GET /api/report?dari=2026-01&sampai=2026-12&assy_codes=A1,A2&page=1&limit=50&search=
// GET /api/report?...&download=true  → download Excel (.xlsx dengan styling & merged cells)

export async function GET(request: Request) {
  try {
    const url        = new URL(request.url);
    const periode    = url.searchParams.get('periode');
    const dari       = url.searchParams.get('dari');
    const sampai     = url.searchParams.get('sampai');
    const assyFilter = url.searchParams.get('assy_codes');
    const download   = url.searchParams.get('download') === 'true';
    const page       = parseInt(url.searchParams.get('page')  || '1');
    const limit      = parseInt(url.searchParams.get('limit') || '50');
    const search     = url.searchParams.get('search') || '';
    const offset     = (page - 1) * limit;

    const isGabungan = !periode && !!dari && !!sampai;

    if (!isGabungan && !periode) {
      return NextResponse.json(
        { error: 'Parameter periode atau dari+sampai wajib diisi' },
        { status: 400 }
      );
    }

    const assyParams: string[] = assyFilter
      ? assyFilter.split(',').map(a => a.trim()).filter(Boolean)
      : [];
    const hasAssyFilter = assyParams.length > 0;
    const hasSearch     = search.trim().length > 0;
    const searchParam   = hasSearch ? `%${search.trim()}%` : null;

    // ─── HELPER: build WHERE clauses ─────────────────────────────
    function buildWhere(periodeClause: string, paramOffset: number) {
      const clauses: string[] = [periodeClause];
      const params: (string | string[] | number)[] = [];
      let idx = paramOffset;

      if (hasAssyFilter) {
        clauses.push(`assy_code = ANY($${idx}::text[])`);
        params.push(assyParams);
        idx++;
      }
      if (hasSearch) {
        clauses.push(`(part_no ILIKE $${idx} OR part_name ILIKE $${idx})`);
        params.push(searchParam!);
        idx++;
      }
      return { where: clauses.join(' AND '), extraParams: params, nextIdx: idx };
    }

    // ─── DOWNLOAD MODE ────────────────────────────────────────────
    // Format: XLSX dengan merged cells (menggunakan struktur dari file teman)
    if (download) {
      const periodeList = isGabungan
        ? (await pool.query(
            `SELECT DISTINCT periode FROM mv_bom_gabungan
             WHERE periode >= $1 AND periode <= $2 ORDER BY periode`,
            [dari, sampai]
          )).rows.map((r: { periode: string }) => r.periode)
        : [periode!];

      // 1. ASSY codes
      const assyQuery = hasAssyFilter
        ? `SELECT DISTINCT assy_code FROM mv_bom_gabungan
           WHERE periode >= $1 AND periode <= $2 AND assy_code = ANY($3::text[])
           ORDER BY assy_code`
        : `SELECT DISTINCT assy_code FROM mv_bom_gabungan
           WHERE periode >= $1 AND periode <= $2 ORDER BY assy_code`;
      const [p1, p2] = isGabungan ? [dari!, sampai!] : [periode!, periode!];
      const assyRes   = await pool.query(
        assyQuery,
        hasAssyFilter ? [p1, p2, assyParams] : [p1, p2]
      );
      const assyCodes: string[] = assyRes.rows.map((r: { assy_code: string }) => r.assy_code);

      // 2. Prod qty: { assy_code: { periode: qty } }
      const prodRes = await pool.query(
        `SELECT assy_code, periode, COALESCE(prod_qty, 0) AS prod_qty
         FROM prod_plan WHERE periode >= $1 AND periode <= $2`,
        [p1, p2]
      );
      const prodMap: Record<string, Record<string, number>> = {};
      for (const r of prodRes.rows) {
        if (!prodMap[r.assy_code]) prodMap[r.assy_code] = {};
        prodMap[r.assy_code][r.periode] = Number(r.prod_qty);
      }

      // 3. Semua part (tanpa pagination untuk download)
      const { where: pw, extraParams: pe } = buildWhere(
        `periode >= $1 AND periode <= $2`, 3
      );
      const partsRes = await pool.query(
        `SELECT DISTINCT part_no, part_no_as400, part_name, unit, supplier_name
         FROM mv_bom_gabungan WHERE ${pw} ORDER BY part_no`,
        [p1, p2, ...pe]
      );
      const partNos: string[] = partsRes.rows.map((r: { part_no: string }) => r.part_no);

      // 4. Qty data: long format semua part sekaligus
      const qtyRes = await pool.query(
        hasAssyFilter
          ? `SELECT part_no, assy_code, periode, qty_per_unit
             FROM mv_bom_gabungan
             WHERE periode >= $1 AND periode <= $2
               AND part_no = ANY($3) AND assy_code = ANY($4::text[])`
          : `SELECT part_no, assy_code, periode, qty_per_unit
             FROM mv_bom_gabungan
             WHERE periode >= $1 AND periode <= $2
               AND part_no = ANY($3)`,
        hasAssyFilter ? [p1, p2, partNos, assyParams] : [p1, p2, partNos]
      );

      // 5. Build lookup map O(n)
      const lookup = new Map<string, number>();
      for (const r of qtyRes.rows) {
        lookup.set(`${r.part_no}|${r.assy_code}|${r.periode}`, Number(r.qty_per_unit));
      }

      const wb = XLSX.utils.book_new();

      // ── MODE GABUNGAN DOWNLOAD ─────────────────────────────────
      if (isGabungan) {
        const baseHeaders   = ['Part No', 'Part No AS400', 'Supplier', 'Part Name', 'Unit'];
        const baseColCount  = baseHeaders.length;
        const periodesPerAssy = periodeList.length;

        // Row 1: ASSY names (di-repeat sebanyak jumlah periode), lalu Total & Total Usage
        const row1: string[] = [...baseHeaders];
        for (const assy of assyCodes) {
          for (let i = 0; i < periodesPerAssy; i++) {
            row1.push(assy);
          }
        }
        row1.push('Total');
        row1.push('Total Usage');

        // Row 2: Sub-header periode per ASSY (format: "Mar 2026")
        const row2: string[] = new Array(baseColCount).fill('');
        for (const _assy of assyCodes) {
          for (const per of periodeList) {
            const [y, m] = per.split('-').map(Number);
            const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1];
            row2.push(`${month} ${y}`);
          }
        }
        row2.push('');
        row2.push('');

        // Row 3: PROD QTY row
        const row3: (string | number)[] = ['PROD QTY →', '', '', '', ''];
        for (const assy of assyCodes) {
          for (const per of periodeList) {
            row3.push(prodMap[assy]?.[per] ?? 0);
          }
        }
        row3.push('');
        row3.push('');

        // Rows 4+: Data part
        const data: (string | number)[][] = [row1, row2, row3];
        for (const part of partsRes.rows) {
          const row: (string | number)[] = [
            part.part_no,
            part.part_no_as400  || '',
            part.supplier_name  || '',
            part.part_name      || '',
            part.unit           || '',
          ];

          let totalBom   = 0;
          let totalUsage = 0;
          for (const assy of assyCodes) {
            for (const per of periodeList) {
              const qty = lookup.get(`${part.part_no}|${assy}|${per}`) ?? 0;
              row.push(qty);
              totalBom   += qty;
              totalUsage += qty * (prodMap[assy]?.[per] ?? 0);
            }
          }
          row.push(totalBom);
          row.push(Math.ceil(totalUsage));
          data.push(row);
        }

        const ws = XLSX.utils.aoa_to_sheet(data);

        // Merge ASSY header cells di row 1
        const merges: XLSX.Range[] = [];
        let colIdx = baseColCount;
        for (const _assy of assyCodes) {
          merges.push({
            s: { r: 0, c: colIdx },
            e: { r: 0, c: colIdx + periodesPerAssy - 1 },
          });
          colIdx += periodesPerAssy;
        }
        ws['!merges'] = merges;

        // Column widths
        ws['!cols'] = [
          { wch: 15 }, // Part No
          { wch: 18 }, // Part No AS400
          { wch: 25 }, // Supplier
          { wch: 30 }, // Part Name
          { wch: 10 }, // Unit
          ...assyCodes.flatMap(() => periodeList.map(() => ({ wch: 12 }))),
          { wch: 12 }, // Total
          { wch: 12 }, // Total Usage
        ];

        XLSX.utils.book_append_sheet(wb, ws, `Combined_${dari}_${sampai}`);

        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
        return new Response(buffer, {
          headers: {
            'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="report_${dari}_${sampai}.xlsx"`,
          },
        });
      }

      // ── SINGLE PERIODE DOWNLOAD ────────────────────────────────
      // Flat prodMap untuk single periode: { assy_code: qty }
      const flatProdMap: Record<string, number> = {};
      for (const assy of assyCodes) {
        flatProdMap[assy] = prodMap[assy]?.[periode!] ?? 0;
      }

      const headers     = ['Part No', 'Part No AS400', 'Supplier', 'Part Name', 'Unit', ...assyCodes, 'Total BOM', 'Total Usage'];
      const prodQtyRow  = ['PROD QTY →', '', '', '', '', ...assyCodes.map(a => flatProdMap[a] ?? 0), '', ''];
      const data: (string | number)[][] = [headers, prodQtyRow];

      for (const part of partsRes.rows) {
        const row: (string | number)[] = [
          part.part_no,
          part.part_no_as400  || '',
          part.supplier_name  || '',
          part.part_name      || '',
          part.unit           || '',
          ...assyCodes.map(a => lookup.get(`${part.part_no}|${a}|${periode!}`) ?? 0),
        ];
        const totalBom   = assyCodes.reduce((s, a) => s + (lookup.get(`${part.part_no}|${a}|${periode!}`) ?? 0), 0);
        const totalUsage = assyCodes.reduce((s, a) => s + ((lookup.get(`${part.part_no}|${a}|${periode!}`) ?? 0) * (flatProdMap[a] ?? 0)), 0);
        row.push(totalBom);
        row.push(Math.ceil(totalUsage));
        data.push(row);
      }

      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [
        { wch: 15 }, // Part No
        { wch: 18 }, // Part No AS400
        { wch: 25 }, // Supplier
        { wch: 30 }, // Part Name
        { wch: 10 }, // Unit
        ...assyCodes.map(() => ({ wch: 12 })),
        { wch: 12 }, // Total BOM
        { wch: 12 }, // Total Usage
      ];

      XLSX.utils.book_append_sheet(wb, ws, `Report_${periode}`);
      const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
      return new Response(buffer, {
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="report_${periode}.xlsx"`,
        },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // MODE GABUNGAN (non-download) — query dari mv_bom_gabungan
    // ═══════════════════════════════════════════════════════════════
    if (isGabungan) {
      const periodeResult = await pool.query(
        `SELECT DISTINCT periode FROM mv_bom_gabungan
         WHERE periode >= $1 AND periode <= $2 ORDER BY periode`,
        [dari, sampai]
      );
      const periodeList: string[] = periodeResult.rows.map((r: { periode: string }) => r.periode);

      const assyQuery = hasAssyFilter
        ? `SELECT DISTINCT assy_code FROM mv_bom_gabungan
           WHERE periode >= $1 AND periode <= $2 AND assy_code = ANY($3::text[])
           ORDER BY assy_code`
        : `SELECT DISTINCT assy_code FROM mv_bom_gabungan
           WHERE periode >= $1 AND periode <= $2 ORDER BY assy_code`;
      const assyRes   = await pool.query(assyQuery, hasAssyFilter ? [dari, sampai, assyParams] : [dari, sampai]);
      const assyCodes: string[] = assyRes.rows.map((r: { assy_code: string }) => r.assy_code);

      const prodRes = await pool.query(
        `SELECT assy_code, periode, COALESCE(prod_qty, 0) AS prod_qty
         FROM prod_plan WHERE periode >= $1 AND periode <= $2`,
        [dari, sampai]
      );
      const prodMap: Record<string, Record<string, number>> = {};
      for (const r of prodRes.rows) {
        if (!prodMap[r.assy_code]) prodMap[r.assy_code] = {};
        prodMap[r.assy_code][r.periode] = Number(r.prod_qty);
      }

      const { where: countWhere, extraParams: countExtra } = buildWhere(
        'periode >= $1 AND periode <= $2', 3
      );
      const countResult = await pool.query(
        `SELECT COUNT(DISTINCT part_no) FROM mv_bom_gabungan WHERE ${countWhere}`,
        [dari, sampai, ...countExtra]
      );
      const totalParts = Number(countResult.rows[0].count);

      const { where: partsWhere, extraParams: partsExtra, nextIdx } = buildWhere(
        'periode >= $1 AND periode <= $2', 3
      );
      const partsResult = await pool.query(
        `SELECT DISTINCT part_no, part_no_as400, part_name, unit, supplier_name
         FROM mv_bom_gabungan WHERE ${partsWhere}
         ORDER BY part_no LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
        [dari, sampai, ...partsExtra, limit, offset]
      );
      const partNos: string[] = partsResult.rows.map((r: { part_no: string }) => r.part_no);

      const qtyResult = await pool.query(
        hasAssyFilter
          ? `SELECT part_no, assy_code, periode, qty_per_unit
             FROM mv_bom_gabungan
             WHERE periode >= $1 AND periode <= $2
               AND part_no = ANY($3) AND assy_code = ANY($4::text[])`
          : `SELECT part_no, assy_code, periode, qty_per_unit
             FROM mv_bom_gabungan
             WHERE periode >= $1 AND periode <= $2 AND part_no = ANY($3)`,
        hasAssyFilter ? [dari, sampai, partNos, assyParams] : [dari, sampai, partNos]
      );

      const qtyMap: Record<string, Record<string, Record<string, number>>> = {};
      for (const row of qtyResult.rows) {
        if (!qtyMap[row.part_no])                qtyMap[row.part_no] = {};
        if (!qtyMap[row.part_no][row.assy_code]) qtyMap[row.part_no][row.assy_code] = {};
        qtyMap[row.part_no][row.assy_code][row.periode] = Number(row.qty_per_unit);
      }

      const gabunganKey = `${dari}_${sampai}`;
      return NextResponse.json({
        periodes: periodeList,
        results: {
          [gabunganKey]: {
            assy_codes:   assyCodes,
            prod_qty_map: prodMap,
            parts:        partsResult.rows,
            qty_map:      qtyMap,
            total_parts:  totalParts,
            page,
            limit,
          },
        },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // MODE SINGLE PERIODE (non-download) — query dari mv_bom_gabungan
    // ═══════════════════════════════════════════════════════════════
    const per = periode!;

    const assyQuery = hasAssyFilter
      ? `SELECT DISTINCT assy_code FROM mv_bom_gabungan
         WHERE periode = $1 AND assy_code = ANY($2::text[]) ORDER BY assy_code`
      : `SELECT DISTINCT assy_code FROM mv_bom_gabungan
         WHERE periode = $1 ORDER BY assy_code`;
    const assyRes   = await pool.query(assyQuery, hasAssyFilter ? [per, assyParams] : [per]);
    const assyCodes: string[] = assyRes.rows.map((r: { assy_code: string }) => r.assy_code);

    const prodRes = await pool.query(
      `SELECT assy_code, COALESCE(prod_qty, 0) AS prod_qty FROM prod_plan WHERE periode = $1`,
      [per]
    );
    const prodMap: Record<string, number> = {};
    prodRes.rows.forEach((r: { assy_code: string; prod_qty: string }) => {
      prodMap[r.assy_code] = Number(r.prod_qty);
    });

    const countBase = hasAssyFilter ? [per, assyParams] : [per];
    const { where: sw, extraParams: se } = buildWhere(
      hasAssyFilter ? 'periode = $1 AND assy_code = ANY($2::text[])' : 'periode = $1',
      hasAssyFilter ? 3 : 2
    );
    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT part_no) FROM mv_bom_gabungan WHERE ${sw}`,
      [...countBase, ...se]
    );
    const totalParts = Number(countResult.rows[0].count);

    const { where: pw, extraParams: pe, nextIdx: pni } = buildWhere(
      hasAssyFilter ? 'periode = $1 AND assy_code = ANY($2::text[])' : 'periode = $1',
      hasAssyFilter ? 3 : 2
    );
    const partsResult = await pool.query(
      `SELECT DISTINCT part_no, part_no_as400, part_name, unit, supplier_name
       FROM mv_bom_gabungan WHERE ${pw}
       ORDER BY part_no LIMIT $${pni} OFFSET $${pni + 1}`,
      [...countBase, ...pe, limit, offset]
    );
    const partNos: string[] = partsResult.rows.map((r: { part_no: string }) => r.part_no);

    const qtyResult = await pool.query(
      hasAssyFilter
        ? `SELECT part_no, assy_code, qty_per_unit FROM mv_bom_gabungan
           WHERE periode = $1 AND part_no = ANY($2) AND assy_code = ANY($3::text[])`
        : `SELECT part_no, assy_code, qty_per_unit FROM mv_bom_gabungan
           WHERE periode = $1 AND part_no = ANY($2)`,
      hasAssyFilter ? [per, partNos, assyParams] : [per, partNos]
    );

    const qtyMap: Record<string, Record<string, number>> = {};
    for (const row of qtyResult.rows) {
      if (!qtyMap[row.part_no]) qtyMap[row.part_no] = {};
      qtyMap[row.part_no][row.assy_code] = Number(row.qty_per_unit);
    }

    return NextResponse.json({
      periodes: [per],
      results: {
        [per]: {
          assy_codes:   assyCodes,
          prod_qty_map: prodMap,
          parts:        partsResult.rows,
          qty_map:      qtyMap,
          total_parts:  totalParts,
          page,
          limit,
        },
      },
    });

  } catch (error) {
    console.error('[Report Error]', error);
    return NextResponse.json({ error: 'Gagal memuat Report' }, { status: 500 });
  }
}
