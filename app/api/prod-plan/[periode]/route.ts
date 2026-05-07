import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET /api/prod-plan/[periode]
// Arsitektur final:
// - bom_detail.sequence = NULL (by design, DESIGN upload BOM by assy_code only)
// - prod_plan.sequence  = NULL (Finance isi prod_qty by assy_code only)
// - master_assy.sequence = 1,2,3 (hanya untuk mastering/referensi, tidak dipakai di operasional)
export async function GET(
  _: Request,
  { params }: { params: Promise<{ periode: string }> }
) {
  try {
    const { periode } = await params;
    const result = await pool.query(`
      SELECT 
        b.assy_code,
        MIN(ma.sequence)     AS sequence,
        MIN(ma.description)  AS description,
        MIN(ma.carline)      AS carline,
        MIN(ma.destinasi)    AS destinasi,
        MIN(ma.komoditi)     AS komoditi,
        COALESCE(MAX(p.prod_qty), 0) AS prod_qty,
        MAX(p.updated_at)    AS updated_at,
        -- Variants: list semua carline unik dari master_assy untuk assy_code ini
        -- Dipakai sebagai informasi referensi di UI (bukan key operasional)
        ARRAY_REMOVE(
          ARRAY_AGG(DISTINCT ma.carline ORDER BY ma.carline),
          NULL
        ) AS variants
      FROM (
        SELECT DISTINCT assy_code
        FROM bom_detail
        WHERE periode = $1
      ) b
      LEFT JOIN master_assy ma
        ON ma.assy_code = b.assy_code
      LEFT JOIN prod_plan p
        ON p.assy_code = b.assy_code
        AND p.periode  = $1
        AND p.sequence IS NULL
      GROUP BY b.assy_code
      ORDER BY b.assy_code
    `, [periode]);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Gagal memuat data' }, { status: 500 });
  }
}

// POST /api/prod-plan/[periode] — upsert prod_qty (bulk)
// sequence selalu NULL — acuan operasional hanya assy_code
export async function POST(
  request: Request,
  { params }: { params: Promise<{ periode: string }> }
) {
  const client = await pool.connect();
  try {
    const { periode } = await params;
    const { rows } = await request.json() as {
      rows: { assy_code: string; prod_qty: number }[]
    };

    if (!rows?.length) {
      return NextResponse.json({ error: 'Data kosong' }, { status: 400 });
    }

    await client.query('BEGIN');
    let upserted = 0;
    for (const row of rows) {
      await client.query(`
        INSERT INTO prod_plan (periode, assy_code, sequence, prod_qty)
        VALUES ($1, $2, NULL, $3)
        ON CONFLICT (periode, assy_code, sequence)
        DO UPDATE SET prod_qty = EXCLUDED.prod_qty, updated_at = NOW()
      `, [periode, row.assy_code, row.prod_qty ?? 0]);
      upserted++;
    }
    await client.query('COMMIT');

    // Refresh materialized view setelah update prod plan
    pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bom_gabungan').catch(err => {
      console.error('[MV Refresh Error after prod_plan update]', err);
    });

    return NextResponse.json({ message: 'Prod Plan berhasil disimpan', upserted });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return NextResponse.json({ error: 'Gagal menyimpan Prod Plan' }, { status: 500 });
  } finally {
    client.release();
  }
}
