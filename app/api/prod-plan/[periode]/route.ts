import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET /api/prod-plan/[periode]
export async function GET(
  _: Request,
  { params }: { params: Promise<{ periode: string }> }
) {
  try {
    const { periode } = await params;
    const result = await pool.query(`
      SELECT 
        b.assy_code,
        b.sequence,
        ma.description,
        ma.carline,
        ma.destinasi,
        ma.komoditi,
        COALESCE(p.prod_qty, 0) AS prod_qty,
        p.updated_at
      FROM (
        SELECT DISTINCT assy_code, sequence 
        FROM bom_detail 
        WHERE periode = $1
      ) b
      LEFT JOIN master_assy ma 
        ON ma.assy_code = b.assy_code 
        AND (ma.sequence = b.sequence OR (ma.sequence IS NULL AND b.sequence IS NULL))
      LEFT JOIN prod_plan p 
        ON p.assy_code = b.assy_code 
        AND p.periode = $1
        AND (p.sequence = b.sequence OR (p.sequence IS NULL AND b.sequence IS NULL))
      ORDER BY b.assy_code, b.sequence NULLS LAST
    `, [periode]);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Gagal memuat data' }, { status: 500 });
  }
}

// POST /api/prod-plan/[periode] — upsert prod_qty (bulk)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ periode: string }> }
) {
  const client = await pool.connect();
  try {
    const { periode } = await params;
    const { rows } = await request.json() as { 
      rows: { assy_code: string; sequence: number | null; prod_qty: number }[] 
    };

    if (!rows?.length) {
      return NextResponse.json({ error: 'Data kosong' }, { status: 400 });
    }

    await client.query('BEGIN');
    let upserted = 0;
    for (const row of rows) {
      await client.query(`
        INSERT INTO prod_plan (periode, assy_code, sequence, prod_qty)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (periode, assy_code, sequence) 
        DO UPDATE SET prod_qty = EXCLUDED.prod_qty, updated_at = NOW()
      `, [periode, row.assy_code, row.sequence ?? null, row.prod_qty ?? 0]);
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
