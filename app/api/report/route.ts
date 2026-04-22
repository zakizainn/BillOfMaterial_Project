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

    // ─── MODE GABUNGAN ────────────────────────────────────────────────────────
    // Untuk gabungan: gabungkan semua periode, hasilkan satu result entry
    // dengan prod_qty_map nested: { assy_code: { periode: qty } }
    if (isGabungan) {
      // 1. ASSY codes (union semua periode)
      const assyQuery = assyFilter
        ? `SELECT DISTINCT assy_code FROM bom_detail WHERE periode >= $1 AND periode <= $2 AND assy_code = ANY($3::text[]) ORDER BY assy_code`
        : `SELECT DISTINCT assy_code FROM bom_detail WHERE periode >= $1 AND periode <= $2 ORDER BY assy_code`;
      const assyRes   = await pool.query(assyQuery, assyFilter ? [dari, sampai, assyParams] : [dari, sampai]);
      const assyCodes = assyRes.rows.map((r: { assy_code: string }) => r.assy_code);

      // 2. Prod qty semua periode — nested map { assy_code: { periode: qty } }
      const prodRes = await pool.query(
        `SELECT assy_code, periode, COALESCE(prod_qty, 0) AS prod_qty
         FROM prod_plan
         WHERE periode >= $1 AND periode <= $2`,
        [dari, sampai]
      );
      const prodMap: Record<string, Record<string, number>> = {};
      for (const r of prodRes.rows) {
        if (!prodMap[r.assy_code]) prodMap[r.assy_code] = {};
        prodMap[r.assy_code][r.periode] = Number(r.prod_qty);
      }

      // 3. Parts (distinct, paginated)
      const searchWhere = search ? `AND (b.part_no ILIKE $3 OR mp.part_name ILIKE $3)` : '';
      const assyWhere   = assyFilter ? `AND b.assy_code = ANY($${search ? 4 : 3}::text[])` : '';

      const countBaseParams: (string | string[])[] = [dari!, sampai!];
      if (search)     countBaseParams.push(`%${search}%`);
      if (assyFilter) countBaseParams.push(assyParams);

      const countResult = await pool.query(`
        SELECT COUNT(DISTINCT b.part_no)
        FROM bom_detail b
        LEFT JOIN master_part mp ON mp.part_no = b.part_no
        WHERE b.periode >= $1 AND b.periode <= $2
        ${searchWhere} ${assyWhere}
      `, countBaseParams);
      const totalParts = Number(countResult.rows[0].count);

      let partsResult;
      if (download) {
        partsResult = await pool.query(`
          SELECT DISTINCT b.part_no, mp.part_no_as400, mp.part_name, mp.unit, mp.supplier_name
          FROM bom_detail b
          LEFT JOIN master_part mp ON mp.part_no = b.part_no
          WHERE b.periode >= $1 AND b.periode <= $2
          ${searchWhere} ${assyWhere}
          ORDER BY b.part_no
        `, countBaseParams);
      } else {
        const dataParams = [...countBaseParams, limit, offset];
        const lastIdx = dataParams.length;
        partsResult = await pool.query(`
          SELECT DISTINCT b.part_no, mp.part_no_as400, mp.part_name, mp.unit, mp.supplier_name
          FROM bom_detail b
          LEFT JOIN master_part mp ON mp.part_no = b.part_no
          WHERE b.periode >= $1 AND b.periode <= $2
          ${searchWhere} ${assyWhere}
          ORDER BY b.part_no
          LIMIT $${lastIdx - 1} OFFSET $${lastIdx}
        `, dataParams);
      }

      const partNos = partsResult.rows.map((r: { part_no: string }) => r.part_no);

      // 4. Qty map per part per assy per periode
      //    qtyMap: { part_no: { assy_code: { periode: qty } } }
      const qtyResult = await pool.query(`
        SELECT part_no, assy_code, periode, qty_per_unit
        FROM bom_detail
        WHERE periode >= $1 AND periode <= $2 AND part_no = ANY($3)
        ${assyFilter ? `AND assy_code = ANY($4::text[])` : ''}
      `, assyFilter ? [dari, sampai, partNos, assyParams] : [dari, sampai, partNos]);

      const qtyMap: Record<string, Record<string, Record<string, number>>> = {};
      for (const row of qtyResult.rows) {
        if (!qtyMap[row.part_no]) qtyMap[row.part_no] = {};
        if (!qtyMap[row.part_no][row.assy_code]) qtyMap[row.part_no][row.assy_code] = {};
        qtyMap[row.part_no][row.assy_code][row.periode] = Number(row.qty_per_unit);
      }

      if (download) {
        // Untuk download gabungan: buat sheet per periode
        const wb = XLSX.utils.book_new();
        for (const per of periodeList) {
          const headers = ['Part No', 'Part No AS400', 'Supplier', 'Part Name', 'Unit', ...assyCodes, 'Total BOM', 'Total Usage'];
          const prodQtyRow = ['PROD QTY →', '', '', '', '', ...assyCodes.map(a => prodMap[a]?.[per] ?? 0), '', ''];
          const data = [headers, prodQtyRow];
          for (const part of partsResult.rows) {
            const row = [
              part.part_no,
              part.part_no_as400 || '',
              part.supplier_name || '',
              part.part_name || '',
              part.unit || '',
              ...assyCodes.map(a => qtyMap[part.part_no]?.[a]?.[per] ?? 0),
              assyCodes.reduce((sum, a) => sum + (qtyMap[part.part_no]?.[a]?.[per] ?? 0), 0),
              Math.ceil(assyCodes.reduce((sum, a) => sum + ((qtyMap[part.part_no]?.[a]?.[per] ?? 0) * (prodMap[a]?.[per] ?? 0)), 0)),
            ];
            data.push(row);
          }
          const ws = XLSX.utils.aoa_to_sheet(data);
          ws['!cols'] = headers.map(h => ({ wch: Math.min(Math.max(h.length + 2, 12), 30) }));
          XLSX.utils.book_append_sheet(wb, ws, per);
        }
        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
        return new Response(buffer, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="report_${dari}_${sampai}.xlsx"`,
          },
        });
      }

      // Response gabungan: satu entry dengan semua periode
      const gabunganKey = `${dari}_${sampai}`;
      return NextResponse.json({
        periodes: periodeList,
        results: {
          [gabunganKey]: {
            assy_codes:   assyCodes,
            prod_qty_map: prodMap,   // { assy_code: { periode: qty } }  ← NESTED
            parts:        partsResult.rows,
            qty_map:      qtyMap,    // { part_no: { assy_code: { periode: qty } } } ← NESTED
            total_parts:  totalParts,
            page,
            limit,
          }
        }
      });
    }

    // ─── MODE SINGLE PERIODE ──────────────────────────────────────────────────
    const results: Record<string, unknown> = {};

    for (const per of periodeList) {
      // Ambil ASSY codes
      const assyQuery = assyFilter
        ? `SELECT DISTINCT assy_code FROM bom_detail WHERE periode = $1 AND assy_code = ANY($2::text[]) ORDER BY assy_code`
        : `SELECT DISTINCT assy_code FROM bom_detail WHERE periode = $1 ORDER BY assy_code`;
      const assyRes   = await pool.query(assyQuery, assyFilter ? [per, assyParams] : [per]);
      const assyCodes = assyRes.rows.map((r: { assy_code: string }) => r.assy_code);

      // Prod qty per ASSY — flat map untuk single periode
      const prodRes = await pool.query(
        `SELECT assy_code, COALESCE(prod_qty, 0) AS prod_qty FROM prod_plan WHERE periode = $1`,
        [per]
      );
      const prodMap: Record<string, number> = {};
      prodRes.rows.forEach((r: { assy_code: string; prod_qty: number }) => {
        prodMap[r.assy_code] = Number(r.prod_qty);
      });

      const searchWhere  = search ? `AND (b.part_no ILIKE $${assyFilter ? 3 : 2} OR mp.part_name ILIKE $${assyFilter ? 3 : 2})` : '';
      const searchParams = search ? [`%${search}%`] : [];
      const baseParams   = [per, ...(assyFilter ? [assyParams] : [])];

      let partsResult;
      let totalParts = 0;

      if (download) {
        partsResult = await pool.query(`
          SELECT DISTINCT b.part_no, mp.part_no_as400, mp.part_name, mp.unit, mp.supplier_name
          FROM bom_detail b
          LEFT JOIN master_part mp ON mp.part_no = b.part_no
          WHERE b.periode = $1
          ${assyFilter ? `AND b.assy_code = ANY($2::text[])` : ''}
          ${searchWhere}
          ORDER BY b.part_no
        `, [...baseParams, ...searchParams]);
        totalParts = partsResult.rows.length;
      } else {
        const countResult = await pool.query(`
          SELECT COUNT(DISTINCT b.part_no) FROM bom_detail b
          LEFT JOIN master_part mp ON mp.part_no = b.part_no
          WHERE b.periode = $1
          ${assyFilter ? `AND b.assy_code = ANY($2::text[])` : ''}
          ${searchWhere}
        `, [...baseParams, ...searchParams]);
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
        const headers = ['Periode', 'Part No', 'Part No AS400', 'Supplier', 'Part Name', 'Unit', ...assyCodes, 'Total BOM', 'Total Usage'];
        const prodQtyRow = ['PROD QTY →', '', '', '', '', '', ...assyCodes.map(a => prodMap[a] ?? 0), '', ''];
        const data = [headers, prodQtyRow];
        for (const part of partsResult.rows) {
          const row = [
            per,
            part.part_no,
            part.part_no_as400 || '',
            part.supplier_name || '',
            part.part_name || '',
            part.unit || '',
            ...assyCodes.map(a => qtyMap[part.part_no]?.[a] ?? 0),
            assyCodes.reduce((sum, a) => sum + (qtyMap[part.part_no]?.[a] ?? 0), 0),
            Math.ceil(assyCodes.reduce((sum, a) => sum + ((qtyMap[part.part_no]?.[a] ?? 0) * (prodMap[a] ?? 0)), 0)),
          ];
          data.push(row);
        }
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = headers.map(h => ({ wch: Math.min(Math.max(h.length + 2, 12), 30) }));
        XLSX.utils.book_append_sheet(wb, ws, 'Report');
        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
        return new Response(buffer, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="report_${per}.xlsx"`,
          },
        });
      }

      results[per] = {
        assy_codes:   assyCodes,
        prod_qty_map: prodMap,  // flat: { assy_code: qty }
        parts:        partsResult.rows,
        qty_map:      qtyMap,   // flat: { part_no: { assy_code: qty } }
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