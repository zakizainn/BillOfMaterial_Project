import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET /api/bom/gabungan?dari=2025-10&sampai=2026-09&mode=list|pivot&page=1&limit=50&search=
//
// Optimasi vs versi lama:
//  - Query dari mv_bom_gabungan (materialized view pre-join) bukan bom_detail langsung
//  - Pivot mode: long format dari DB, transform ke pivot di memory Node.js
//  - Pagination by part_no agar jumlah rows per halaman terkontrol
//  - Semua query pakai index (periode, part_no, assy_code)

export async function GET(request: Request) {
  try {
    const url    = new URL(request.url);
    const dari   = url.searchParams.get('dari')   || '';
    const sampai = url.searchParams.get('sampai') || '';
    const mode   = url.searchParams.get('mode')   || 'list';
    const page   = parseInt(url.searchParams.get('page')  || '1');
    const limit  = parseInt(url.searchParams.get('limit') || '50');
    const search = url.searchParams.get('search') || '';
    const offset = (page - 1) * limit;

    if (!dari || !sampai) {
      return NextResponse.json(
        { error: 'Parameter dari dan sampai wajib diisi' },
        { status: 400 }
      );
    }

    // Ambil daftar periode dalam range (dari mv, bukan scan penuh bom_detail)
    const periodeResult = await pool.query(
      `SELECT DISTINCT periode
       FROM mv_bom_gabungan
       WHERE periode >= $1 AND periode <= $2
       ORDER BY periode`,
      [dari, sampai]
    );
    const periodes: string[] = periodeResult.rows.map((r: { periode: string }) => r.periode);

    if (periodes.length === 0) {
      return NextResponse.json({ rows: [], total: 0, periodes: [], assy_codes: [], parts: [], qty_map: {} });
    }

    // ─── SEARCH CLAUSE ──────────────────────────────────────────
    const hasSearch   = search.trim().length > 0;
    const searchParam = hasSearch ? `%${search.trim()}%` : null;

    // ─── LIST MODE ───────────────────────────────────────────────
    if (mode === 'list') {
      // Count kombinasi part+assy unik di range
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM (
           SELECT DISTINCT part_no, assy_code
           FROM mv_bom_gabungan
           WHERE periode >= $1 AND periode <= $2
             ${hasSearch ? "AND (part_no ILIKE $3 OR assy_code ILIKE $3 OR part_name ILIKE $3)" : ''}
         ) t`,
        hasSearch ? [dari, sampai, searchParam] : [dari, sampai]
      );
      const total = Number(countResult.rows[0].count);

      // Ambil halaman kombinasi part+assy
      const pairResult = await pool.query(
        `SELECT DISTINCT part_no, assy_code, part_name, unit, supplier_name
         FROM mv_bom_gabungan
         WHERE periode >= $1 AND periode <= $2
           ${hasSearch ? "AND (part_no ILIKE $3 OR assy_code ILIKE $3 OR part_name ILIKE $3)" : ''}
         ORDER BY part_no, assy_code
         LIMIT $${hasSearch ? 4 : 3} OFFSET $${hasSearch ? 5 : 4}`,
        hasSearch
          ? [dari, sampai, searchParam, limit, offset]
          : [dari, sampai, limit, offset]
      );

      const pairs = pairResult.rows as { part_no: string; assy_code: string }[];
      if (pairs.length === 0) {
        return NextResponse.json({ rows: [], total, periodes, qty_map: {} });
      }

      const partNos  = [...new Set(pairs.map(p => p.part_no))];
      const assyCodes = [...new Set(pairs.map(p => p.assy_code))];

      // Ambil qty untuk kombinasi di halaman ini (long format, cepat)
      const qtyResult = await pool.query(
        `SELECT part_no, assy_code, periode, qty_per_unit
         FROM mv_bom_gabungan
         WHERE periode >= $1 AND periode <= $2
           AND part_no   = ANY($3)
           AND assy_code = ANY($4)`,
        [dari, sampai, partNos, assyCodes]
      );

      // Build qty_map: { part_no: { assy_code: { periode: qty } } }
      const qtyMap: Record<string, Record<string, Record<string, number>>> = {};
      for (const row of qtyResult.rows) {
        if (!qtyMap[row.part_no])              qtyMap[row.part_no] = {};
        if (!qtyMap[row.part_no][row.assy_code]) qtyMap[row.part_no][row.assy_code] = {};
        qtyMap[row.part_no][row.assy_code][row.periode] = Number(row.qty_per_unit);
      }

      return NextResponse.json({
        rows: pairResult.rows,
        total,
        page,
        limit,
        periodes,
        qty_map: qtyMap,
      });
    }

    // ─── PIVOT MODE ──────────────────────────────────────────────
    // Strategi: ambil distinct ASSY + distinct Part (paginated by part),
    //           lalu long-format data hanya untuk part di halaman ini,
    //           transform ke pivot di memory.

    // 1. Distinct ASSY codes dalam range (untuk header kolom)
    const assyResult = await pool.query(
      `SELECT DISTINCT assy_code
       FROM mv_bom_gabungan
       WHERE periode >= $1 AND periode <= $2
       ORDER BY assy_code`,
      [dari, sampai]
    );
    const assyCodes: string[] = assyResult.rows.map((r: { assy_code: string }) => r.assy_code);

    // 2. Count distinct part_no
    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT part_no)
       FROM mv_bom_gabungan
       WHERE periode >= $1 AND periode <= $2
         ${hasSearch ? "AND (part_no ILIKE $3 OR part_name ILIKE $3)" : ''}`,
      hasSearch ? [dari, sampai, searchParam] : [dari, sampai]
    );
    const totalParts = Number(countResult.rows[0].count);

    // 3. Part list untuk halaman ini
    const partsResult = await pool.query(
      `SELECT DISTINCT part_no, part_name, part_no_as400, unit, supplier_name
       FROM mv_bom_gabungan
       WHERE periode >= $1 AND periode <= $2
         ${hasSearch ? "AND (part_no ILIKE $3 OR part_name ILIKE $3)" : ''}
       ORDER BY part_no
       LIMIT $${hasSearch ? 4 : 3} OFFSET $${hasSearch ? 5 : 4}`,
      hasSearch
        ? [dari, sampai, searchParam, limit, offset]
        : [dari, sampai, limit, offset]
    );
    const partNos: string[] = partsResult.rows.map((r: { part_no: string }) => r.part_no);

    if (partNos.length === 0) {
      return NextResponse.json({
        assy_codes: assyCodes,
        parts: [],
        qty_map: {},
        total: totalParts,
        page,
        limit,
        periodes,
      });
    }

    // 4. Long-format data hanya untuk part di halaman ini
    //    Query ini sangat efisien karena: part_no = ANY(array kecil) + index periode
    const qtyResult = await pool.query(
      `SELECT part_no, assy_code, periode, qty_per_unit
       FROM mv_bom_gabungan
       WHERE periode >= $1 AND periode <= $2
         AND part_no = ANY($3)`,
      [dari, sampai, partNos]
    );

    // 5. Transform long → pivot di memory (O(n) scan, sangat cepat di Node.js)
    //    qtyMap: { part_no: { assy_code: { periode: qty } } }
    const qtyMap: Record<string, Record<string, Record<string, number>>> = {};
    for (const row of qtyResult.rows as { part_no: string; assy_code: string; periode: string; qty_per_unit: string }[]) {
      if (!qtyMap[row.part_no])                qtyMap[row.part_no] = {};
      if (!qtyMap[row.part_no][row.assy_code]) qtyMap[row.part_no][row.assy_code] = {};
      qtyMap[row.part_no][row.assy_code][row.periode] = Number(row.qty_per_unit);
    }

    return NextResponse.json({
      assy_codes: assyCodes,
      parts:      partsResult.rows,
      qty_map:    qtyMap,
      total:      totalParts,
      page,
      limit,
      periodes,
    });

  } catch (error) {
    console.error('[BOM Gabungan Error]', error);
    return NextResponse.json({ error: 'Gagal memuat BOM gabungan' }, { status: 500 });
  }
}
