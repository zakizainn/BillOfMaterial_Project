import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { assy_number, sequence, carline, destinasi, komoditi, description, is_active } = body;
    const result = await pool.query(
      `UPDATE master_assy 
       SET assy_number=$1, sequence=$2, carline=$3, destinasi=$4, komoditi=$5,
           description=$6, is_active=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [assy_number, sequence ?? null, carline ?? null, destinasi ?? null, komoditi ?? null,
       description, is_active, id]
    );
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error(error);
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
