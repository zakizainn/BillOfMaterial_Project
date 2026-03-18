import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET /api/prod-plan/[periode] — detail assy + prod_qty untuk periode tertentu
export async function GET(
  _: Request,
  { params }: { params: Promise<{ periode: string }> }
) {
  try {
    const { periode } = await params;
    const result = await pool.query(`
      SELECT 
        b.assy_code,
        ma.description,
        COALESCE(p.prod_qty, 0) AS prod_qty,
        p.updated_at
      FROM (SELECT DISTINCT assy_code FROM bom_detail WHERE periode = $1) b
      LEFT JOIN master_assy ma ON ma.assy_code = b.assy_code
      LEFT JOIN prod_plan p ON p.assy_code = b.assy_code AND p.periode = $1
      ORDER BY b.assy_code
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
    const { rows } = await request.json() as { rows: { assy_code: string; prod_qty: number }[] };

    if (!rows?.length) {
      return NextResponse.json({ error: 'Data kosong' }, { status: 400 });
    }

    await client.query('BEGIN');
    let upserted = 0;
    for (const row of rows) {
      await client.query(`
        INSERT INTO prod_plan (periode, assy_code, prod_qty)
        VALUES ($1, $2, $3)
        ON CONFLICT (periode, assy_code) 
        DO UPDATE SET prod_qty = EXCLUDED.prod_qty, updated_at = NOW()
      `, [periode, row.assy_code, row.prod_qty ?? 0]);
      upserted++;
    }
    await client.query('COMMIT');

    return NextResponse.json({ message: 'Prod Plan berhasil disimpan', upserted });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return NextResponse.json({ error: 'Gagal menyimpan Prod Plan' }, { status: 500 });
  } finally {
    client.release();
  }
}
