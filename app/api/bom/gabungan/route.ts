import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET /api/bom/gabungan?dari=2025-10&sampai=2026-03&mode=list&page=1&limit=50&search=
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
      return NextResponse.json({ error: 'Parameter dari dan sampai wajib diisi' }, { status: 400 });
    }

    // Ambil daftar periode dalam range
    const periodeResult = await pool.query(
      `SELECT DISTINCT periode FROM bom_detail WHERE periode >= $1 AND periode <= $2 ORDER BY periode`,
      [dari, sampai]
    );
    const periodes = periodeResult.rows.map((r: { periode: string }) => r.periode);

    if (mode === 'list') {
      const searchWhere = search ? `AND (b.part_no ILIKE $3 OR b.assy_code ILIKE $3)` : '';
      const countParams = search ? [dari, sampai, `%${search}%`] : [dari, sampai];

      const countResult = await pool.query(`
        SELECT COUNT(*) FROM (
          SELECT DISTINCT part_no, assy_code FROM bom_detail
          WHERE periode >= $1 AND periode <= $2 ${searchWhere}
        ) t
      `, countParams);
      const total = Number(countResult.rows[0].count);

      const dataParams = search ? [dari, sampai, `%${search}%`, limit, offset] : [dari, sampai, limit, offset];
      const result = await pool.query(`
        SELECT DISTINCT b.part_no, b.assy_code, mp.part_name, mp.unit, mp.supplier_name
        FROM bom_detail b
        LEFT JOIN master_part mp ON mp.part_no = b.part_no
        WHERE b.periode >= $1 AND b.periode <= $2 ${searchWhere}
        ORDER BY b.part_no, b.assy_code
        LIMIT ${search ? '$4' : '$3'} OFFSET ${search ? '$5' : '$4'}
      `, dataParams);

      const partAssyList = result.rows.map((r: Record<string, string>) => ({ part_no: r.part_no, assy_code: r.assy_code }));

      // Ambil qty per periode untuk kombinasi part+assy di halaman ini
      const qtyResult = await pool.query(`
        SELECT part_no, assy_code, periode, qty_per_unit
        FROM bom_detail
        WHERE periode >= $1 AND periode <= $2
          AND (part_no, assy_code) IN (
            SELECT unnest($3::text[]), unnest($4::text[])
          )
      `, [
        dari, sampai,
        partAssyList.map((r: {part_no: string}) => r.part_no),
        partAssyList.map((r: {assy_code: string}) => r.assy_code),
      ]);

      // Build qty map: { part_no: { assy_code: { periode: qty } } }
      const qtyMap: Record<string, Record<string, Record<string, number>>> = {};
      for (const row of qtyResult.rows) {
        if (!qtyMap[row.part_no]) qtyMap[row.part_no] = {};
        if (!qtyMap[row.part_no][row.assy_code]) qtyMap[row.part_no][row.assy_code] = {};
        qtyMap[row.part_no][row.assy_code][row.periode] = Number(row.qty_per_unit);
      }

      return NextResponse.json({ rows: result.rows, total, page, limit, periodes, qty_map: qtyMap });

    } else {
      // Pivot mode — baris=part, kolom=assy (qty dipecah per periode di tooltip/cell)
      const searchWhere = search ? `AND b.part_no ILIKE $3` : '';
      const countParams = search ? [dari, sampai, `%${search}%`] : [dari, sampai];

      const assyResult = await pool.query(
        `SELECT DISTINCT assy_code FROM bom_detail WHERE periode >= $1 AND periode <= $2 ORDER BY assy_code`,
        [dari, sampai]
      );
      const assyCodes = assyResult.rows.map((r: { assy_code: string }) => r.assy_code);

      const countResult = await pool.query(
        `SELECT COUNT(DISTINCT part_no) FROM bom_detail WHERE periode >= $1 AND periode <= $2 ${searchWhere}`,
        countParams
      );
      const totalParts = Number(countResult.rows[0].count);

      const dataParams = search ? [dari, sampai, `%${search}%`, limit, offset] : [dari, sampai, limit, offset];
      const partsResult = await pool.query(`
        SELECT DISTINCT b.part_no, mp.part_name, mp.unit, mp.supplier_name
        FROM bom_detail b
        LEFT JOIN master_part mp ON mp.part_no = b.part_no
        WHERE b.periode >= $1 AND b.periode <= $2 ${searchWhere}
        ORDER BY b.part_no
        LIMIT ${search ? '$4' : '$3'} OFFSET ${search ? '$5' : '$4'}
      `, dataParams);

      const partNos = partsResult.rows.map((r: { part_no: string }) => r.part_no);

      // Ambil qty per part per assy per periode
      const qtyResult = await pool.query(`
        SELECT part_no, assy_code, periode, qty_per_unit
        FROM bom_detail
        WHERE periode >= $1 AND periode <= $2 AND part_no = ANY($3)
      `, [dari, sampai, partNos]);

      // qtyMap: { part_no: { assy_code: { periode: qty } } }
      const qtyMap: Record<string, Record<string, Record<string, number>>> = {};
      for (const row of qtyResult.rows) {
        if (!qtyMap[row.part_no]) qtyMap[row.part_no] = {};
        if (!qtyMap[row.part_no][row.assy_code]) qtyMap[row.part_no][row.assy_code] = {};
        qtyMap[row.part_no][row.assy_code][row.periode] = Number(row.qty_per_unit);
      }

      return NextResponse.json({ assy_codes: assyCodes, parts: partsResult.rows, qty_map: qtyMap, total: totalParts, page, limit, periodes });
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Gagal memuat BOM gabungan' }, { status: 500 });
  }
}
