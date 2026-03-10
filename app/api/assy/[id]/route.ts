import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { assy_number, prod_qty, description, is_active } = body;
    const result = await pool.query(
      `UPDATE master_assy SET assy_number=$1, prod_qty=$2, description=$3, is_active=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [assy_number, prod_qty, description, is_active, id]
    );
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    return NextResponse.json({ error: 'Gagal update data' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await pool.query('DELETE FROM master_assy WHERE id=$1', [id]);
    return NextResponse.json({ message: 'Berhasil dihapus' });
  } catch (error) {
    return NextResponse.json({ error: 'Gagal menghapus data' }, { status: 500 });
  }
}
