import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET /api/bom/[periode] — detail BOM dengan pagination
export async function GET(
  request: Request,
  { params }: { params: Promise<{ periode: string }> }
) {
  try {
    const { periode } = await params;
    const url    = new URL(request.url);
    const mode   = url.searchParams.get('mode') || 'list';
    const page   = parseInt(url.searchParams.get('page') || '1');
    const limit  = parseInt(url.searchParams.get('limit') || '50');
    const search = url.searchParams.get('search') || '';
    const offset = (page - 1) * limit;

    if (mode === 'list') {
      // Mode list: part_no, assy_code, qty_per_unit
      const where = search
        ? `WHERE b.periode = $1 AND (b.part_no ILIKE $4 OR b.assy_code ILIKE $4)`
        : `WHERE b.periode = $1`;

      const countQuery = search
        ? `SELECT COUNT(*) FROM bom_detail b WHERE b.periode = $1 AND (b.part_no ILIKE $2 OR b.assy_code ILIKE $2)`
        : `SELECT COUNT(*) FROM bom_detail b WHERE b.periode = $1`;

      const countParams = search ? [periode, `%${search}%`] : [periode];
      const countResult = await pool.query(countQuery, countParams);
      const total = Number(countResult.rows[0].count);

      const dataParams = search
        ? [periode, limit, offset, `%${search}%`]
        : [periode, limit, offset];

      const result = await pool.query(`
        SELECT 
          b.part_no,
          b.assy_code,
          b.qty_per_unit,
          mp.part_name,
          mp.unit,
          mp.supplier_name,
          pp.price
        FROM bom_detail b
        LEFT JOIN master_part mp ON mp.part_no = b.part_no
        LEFT JOIN part_price  pp ON pp.part_no = b.part_no AND pp.periode = b.periode
        ${where}
        ORDER BY b.part_no, b.assy_code
        LIMIT $2 OFFSET $3
      `, dataParams);

      return NextResponse.json({ rows: result.rows, total, page, limit });

    } else {
      // Mode pivot: ambil semua assy codes + data per halaman part
      const assyResult = await pool.query(`
        SELECT DISTINCT assy_code FROM bom_detail
        WHERE periode = $1 ORDER BY assy_code
      `, [periode]);
      const assyCodes = assyResult.rows.map((r: {assy_code: string}) => r.assy_code);

      const countParams  = search ? [periode, `%${search}%`] : [periode];
      const countQuery   = search
        ? `SELECT COUNT(DISTINCT part_no) FROM bom_detail WHERE periode = $1 AND part_no ILIKE $2`
        : `SELECT COUNT(DISTINCT part_no) FROM bom_detail WHERE periode = $1`;

      const countResult = await pool.query(countQuery, countParams);
      const totalParts  = Number(countResult.rows[0].count);

      let partsResult;
      if (search) {
        const dataParams = [periode, `%${search}%`, limit, offset];
        partsResult = await pool.query(`
          SELECT b.part_no, mp.part_name, mp.unit, mp.supplier_name, pp.price
          FROM (SELECT DISTINCT part_no FROM bom_detail WHERE periode = $1 AND part_no ILIKE $2 ORDER BY part_no LIMIT $3 OFFSET $4) b
          LEFT JOIN master_part mp ON mp.part_no = b.part_no
          LEFT JOIN part_price  pp ON pp.part_no = b.part_no AND pp.periode = $1
          ORDER BY b.part_no
        `, dataParams);
      } else {
        const dataParams = [periode, limit, offset];
        partsResult = await pool.query(`
          SELECT b.part_no, mp.part_name, mp.unit, mp.supplier_name, pp.price
          FROM (SELECT DISTINCT part_no FROM bom_detail WHERE periode = $1 ORDER BY part_no LIMIT $2 OFFSET $3) b
          LEFT JOIN master_part mp ON mp.part_no = b.part_no
          LEFT JOIN part_price  pp ON pp.part_no = b.part_no AND pp.periode = $1
          ORDER BY b.part_no
        `, dataParams);
      }

      const partNos = partsResult.rows.map((r: {part_no: string}) => r.part_no);

      // Ambil qty untuk part yang ada di halaman ini
      const qtyResult = await pool.query(`
        SELECT part_no, assy_code, qty_per_unit
        FROM bom_detail
        WHERE periode = $1 AND part_no = ANY($2)
      `, [periode, partNos]);

      // Build lookup map
      const qtyMap: Record<string, Record<string, number>> = {};
      for (const row of qtyResult.rows) {
        if (!qtyMap[row.part_no]) qtyMap[row.part_no] = {};
        qtyMap[row.part_no][row.assy_code] = Number(row.qty_per_unit);
      }

      return NextResponse.json({
        assy_codes: assyCodes,
        parts: partsResult.rows,
        qty_map: qtyMap,
        total: totalParts,
        page,
        limit,
      });
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Gagal memuat detail BOM' }, { status: 500 });
  }
}

// DELETE /api/bom/[periode]
export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ periode: string }> }
) {
  const client = await pool.connect();
  try {
    const { periode } = await params;
    await client.query('BEGIN');
    await client.query('DELETE FROM bom_detail WHERE periode = $1', [periode]);
    await client.query('DELETE FROM prod_plan WHERE periode = $1', [periode]);
    await client.query(`DELETE FROM master_part WHERE part_no NOT IN (SELECT DISTINCT part_no FROM bom_detail)`);
    await client.query(`DELETE FROM master_assy WHERE assy_code NOT IN (SELECT DISTINCT assy_code FROM bom_detail)`);
    await client.query('COMMIT');
    return NextResponse.json({ message: `Periode ${periode} berhasil dihapus` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return NextResponse.json({ error: 'Gagal menghapus periode BOM' }, { status: 500 });
  } finally {
    client.release();
  }
}
