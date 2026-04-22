import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET /api/bom — list semua periode
export async function GET() {
  try {
    const result = await pool.query(`
      SELECT 
        periode,
        COUNT(DISTINCT part_no)   AS total_part,
        COUNT(DISTINCT assy_code) AS total_assy,
        COUNT(*)                  AS total_rows,
        MIN(created_at)           AS uploaded_at
      FROM bom_detail
      GROUP BY periode
      ORDER BY periode DESC
    `);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Gagal memuat data BOM' }, { status: 500 });
  }
}

// POST /api/bom — upload batch rows
export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const { periode, rows, skipValidation } = await request.json();

    if (!periode || !rows?.length) {
      return NextResponse.json({ error: 'Periode dan data wajib diisi' }, { status: 400 });
    }

    if (!skipValidation) {
      const existing = await client.query(
        'SELECT COUNT(*) FROM bom_detail WHERE periode = $1', [periode]
      );
      if (Number(existing.rows[0].count) > 0) {
        return NextResponse.json(
          { error: `Periode ${periode} sudah ada. Hapus dulu sebelum upload ulang.` },
          { status: 409 }
        );
      }
    }

    await client.query('BEGIN');
    let bomInserted = 0;
    for (const row of rows as Record<string,unknown>[]) {
      await client.query(`
        INSERT INTO bom_detail (periode, part_no, assy_code, sequence, qty_per_unit)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (periode, part_no, assy_code, sequence) DO NOTHING
      `, [periode, row.part_no, row.assy_code, row.sequence ?? null, row.qty_per_unit]);
      bomInserted++;
    }
    await client.query('COMMIT');

    return NextResponse.json({ message: 'Batch berhasil', periode, bom_rows: bomInserted });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return NextResponse.json({ error: 'Gagal upload batch BOM' }, { status: 500 });
  } finally {
    client.release();
  }
}
