import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET /api/total-usage?periode=2026-03
// GET /api/total-usage?dari=2026-01&sampai=2026-03&assy_codes=A1,A2,A3 (mode gabungan)
export async function GET(request: Request) {
  try {
    const url        = new URL(request.url);
    const periode    = url.searchParams.get('periode');
    const dari       = url.searchParams.get('dari');
    const sampai     = url.searchParams.get('sampai');
    const assyFilter = url.searchParams.get('assy_codes'); // comma separated

    // Mode gabungan
    const isGabungan = !periode && dari && sampai;
    const periodeList: string[] = [];

    if (isGabungan) {
      const pr = await pool.query(
        `SELECT DISTINCT periode FROM bom_detail WHERE periode >= $1 AND periode <= $2 ORDER BY periode`,
        [dari, sampai]
      );
      pr.rows.forEach((r: { periode: string }) => periodeList.push(r.periode));
    } else if (periode) {
      periodeList.push(periode);
    } else {
      return NextResponse.json({ error: 'Parameter periode atau dari+sampai wajib diisi' }, { status: 400 });
    }

    // Filter ASSY (mode gabungan)
    const assyWhere  = assyFilter ? `AND b.assy_code = ANY($${isGabungan ? 3 : 2}::text[])` : '';
    const assyParams = assyFilter ? assyFilter.split(',').map(a => a.trim()) : [];

    // Untuk setiap periode, ambil assy_codes + prod_qty
    const results: Record<string, {
      assy_codes: string[];
      prod_qty_map: Record<string, number>;
      parts: { part_no: string; part_no_as400: string; part_name: string; unit: string; supplier_name: string }[];
      qty_map: Record<string, Record<string, number>>;
    }> = {};

    for (const per of periodeList) {
      // Ambil ASSY codes untuk periode ini
      const assyQuery = assyFilter
        ? `SELECT DISTINCT assy_code FROM bom_detail WHERE periode = $1 AND assy_code = ANY($2::text[]) ORDER BY assy_code`
        : `SELECT DISTINCT assy_code FROM bom_detail WHERE periode = $1 ORDER BY assy_code`;
      const assyRes = await pool.query(assyQuery, assyFilter ? [per, assyParams] : [per]);
      const assyCodes = assyRes.rows.map((r: { assy_code: string }) => r.assy_code);

      // Prod qty per ASSY
      const prodRes = await pool.query(
        `SELECT assy_code, COALESCE(prod_qty, 0) as prod_qty FROM prod_plan WHERE periode = $1`,
        [per]
      );
      const prodMap: Record<string, number> = {};
      prodRes.rows.forEach((r: { assy_code: string; prod_qty: number }) => {
        prodMap[r.assy_code] = Number(r.prod_qty);
      });

      // Part data + qty_per_unit
      const partRes = await pool.query(`
        SELECT 
          b.part_no,
          mp.part_no_as400,
          mp.part_name,
          mp.unit,
          mp.supplier_name,
          b.assy_code,
          b.qty_per_unit
        FROM bom_detail b
        LEFT JOIN master_part mp ON mp.part_no = b.part_no
        WHERE b.periode = $1 ${assyFilter ? `AND b.assy_code = ANY($2::text[])` : ''}
        ORDER BY b.part_no, b.assy_code
      `, assyFilter ? [per, assyParams] : [per]);

      // Build parts list + qty_map
      const partsMap: Record<string, { part_no: string; part_no_as400: string; part_name: string; unit: string; supplier_name: string }> = {};
      const qtyMap: Record<string, Record<string, number>> = {};

      for (const row of partRes.rows) {
        if (!partsMap[row.part_no]) {
          partsMap[row.part_no] = {
            part_no: row.part_no,
            part_no_as400: row.part_no_as400 || row.part_no,
            part_name: row.part_name || row.part_no,
            unit: row.unit || 'PCS',
            supplier_name: row.supplier_name || '',
          };
        }
        if (!qtyMap[row.part_no]) qtyMap[row.part_no] = {};
        qtyMap[row.part_no][row.assy_code] = Number(row.qty_per_unit);
      }

      results[per] = {
        assy_codes:   assyCodes,
        prod_qty_map: prodMap,
        parts:        Object.values(partsMap),
        qty_map:      qtyMap,
      };
    }

    return NextResponse.json({ periodes: periodeList, results });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Gagal memuat Total Usage' }, { status: 500 });
  }
}
