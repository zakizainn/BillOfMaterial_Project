import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query(
      'SELECT * FROM master_assy ORDER BY assy_number ASC'
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    return NextResponse.json({ error: 'Gagal memuat data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { assy_code, assy_number, sequence, carline, destinasi, komoditi, description, is_active } = body;

    if (!assy_code || !assy_number) {
      return NextResponse.json({ error: 'assy_code dan assy_number wajib diisi' }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO master_assy (assy_code, assy_number, sequence, carline, destinasi, komoditi, description, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (assy_code) DO NOTHING
       RETURNING *`,
      [assy_code, assy_number, sequence ?? null, carline ?? null, destinasi ?? null,
       komoditi ?? null, description ?? null, is_active ?? true]
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: 'Assy code sudah ada' }, { status: 409 });
    }

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Gagal menambah data' }, { status: 500 });
  }
}
