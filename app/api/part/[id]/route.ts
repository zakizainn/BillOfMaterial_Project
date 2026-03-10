import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { part_no_as400, part_name, unit, supplier_code, supplier_name, is_active } = body;
    const result = await pool.query(
      `UPDATE master_part SET part_no_as400=$1, part_name=$2, unit=$3, supplier_code=$4, supplier_name=$5, is_active=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [part_no_as400, part_name, unit, supplier_code, supplier_name, is_active, id]
    );
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    return NextResponse.json({ error: 'Gagal update data' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await pool.query('DELETE FROM master_part WHERE id=$1', [id]);
    return NextResponse.json({ message: 'Berhasil dihapus' });
  } catch (error) {
    return NextResponse.json({ error: 'Gagal menghapus data' }, { status: 500 });
  }
}
