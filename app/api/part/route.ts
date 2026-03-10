import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query('SELECT * FROM master_part ORDER BY part_no');
    return NextResponse.json(result.rows);
  } catch (error) {
    return NextResponse.json({ error: 'Gagal mengambil data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { part_no, part_no_as400, part_name, unit, supplier_code, supplier_name, is_active } = body;
    const result = await pool.query(
      `INSERT INTO master_part (part_no, part_no_as400, part_name, unit, supplier_code, supplier_name, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [part_no, part_no_as400, part_name, unit, supplier_code, supplier_name, is_active]
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Gagal menambah data' }, { status: 500 });
  }
}