import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// POST /api/bom/validate — cek periode & validasi part/assy sebelum upload
export async function POST(request: Request) {
  try {
    const { periode, part_nos, assy_codes } = await request.json();

    // Cek periode sudah ada
    const existing = await pool.query(
      'SELECT COUNT(*) FROM bom_detail WHERE periode = $1', [periode]
    );
    if (Number(existing.rows[0].count) > 0) {
      return NextResponse.json(
        { error: `Periode ${periode} sudah ada. Hapus dulu sebelum upload ulang.` },
        { status: 409 }
      );
    }

    // Cek missing parts
    const partCheck = await pool.query(
      'SELECT part_no FROM master_part WHERE part_no = ANY($1)', [part_nos]
    );
    const existingParts = new Set(partCheck.rows.map((r: {part_no: string}) => r.part_no));
    const missingParts  = (part_nos as string[]).filter(p => !existingParts.has(p));

    // Cek missing assy
    const assyCheck = await pool.query(
      'SELECT assy_code FROM master_assy WHERE assy_code = ANY($1)', [assy_codes]
    );
    const existingAssy = new Set(assyCheck.rows.map((r: {assy_code: string}) => r.assy_code));
    const missingAssy  = (assy_codes as string[]).filter(a => !existingAssy.has(a));

    if (missingParts.length > 0 || missingAssy.length > 0) {
      return NextResponse.json(
        { error: 'Upload ditolak', missing_parts: missingParts, missing_assy: missingAssy },
        { status: 422 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Gagal validasi' }, { status: 500 });
  }
}
