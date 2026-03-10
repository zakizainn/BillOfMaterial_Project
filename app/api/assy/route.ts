import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query('SELECT * FROM master_assy ORDER BY assy_number');
    return NextResponse.json(result.rows);
  } catch (error) {
    return NextResponse.json({ error: 'Gagal mengambil data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { assy_code, assy_number, prod_qty, description, is_active } = body;
    const result = await pool.query(
      `INSERT INTO master_assy (assy_code, assy_number, prod_qty, description, is_active)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [assy_code, assy_number, prod_qty, description, is_active]
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Gagal menambah data' }, { status: 500 });
  }
}