import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import pool from '@/lib/db';

// GET /api/report?periode=2026-06&page=1&limit=50&search=
// GET /api/report?dari=2026-01&sampai=2026-06&assy_codes=A1,A2&page=1&limit=50&search=
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

    const isGabungan = !periode && dari && sampai;

    // Tentukan periode list
    let periodeList: string[] = [];
    if (isGabungan) {
      const pr = await pool.query(
        `SELECT DISTINCT periode FROM bom_detail WHERE periode >= $1 AND periode <= $2 ORDER BY periode`,
        [dari, sampai]
      );
      periodeList = pr.rows.map((r: { periode: string }) => r.periode);
    } else if (periode) {
      periodeList = [periode];
    } else {
      return NextResponse.json({ error: 'Parameter periode atau dari+sampai wajib diisi' }, { status: 400 });
    }

    const assyParams = assyFilter ? assyFilter.split(',').map(a => a.trim()) : [];

    const results: Record<string, unknown> = {};

    for (const per of periodeList) {
      // Ambil ASSY codes
      const assyQuery = assyFilter
        ? `SELECT DISTINCT assy_code FROM bom_detail WHERE periode = $1 AND assy_code = ANY($2::text[]) ORDER BY assy_code`
        : `SELECT DISTINCT assy_code FROM bom_detail WHERE periode = $1 ORDER BY assy_code`;
      const assyRes   = await pool.query(assyQuery, assyFilter ? [per, assyParams] : [per]);
      const assyCodes = assyRes.rows.map((r: { assy_code: string }) => r.assy_code);

      // Prod qty per ASSY
      const prodRes = await pool.query(
        `SELECT assy_code, COALESCE(prod_qty, 0) AS prod_qty FROM prod_plan WHERE periode = $1`,
        [per]
      );
      const prodMap: Record<string, number> = {};
      prodRes.rows.forEach((r: { assy_code: string; prod_qty: number }) => {
        prodMap[r.assy_code] = Number(r.prod_qty);
      });

      const searchWhere = search ? `AND (b.part_no ILIKE $${assyFilter ? 3 : 2} OR mp.part_name ILIKE $${assyFilter ? 3 : 2})` : '';
      const searchParams = search ? [`%${search}%`] : [];
      const baseParams = [per, ...(assyFilter ? [assyParams] : [])];

      let partsResult;
      let totalParts = 0;

      if (download) {
        const dataParams = [...baseParams, ...searchParams];
        partsResult = await pool.query(`
          SELECT DISTINCT b.part_no, mp.part_no_as400, mp.part_name, mp.unit, mp.supplier_name
          FROM bom_detail b
          LEFT JOIN master_part mp ON mp.part_no = b.part_no
          WHERE b.periode = $1
          ${assyFilter ? `AND b.assy_code = ANY($2::text[])` : ''}
          ${searchWhere}
          ORDER BY b.part_no
        `, dataParams);
        totalParts = partsResult.rows.length;
      } else {
        const countParams = [...baseParams, ...searchParams];
        const countResult = await pool.query(`
          SELECT COUNT(DISTINCT b.part_no) FROM bom_detail b
          LEFT JOIN master_part mp ON mp.part_no = b.part_no
          WHERE b.periode = $1
          ${assyFilter ? `AND b.assy_code = ANY($2::text[])` : ''}
          ${searchWhere}
        `, countParams);
        totalParts = Number(countResult.rows[0].count);

        const dataParams = [...baseParams, ...searchParams, limit, offset];
        const lastIdx = dataParams.length;
        partsResult = await pool.query(`
          SELECT DISTINCT b.part_no, mp.part_no_as400, mp.part_name, mp.unit, mp.supplier_name
          FROM bom_detail b
          LEFT JOIN master_part mp ON mp.part_no = b.part_no
          WHERE b.periode = $1
          ${assyFilter ? `AND b.assy_code = ANY($2::text[])` : ''}
          ${searchWhere}
          ORDER BY b.part_no
          LIMIT $${lastIdx - 1} OFFSET $${lastIdx}
        `, dataParams);
      }

      const partNos = partsResult.rows.map((r: { part_no: string }) => r.part_no);
      const qtyResult = await pool.query(`
        SELECT part_no, assy_code, qty_per_unit
        FROM bom_detail
        WHERE periode = $1 AND part_no = ANY($2)
        ${assyFilter ? `AND assy_code = ANY($3::text[])` : ''}
      `, assyFilter ? [per, partNos, assyParams] : [per, partNos]);

      const qtyMap: Record<string, Record<string, number>> = {};
      for (const row of qtyResult.rows) {
        if (!qtyMap[row.part_no]) qtyMap[row.part_no] = {};
        qtyMap[row.part_no][row.assy_code] = Number(row.qty_per_unit);
      }

      if (download) {
        const headers = ['Periode', 'Part No', 'Part No AS400', 'Supplier', 'Part Name', 'Unit', ...assyCodes, 'Total', 'Total Usage'];
        const prodQtyRow = ['PROD QTY →', '', '', '', '', '', ...assyCodes.map(assy => prodMap[assy] ?? 0), '', ''];
        const data = [headers, prodQtyRow];

        for (const part of partsResult.rows) {
          const row = [
            per,
            part.part_no,
            part.part_no_as400 || '',
            part.supplier_name || '',
            part.part_name || '',
            part.unit || '',
            ...assyCodes.map(assy => qtyMap[part.part_no]?.[assy] ?? 0),
            assyCodes.reduce((sum, assy) => sum + (qtyMap[part.part_no]?.[assy] ?? 0), 0),
            Math.ceil(assyCodes.reduce((sum, assy) => sum + ((qtyMap[part.part_no]?.[assy] ?? 0) * (prodMap[assy] ?? 0)), 0)),
          ];
          data.push(row);
        }

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = headers.map((header) => ({ wch: Math.min(Math.max(header.length + 2, 12), 30) }));
        XLSX.utils.book_append_sheet(wb, ws, 'Report');

        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
        const filename = periode
          ? `report_${periode}.xlsx`
          : `report_${dari || 'from'}_${sampai || 'to'}.xlsx`;
        return new Response(buffer, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        });
      }

      results[per] = {
        assy_codes:   assyCodes,
        prod_qty_map: prodMap,
        parts:        partsResult.rows,
        qty_map:      qtyMap,
        total_parts:  totalParts,
        page,
        limit,
      };
    }

    return NextResponse.json({ periodes: periodeList, results });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Gagal memuat Report' }, { status: 500 });
  }
}