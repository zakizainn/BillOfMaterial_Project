import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET /api/report?periode=2026-06&page=1&limit=50&search=
// GET /api/report?dari=2026-01&sampai=2026-12&assy_codes=A1,A2&page=1&limit=50&search=
// GET /api/report?...&download=true  → download Excel (CSV-based, tanpa styling)

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
    // Format: CSV yang langsung bisa dibuka Excel
    // Struktur: persis tampilan web — kolom ASSY×Periode, baris PROD QTY, footer TOTAL PER ASSY
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
      const { where: pw, extraParams: pe, nextIdx: pni } = buildWhere(
        `periode >= $1 AND periode <= $2`, 3
      );
      const partsRes = await pool.query(
        `SELECT DISTINCT part_no, part_no_as400, part_name, unit, supplier_name
         FROM mv_bom_gabungan WHERE ${pw} ORDER BY part_no`,
        [p1, p2, ...pe]
      );
      const partNos: string[] = partsRes.rows.map((r: { part_no: string }) => r.part_no);

      // 4. Qty data: long format semua part sekaligus (efisien dari MV)
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
      // key: "part_no|assy_code|periode" → qty
      const lookup = new Map<string, number>();
      for (const r of qtyRes.rows) {
        lookup.set(`${r.part_no}|${r.assy_code}|${r.periode}`, Number(r.qty_per_unit));
      }

      // 6. Build kolom: ASSY × Periode (persis tampilan web)
      //    Untuk single periode: kolom = ASSY saja
      type ColDef = { assy: string; periode: string };
      const cols: ColDef[] = [];
      if (isGabungan) {
        for (const assy of assyCodes) {
          for (const per of periodeList) {
            cols.push({ assy, periode: per });
          }
        }
      } else {
        for (const assy of assyCodes) {
          cols.push({ assy, periode: periode! });
        }
      }

      // 7. Build CSV rows
      // Helper: escape CSV cell
      const esc = (v: string | number | null | undefined): string => {
        if (v === null || v === undefined || v === '') return '';
        const s = String(v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const lines: string[] = [];

      // ── Row 1: Header ASSY (group header)
      // Format: Part No, AS400, Supplier, Part Name, Unit, [ASSY...], TOTAL, TOTAL USAGE
      if (isGabungan) {
        // Untuk gabungan: 2 baris header
        // Baris 1: nama ASSY (span periodeList.length kolom per ASSY)
        const headerRow1 = [
          'PART NO', 'PART NO AS400', 'SUPPLIER', 'PART NAME', 'UNIT',
          ...assyCodes.flatMap(a => [
            a,
            ...Array(periodeList.length - 1).fill(''), // kolom kosong untuk span
          ]),
          'TOTAL', 'TOTAL USAGE',
        ];
        lines.push(headerRow1.map(esc).join(','));

        // Baris 2: sub-header periode per ASSY
        const headerRow2 = [
          '', '', '', '', '',
          ...assyCodes.flatMap(() => periodeList.map(p => p)),
          '', '',
        ];
        lines.push(headerRow2.map(esc).join(','));
      } else {
        // Single: 1 baris header saja
        const headerRow = [
          'PART NO', 'PART NO AS400', 'SUPPLIER', 'PART NAME', 'UNIT',
          ...assyCodes,
          'TOTAL', 'TOTAL USAGE',
        ];
        lines.push(headerRow.map(esc).join(','));
      }

      // ── Row PROD QTY
      const prodQtyRow = [
        'PROD QTY →', '', '', '', '',
        ...cols.map(col => {
          const qty = prodMap[col.assy]?.[col.periode] ?? 0;
          return qty > 0 ? qty : '';
        }),
        '', '',
      ];
      lines.push(prodQtyRow.map(esc).join(','));

      // ── Footer accumulator (dihitung seiring build data rows)
      const colSums = new Array(cols.length).fill(0);
      let footerTotalUsage = 0;

      // ── Data rows (stream-like: build per baris, tidak buffer semua sekaligus)
      for (const part of partsRes.rows) {
        let totalQty   = 0;
        let totalUsage = 0;
        const cells: (number | string)[] = [];

        for (let ci = 0; ci < cols.length; ci++) {
          const col = cols[ci];
          const qty = lookup.get(`${part.part_no}|${col.assy}|${col.periode}`) ?? 0;
          if (qty > 0) {
            cells.push(qty);
            totalQty   += qty;
            const prodQty = prodMap[col.assy]?.[col.periode] ?? 0;
            totalUsage  += qty * prodQty;
            colSums[ci] += qty;
          } else {
            cells.push('');
          }
        }

        const roundedUsage = Math.ceil(totalUsage);
        footerTotalUsage  += roundedUsage;

        const dataRow = [
          part.part_no,
          part.part_no_as400 || '',
          part.supplier_name || '',
          part.part_name     || '',
          part.unit          || '',
          ...cells,
          totalQty   > 0 ? totalQty   : '',
          roundedUsage > 0 ? roundedUsage : '',
        ];
        lines.push(dataRow.map(esc).join(','));
      }

      // ── Footer row: TOTAL PER ASSY
      const footerRow = [
        'TOTAL PER ASSY', '', '', '', '',
        ...colSums.map(s => s > 0 ? s : ''),
        '',
        footerTotalUsage > 0 ? footerTotalUsage : '',
      ];
      lines.push(footerRow.map(esc).join(','));

      // 8. Join semua baris jadi CSV string
      // Pakai \r\n agar Excel Windows tidak salah baca
      const csvContent = '\uFEFF' + lines.join('\r\n'); // BOM untuk Excel UTF-8
      const filename = isGabungan
        ? `report_${dari}_${sampai}.csv`
        : `report_${periode}.csv`;

      return new Response(csvContent, {
        headers: {
          'Content-Type':        'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // MODE GABUNGAN (non-download)
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
    // MODE SINGLE PERIODE (non-download)
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
