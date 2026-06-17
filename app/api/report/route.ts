import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET /api/report?periode=2026-06&page=1&limit=50&search=
// GET /api/report?dari=2026-01&sampai=2026-12&assy_codes=A1,A2&page=1&limit=50&search=
// GET /api/report?...&download=true  → download Excel (via export-stream)

export async function GET(request: Request) {
  try {
    const url        = new URL(request.url);
    const periode    = url.searchParams.get('periode');
    const dari       = url.searchParams.get('dari');
    const sampai     = url.searchParams.get('sampai');
    const assyFilter = url.searchParams.get('assy_codes');
    const page       = parseInt(url.searchParams.get('page')  || '1');
    const limit      = parseInt(url.searchParams.get('limit') || '50');
    const search     = url.searchParams.get('search') || '';
    const offset     = (page - 1) * limit;
    const isFooter   = url.searchParams.get('footer') === 'true';

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

    // ── HELPER: build WHERE clauses ──────────────────────────────
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

    const p1 = isGabungan ? dari! : periode!;
    const p2 = isGabungan ? sampai! : periode!;

    // ── FOOTER MODE ───────────────────────────────────────────────
    // Untuk gabungan: aggregate SUM col_sum dan prod_qty_sum per assy_code (tanpa periode)
    // Untuk single: sama seperti sebelumnya
    if (isFooter) {
      const params: unknown[] = [p1, p2];
      let idx = 3;
      const extraClauses: string[] = [];

      if (assyParams.length > 0) {
        extraClauses.push(`assy_code = ANY($${idx}::text[])`);
        params.push(assyParams); idx++;
      }
      if (hasSearch) {
        extraClauses.push(`(part_no ILIKE $${idx} OR part_name ILIKE $${idx})`);
        params.push(`%${search.trim()}%`); idx++;
      }

      const whereExtra = extraClauses.length ? ` AND ${extraClauses.join(' AND ')}` : '';

      if (isGabungan) {
        // Aggregate: col_sum per assy_code (SUM semua periode, tanpa GROUP BY periode)
        const result = await pool.query(
          `SELECT m.assy_code, SUM(m.qty_per_unit)::numeric AS col_sum
           FROM mv_bom_gabungan m
           WHERE m.periode >= $1 AND m.periode <= $2${whereExtra}
           GROUP BY m.assy_code
           ORDER BY m.assy_code`,
          params
        );

        // prod_qty_sum per assy_code
        const prodResult = await pool.query(
          `SELECT assy_code, COALESCE(SUM(prod_qty), 0) AS prod_qty_sum
           FROM prod_plan
           WHERE periode >= $1 AND periode <= $2 AND sequence IS NULL
           GROUP BY assy_code`,
          [p1, p2]
        );

        return NextResponse.json({
          col_sums: result.rows,
          prod_map: prodResult.rows,
        });
      } else {
        // Single: sama seperti sebelumnya
        const result = await pool.query(
          `SELECT assy_code, SUM(qty_per_unit)::numeric AS col_sum
           FROM mv_bom_gabungan
           WHERE periode >= $1 AND periode <= $2${whereExtra}
           GROUP BY assy_code
           ORDER BY assy_code`,
          params
        );

        const prodResult = await pool.query(
          `SELECT assy_code, COALESCE(prod_qty, 0) AS prod_qty
           FROM prod_plan WHERE periode = $1 AND sequence IS NULL`,
          [p1]
        );

        return NextResponse.json({
          col_sums: result.rows,
          prod_map: prodResult.rows,
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // MODE GABUNGAN (non-download) — AGGREGATE
    // qty_map: part_no → assy_code → qty  (flat, tanpa nested periode)
    // prod_qty_map: assy_code → prod_qty_sum (SUM semua periode)
    // ═══════════════════════════════════════════════════════════════
    if (isGabungan) {
      const assyQuery = hasAssyFilter
        ? `SELECT DISTINCT assy_code FROM mv_bom_gabungan
           WHERE periode >= $1 AND periode <= $2 AND assy_code = ANY($3::text[])
           ORDER BY assy_code`
        : `SELECT DISTINCT assy_code FROM mv_bom_gabungan
           WHERE periode >= $1 AND periode <= $2 ORDER BY assy_code`;
      const assyRes   = await pool.query(assyQuery, hasAssyFilter ? [p1, p2, assyParams] : [p1, p2]);
      const assyCodes: string[] = assyRes.rows.map((r: { assy_code: string }) => r.assy_code);

      // prod_qty_sum per assy_code (SUM semua periode)
      const prodRes = await pool.query(
        `SELECT assy_code, COALESCE(SUM(prod_qty), 0) AS prod_qty_sum
         FROM prod_plan
         WHERE periode >= $1 AND periode <= $2 AND sequence IS NULL
         GROUP BY assy_code`,
        [p1, p2]
      );
      // prod_qty_map: { assy_code: prod_qty_sum } — flat, bukan nested per periode
      const prodQtyMap: Record<string, number> = {};
      for (const r of prodRes.rows) {
        prodQtyMap[r.assy_code] = Number(r.prod_qty_sum);
      }

      // Count total parts
      const { where: countWhere, extraParams: countExtra } = buildWhere(
        'periode >= $1 AND periode <= $2', 3
      );
      const countResult = await pool.query(
        `SELECT COUNT(DISTINCT part_no) FROM mv_bom_gabungan WHERE ${countWhere}`,
        [p1, p2, ...countExtra]
      );
      const totalParts = Number(countResult.rows[0].count);

      // Parts list (paginated)
      const { where: partsWhere, extraParams: partsExtra, nextIdx } = buildWhere(
        'periode >= $1 AND periode <= $2', 3
      );
      const partsResult = await pool.query(
        `SELECT DISTINCT m.part_no, m.part_no_as400, m.part_name, m.unit, m.supplier_name,
                (SELECT pp.price FROM part_price pp
                 WHERE pp.part_no = m.part_no AND pp.periode >= $1 AND pp.periode <= $2
                 ORDER BY pp.periode DESC LIMIT 1) AS price
         FROM mv_bom_gabungan m
         WHERE ${partsWhere.replace(/part_no/g, 'm.part_no').replace(/part_name/g, 'm.part_name').replace(/periode/g, 'm.periode').replace(/assy_code/g, 'm.assy_code')}
         ORDER BY m.part_no LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
        [p1, p2, ...partsExtra, limit, offset]
      );
      const partNos: string[] = partsResult.rows.map((r: { part_no: string }) => r.part_no);

      // qty_map AGGREGATE: MAX qty_per_unit per (part_no, assy_code) semua periode
      // MAX dipakai karena qty_per_unit harusnya sama tiap periode (by design BOM)
      const qtyResult = await pool.query(
        hasAssyFilter
          ? `SELECT part_no, assy_code, MAX(qty_per_unit) AS qty_per_unit
             FROM mv_bom_gabungan
             WHERE periode >= $1 AND periode <= $2
               AND part_no = ANY($3) AND assy_code = ANY($4::text[])
             GROUP BY part_no, assy_code`
          : `SELECT part_no, assy_code, MAX(qty_per_unit) AS qty_per_unit
             FROM mv_bom_gabungan
             WHERE periode >= $1 AND periode <= $2 AND part_no = ANY($3)
             GROUP BY part_no, assy_code`,
        hasAssyFilter ? [p1, p2, partNos, assyParams] : [p1, p2, partNos]
      );

      // qty_map: { part_no: { assy_code: qty } } — FLAT (tanpa nested periode)
      const qtyMap: Record<string, Record<string, number>> = {};
      for (const row of qtyResult.rows) {
        if (!qtyMap[row.part_no]) qtyMap[row.part_no] = {};
        qtyMap[row.part_no][row.assy_code] = Number(row.qty_per_unit);
      }

      const gabunganKey = `${dari}_${sampai}`;
      return NextResponse.json({
        periodes: [],            // tidak dipakai di aggregate mode
        results: {
          [gabunganKey]: {
            assy_codes:   assyCodes,
            prod_qty_map: prodQtyMap,  // flat: { assy_code: prod_qty_sum }
            parts:        partsResult.rows,
            qty_map:      qtyMap,      // flat: { part_no: { assy_code: qty } }
            total_parts:  totalParts,
            page,
            limit,
          },
        },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // MODE SINGLE PERIODE (tidak berubah)
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
      `SELECT assy_code, COALESCE(prod_qty, 0) AS prod_qty
       FROM prod_plan WHERE periode = $1 AND sequence IS NULL`,
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
      `SELECT DISTINCT m.part_no, m.part_no_as400, m.part_name, m.unit, m.supplier_name,
              (SELECT pp.price FROM part_price pp WHERE pp.part_no = m.part_no AND pp.periode = $1 LIMIT 1) AS price
       FROM mv_bom_gabungan m
       WHERE ${pw.replace(/part_no/g, 'm.part_no').replace(/part_name/g, 'm.part_name').replace(/periode/g, 'm.periode').replace(/assy_code/g, 'm.assy_code')}
       ORDER BY m.part_no LIMIT $${pni} OFFSET $${pni + 1}`,
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