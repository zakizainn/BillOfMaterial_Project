import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET /api/prod-plan — list semua periode yang ada di prod_plan + bom_detail
export async function GET() {
  try {
    const result = await pool.query(`
      SELECT 
        b.periode,
        COUNT(DISTINCT b.assy_code)                          AS total_assy,
        COUNT(DISTINCT p.assy_code) FILTER (WHERE p.prod_qty > 0) AS filled_assy,
        COALESCE(SUM(p.prod_qty), 0)                         AS total_prod_qty
      FROM (SELECT DISTINCT periode, assy_code FROM bom_detail) b
      LEFT JOIN prod_plan p 
        ON p.assy_code = b.assy_code AND p.periode = b.periode
      GROUP BY b.periode
      ORDER BY b.periode DESC
    `);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Gagal memuat data Prod Plan' }, { status: 500 });
  }
}
