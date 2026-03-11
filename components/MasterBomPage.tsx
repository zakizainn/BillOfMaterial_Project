'use client';

import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { BtnPrimary, BtnGhost, ConfirmDialog, LoadingSpinner, Table, Modal } from '@/components/ui';

const font = "'DM Sans', system-ui, sans-serif";
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

interface BomPeriode {
  periode: string;
  total_part: number;
  total_assy: number;
  total_rows: number;
  uploaded_at: string;
}

// ─── Upload Modal ──────────────────────────────────────────────────────────────
function UploadModal({ onClose, onSuccess, showToast }: {
  onClose: () => void;
  onSuccess: () => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName]   = useState('');
  const [errors, setErrors]       = useState<string[]>([]);
  const [missingParts, setMissingParts] = useState<string[]>([]);
  const [missingAssy,  setMissingAssy]  = useState<string[]>([]);
  const [loading, setLoading]     = useState(false);
  const [parsed, setParsed]       = useState<{ rows: Record<string,unknown>[]; part_count: number; assy_count: number } | null>(null);

  const now = new Date();
  const [selMonth, setSelMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [selYear,  setSelYear]  = useState(String(now.getFullYear()));
  const periode = `${selYear}-${selMonth}`;
  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - 2 + i));

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name); setErrors([]); setParsed(null); setMissingParts([]); setMissingAssy([]);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });

        // Cari sheet paling lengkap (kolom terbanyak)
        let bestSheet = wb.SheetNames[0];
        let maxCols = 0;
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          const ref = ws['!ref'];
          if (!ref) continue;
          const range = XLSX.utils.decode_range(ref);
          if (range.e.c > maxCols) { maxCols = range.e.c; bestSheet = name; }
        }

        const ws   = wb.Sheets[bestSheet];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];

        // Cari baris header yang mengandung 'PART NO'
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(data.length, 10); i++) {
          if ((data[i] as unknown[]).some(c => String(c ?? '').toUpperCase().includes('PART NO'))) {
            headerRowIdx = i; break;
          }
        }
        if (headerRowIdx === -1) { setErrors(['Tidak menemukan baris header PART NO di file ini']); return; }

        const headerRow = data[headerRowIdx] as (string | null)[];

        // Identifikasi kolom info part
        const colPartNo      = headerRow.findIndex(h => String(h ?? '').toUpperCase() === 'PART NO');
        const colPartNoAs400 = headerRow.findIndex(h => String(h ?? '').toUpperCase() === 'PART NO AS400');
        const colUnit        = headerRow.findIndex(h => String(h ?? '').toUpperCase() === 'UNIT');
        const supplierCols   = headerRow.reduce<number[]>((acc, h, i) => {
          if (String(h ?? '').toUpperCase().includes('SUPPLIER')) acc.push(i);
          return acc;
        }, []);

        if (colPartNo === -1) { setErrors(['Kolom PART NO tidak ditemukan']); return; }

        // Kolom ASSY mulai setelah semua kolom info
        const infoLastCol = Math.max(colPartNo, colPartNoAs400, colUnit, ...supplierCols, 0);
        const assyStartCol = infoLastCol + 1;

        // Ambil assy codes dari header row
        const assy_codes: string[] = [];
        for (let c = assyStartCol; c < headerRow.length; c++) {
          const val = String(headerRow[c] ?? '').trim();
          if (val && val.toUpperCase() !== 'TOTAL' && val !== '') assy_codes.push(val);
        }
        if (assy_codes.length === 0) { setErrors(['Tidak menemukan kolom ASSY di file ini']); return; }

        // Parse baris data
        const rows: Record<string,unknown>[] = [];
        for (let r = headerRowIdx + 1; r < data.length; r++) {
          const row = data[r] as unknown[];
          const part_no = String(row[colPartNo] ?? '').trim();
          if (!part_no || part_no.toUpperCase() === 'TOTAL' || part_no === '') continue;

          const part_no_as400 = colPartNoAs400 !== -1 ? String(row[colPartNoAs400] ?? '').trim() : part_no;
          const unit          = colUnit !== -1 ? String(row[colUnit] ?? '').trim() || 'PCS' : 'PCS';
          const supplier_code = supplierCols[0] !== undefined ? String(row[supplierCols[0]] ?? '').trim() : '';
          const supplier_name = supplierCols[1] !== undefined ? String(row[supplierCols[1]] ?? '').trim() : supplier_code;

          for (let c = 0; c < assy_codes.length; c++) {
            const qty = Number(row[assyStartCol + c] ?? 0);
            if (!qty || isNaN(qty) || qty <= 0) continue;
            rows.push({ part_no, part_no_as400, unit, supplier_code, supplier_name, assy_code: assy_codes[c], qty_per_unit: qty });
          }
        }

        if (rows.length === 0) { setErrors(['Tidak ada data qty yang valid di file ini']); return; }

        const part_count = new Set(rows.map(r => r.part_no)).size;
        const assy_count = assy_codes.length;
        setParsed({ rows, part_count, assy_count });
      } catch (err) {
        setErrors([`Gagal membaca file: ${err}`]);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleUpload = async () => {
    if (!parsed) return;
    setLoading(true);
    setMissingParts([]); setMissingAssy([]); setErrors([]);
    try {
      // Step 1: validasi dulu dengan mengirim hanya part_no & assy_code unik
      const uniqueParts = [...new Set(parsed.rows.map(r => r.part_no))];
      const uniqueAssy  = [...new Set(parsed.rows.map(r => r.assy_code))];
      const validateRes = await fetch('/api/bom/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periode, part_nos: uniqueParts, assy_codes: uniqueAssy }),
      });
      const validateData = await validateRes.json();

      if (validateRes.status === 409) { setErrors([validateData.error]); setLoading(false); return; }
      if (validateRes.status === 422) {
        setMissingParts(validateData.missing_parts ?? []);
        setMissingAssy(validateData.missing_assy ?? []);
        setLoading(false);
        return;
      }
      if (!validateRes.ok) { setErrors([validateData.error]); setLoading(false); return; }

      // Step 2: kirim data per batch 2000 rows
      const BATCH = 2000;
      const rows  = parsed.rows;
      let totalInserted = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const isFirst = i === 0;
        const res = await fetch('/api/bom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ periode, rows: batch, skipValidation: true, isFirst }),
        });
        const data = await res.json();
        if (!res.ok) { setErrors([data.error]); setLoading(false); return; }
        totalInserted += data.bom_rows ?? 0;
      }

      showToast(`BOM ${periode} berhasil diupload! ${totalInserted} kombinasi qty tersimpan`, 'success');
      onSuccess(); onClose();
    } catch (e) {
      setErrors([`Gagal menghubungi server: ${e}`]);
    }
    setLoading(false);
  };

  return (
    <Modal title="Upload BOM Excel" onClose={onClose} wide>
      {/* Step 1 — Pilih Periode */}
      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
        <p style={{ fontWeight: 600, fontSize: 13, color: '#0369a1', marginBottom: 10, fontFamily: font }}>📅 Step 1 — Pilih Periode BOM</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={selMonth} onChange={e => setSelMonth(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #bae6fd', fontSize: 13, fontFamily: font, outline: 'none', background: '#fff', cursor: 'pointer' }}>
            {MONTHS.map((m, i) => <option key={i} value={String(i+1).padStart(2,'0')}>{m}</option>)}
          </select>
          <select value={selYear} onChange={e => setSelYear(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #bae6fd', fontSize: 13, fontFamily: font, outline: 'none', background: '#fff', cursor: 'pointer' }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div style={{ padding: '8px 14px', borderRadius: 8, background: '#1d4ed8', color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: font }}>
            {periode}
          </div>
        </div>
      </div>

      {/* Step 2 — Pilih File */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontWeight: 600, fontSize: 13, color: '#111827', marginBottom: 10, fontFamily: font }}>📤 Step 2 — Pilih File BOM Excel</p>
        <div onClick={() => fileRef.current?.click()} style={{
          border: `2px dashed ${fileName ? '#86efac' : '#cbd5e1'}`,
          borderRadius: 12, padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
          background: fileName ? '#f0fdf4' : '#f8fafc', transition: 'all .15s',
        }}
          onMouseOver={e => { if (!fileName) { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.background = '#eff6ff'; }}}
          onMouseOut={e =>  { if (!fileName) { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: fileName ? '#16a34a' : '#6b7280', fontFamily: font, marginBottom: 3 }}>
            {fileName ? `✓ ${fileName}` : 'Klik untuk pilih file BOM .xlsx'}
          </p>
          <p style={{ fontSize: 12, color: '#9ca3af', fontFamily: font }}>Format sesuai file BOM bulanan</p>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
      </div>

      {/* Preview hasil parsing */}
      {parsed && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#15803d', fontFamily: font, marginBottom: 6 }}>✓ File berhasil dibaca</p>
          <div style={{ display: 'flex', gap: 24, fontSize: 12.5, color: '#374151', fontFamily: font }}>
            <span>📦 <b>{parsed.part_count}</b> Part unik</span>
            <span>🔩 <b>{parsed.assy_count}</b> ASSY</span>
            <span>📋 <b>{parsed.rows.length}</b> kombinasi qty</span>
          </div>
        </div>
      )}

      {/* Error umum */}
      {errors.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <p style={{ fontWeight: 700, color: '#dc2626', fontSize: 12.5, marginBottom: 4, fontFamily: font }}>⚠ Error:</p>
          {errors.map((e, i) => <p key={i} style={{ fontSize: 12.5, color: '#dc2626', fontFamily: font }}>• {e}</p>)}
        </div>
      )}

      {/* Missing parts/assy dari master */}
      {(missingParts.length > 0 || missingAssy.length > 0) && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
          <p style={{ fontWeight: 700, color: '#dc2626', fontSize: 13, marginBottom: 10, fontFamily: font }}>
            ❌ Upload Ditolak — Data berikut belum ada di Master
          </p>
          {missingParts.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontWeight: 600, fontSize: 12, color: '#991b1b', marginBottom: 6, fontFamily: font }}>
                Part belum ada di Master Part ({missingParts.length} part) — Minta MPC untuk menambahkan:
              </p>
              <div style={{ maxHeight: 120, overflowY: 'auto', background: '#fff5f5', borderRadius: 6, padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {missingParts.map(p => (
                  <span key={p} style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '3px 8px', fontSize: 11.5, fontFamily: 'monospace', fontWeight: 600 }}>{p}</span>
                ))}
              </div>
            </div>
          )}
          {missingAssy.length > 0 && (
            <div>
              <p style={{ fontWeight: 600, fontSize: 12, color: '#991b1b', marginBottom: 6, fontFamily: font }}>
                ASSY belum ada di Master ASSY ({missingAssy.length} assy) — Minta PPC untuk menambahkan:
              </p>
              <div style={{ maxHeight: 120, overflowY: 'auto', background: '#fff5f5', borderRadius: 6, padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {missingAssy.map(a => (
                  <span key={a} style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '3px 8px', fontSize: 11.5, fontFamily: 'monospace', fontWeight: 600 }}>{a}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
        <BtnGhost onClick={onClose} color="gray">Batal</BtnGhost>
        <BtnPrimary onClick={handleUpload} disabled={!parsed || loading}>
          {loading ? 'Memvalidasi & Upload...' : `Upload BOM ${periode}`}
        </BtnPrimary>
      </div>
    </Modal>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function MasterBomPage({ showToast, role }: {
  showToast: (msg: string, type: 'success' | 'error') => void;
  role: string;
}) {
  const canUpload = role === 'DESIGN';
  const canDelete = role === 'FINANCE';
  const [periodes, setPeriodes]     = useState<BomPeriode[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [confirm, setConfirm]       = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    fetch('/api/bom').then(r => r.json()).then(d => { setPeriodes(d); setLoading(false); })
      .catch(() => { showToast('Gagal memuat data BOM', 'error'); setLoading(false); });
  };
  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (periode: string) => {
    try {
      const res  = await fetch(`/api/bom/${encodeURIComponent(periode)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { showToast(data.error, 'error'); return; }
      showToast(`Periode ${periode} berhasil dihapus`, 'success');
      setConfirm(null); fetchData();
    } catch { showToast('Gagal menghapus periode', 'error'); }
  };

  const formatPeriode = (p: string) => {
    const [year, month] = p.split('-');
    return `${MONTHS[Number(month) - 1]} ${year}`;
  };

  const tableRows = periodes.map(p => [
    <span style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 13.5, fontFamily: font }}>{formatPeriode(p.periode)}</span>,
    <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>{p.periode}</span>,
    <span style={{ fontWeight: 600, color: '#374151' }}>{Number(p.total_part).toLocaleString()}</span>,
    <span style={{ fontWeight: 600, color: '#374151' }}>{Number(p.total_assy).toLocaleString()}</span>,
    <span style={{ fontWeight: 600, color: '#374151' }}>{Number(p.total_rows).toLocaleString()}</span>,
    <span style={{ fontSize: 12, color: '#6b7280' }}>{new Date(p.uploaded_at).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>,
    canDelete
      ? <BtnGhost onClick={() => setConfirm(p.periode)} color="red">🗑 Hapus</BtnGhost>
      : <span style={{ fontSize: 11.5, color: '#9ca3af', fontStyle: 'italic' }}>View only</span>,
  ]);

  const roleBanner = () => {
    if (canUpload) return { bg: '#faf5ff', border: '#e9d5ff', color: '#7c3aed', icon: '📤', text: `Role <b>DESIGN</b> — dapat mengupload file BOM per periode. Penghapusan hanya bisa dilakukan oleh Finance.` };
    if (canDelete) return { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', icon: '🗑', text: `Role <b>FINANCE</b> — memiliki akses hapus periode BOM. Upload hanya bisa dilakukan oleh Design.` };
    return { bg: '#fffbeb', border: '#fde68a', color: '#92400e', icon: '👁', text: `Role <b>${role}</b> — hanya dapat melihat data BOM.` };
  };
  const banner = roleBanner();

  return (
    <div style={{ fontFamily: font }}>
      {/* Role banner */}
      <div style={{ background: banner.bg, border: `1px solid ${banner.border}`, borderRadius: 10, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: banner.color }}
        dangerouslySetInnerHTML={{ __html: `${banner.icon} ${banner.text}` }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Master BOM</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Bill of Materials — <b style={{ color: '#374151' }}>{periodes.length}</b> periode tersedia</p>
        </div>
        {canUpload && (
          <BtnPrimary onClick={() => setShowUpload(true)}>📤 Upload BOM Excel</BtnPrimary>
        )}
      </div>

      {/* Warning box upload rule */}
      {canUpload && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: '#9a3412', fontFamily: font, lineHeight: 1.6 }}>
          ⚠ <b>Perhatian:</b> Pastikan MPC sudah mengisi <b>Master Part</b> dan PPC sudah mengisi <b>Master ASSY</b> sebelum upload BOM.
          Jika ada part atau assy yang belum ada di master, upload akan <b>ditolak</b> dan sistem akan menampilkan daftar data yang perlu dilengkapi terlebih dahulu.
          <br />Untuk update BOM suatu periode — <b>hapus periode tersebut dulu</b>, lalu upload ulang.
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 12, padding: '14px 22px', minWidth: 140, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 4 }}>Total Periode</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#1d4ed8' }}>{periodes.length}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 12, padding: '14px 22px', minWidth: 160, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 4 }}>Periode Terbaru</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>{periodes[0] ? formatPeriode(periodes[0].periode) : '—'}</div>
        </div>
      </div>

      {/* Table */}
      {loading ? <LoadingSpinner /> : periodes.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 12, padding: '56px 20px', textAlign: 'center', color: '#9ca3af' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Belum ada data BOM</div>
          {canUpload && <div style={{ fontSize: 13 }}>Klik <b>Upload BOM Excel</b> untuk mulai</div>}
        </div>
      ) : (
        <Table
          headers={[
            { label: 'Periode' },
            { label: 'Kode' },
            { label: 'Total Part', right: true },
            { label: 'Total ASSY', right: true },
            { label: 'Total Rows', right: true },
            { label: 'Diupload' },
            { label: 'Aksi' },
          ]}
          rows={tableRows}
        />
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSuccess={fetchData} showToast={showToast} />}
      {confirm && (
        <ConfirmDialog
          msg={`Yakin ingin menghapus BOM periode ${formatPeriode(confirm)}? Semua data BOM periode ini akan dihapus. Part dan ASSY yang tidak digunakan di periode lain juga akan ikut dihapus dari master.`}
          onConfirm={() => handleDelete(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
