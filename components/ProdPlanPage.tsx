'use client';

import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';

const font = "'DM Sans', system-ui, sans-serif";
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function formatPeriode(p: string) {
  const [year, month] = p.split('-');
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

interface PeriodeStat {
  periode: string;
  total_assy: number;
  filled_assy: number;
  total_prod_qty: number;
}

interface AssyRow {
  assy_code: string;
  sequence: number | null;
  description: string;
  carline: string | null;
  destinasi: string | null;
  komoditi: string | null;
  prod_qty: number;
  updated_at: string | null;
}

export default function ProdPlanPage({ showToast, role }: {
  showToast: (msg: string, type: 'success' | 'error') => void;
  role: string;
}) {
  const canEdit = role === 'FINANCE';

  const [periodes,      setPeriodes]      = useState<PeriodeStat[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [selectedPeriode, setSelectedPeriode] = useState<string | null>(null);
  const [assyRows,      setAssyRows]      = useState<AssyRow[]>([]);
  const [editMap,       setEditMap]       = useState<Record<string, number>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [search,        setSearch]        = useState('');
  const [isDirty,       setIsDirty]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchPeriodes = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/prod-plan');
      const data = await res.json();
      setPeriodes(data);
    } catch { showToast('Gagal memuat data', 'error'); }
    setLoading(false);
  };

  useEffect(() => { fetchPeriodes(); }, []);

  const fetchDetail = async (periode: string) => {
    setDetailLoading(true);
    setSearch('');
    try {
      const res  = await fetch(`/api/prod-plan/${encodeURIComponent(periode)}`);
      const data = await res.json() as AssyRow[];
      setAssyRows(data);
      // Init editMap dari data yang sudah ada
      const map: Record<string, number> = {};
      data.forEach(r => { 
        const key = `${r.assy_code}__${r.sequence ?? 'null'}`;
        map[key] = Number(r.prod_qty) || 0; 
      });
      setEditMap(map);
      setIsDirty(false);
    } catch { showToast('Gagal memuat detail', 'error'); }
    setDetailLoading(false);
  };

  const handleSelectPeriode = (periode: string) => {
    setSelectedPeriode(periode);
    fetchDetail(periode);
  };

  const getKey = (assy_code: string, sequence: number | null) => 
    `${assy_code}__${sequence ?? 'null'}`;

  const handleQtyChange = (assy_code: string, sequence: number | null, val: string) => {
    const num = parseFloat(val) || 0;
    const key = getKey(assy_code, sequence);
    setEditMap(m => ({ ...m, [key]: num }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!selectedPeriode) return;
    setSaving(true);
    try {
      const rows = assyRows.map(r => ({
        assy_code: r.assy_code,
        sequence:  r.sequence ?? null,
        prod_qty:  editMap[getKey(r.assy_code, r.sequence)] ?? 0,
      }));
      const res  = await fetch(`/api/prod-plan/${encodeURIComponent(selectedPeriode)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error, 'error'); return; }
      showToast(`Prod Plan ${formatPeriode(selectedPeriode)} berhasil disimpan! ${data.upserted} ASSY`, 'success');
      setIsDirty(false);
      fetchPeriodes();
      fetchDetail(selectedPeriode);
    } catch { showToast('Gagal menyimpan', 'error'); }
    setSaving(false);
  };

  // Upload Excel
  const handleUploadExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ab   = await file.arrayBuffer();
      const wb   = XLSX.read(ab);
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
      const newMap = { ...editMap };
      let count = 0;
      for (const row of rows) {
        const assy_code = String(row['assy_code'] ?? row['ASSY CODE'] ?? row['Assy Code'] ?? '').trim();
        const sequence  = row['sequence'] != null && row['sequence'] !== '' ? Number(row['sequence']) : null;
        const prod_qty  = parseFloat(String(row['prod_qty'] ?? row['PROD QTY'] ?? row['Prod Qty'] ?? '0')) || 0;
        if (assy_code) { 
          const key = getKey(assy_code, sequence);
          newMap[key] = prod_qty; count++; 
        }
      }
      setEditMap(newMap);
      setIsDirty(true);
      showToast(`${count} baris berhasil dibaca dari Excel`, 'success');
    } catch { showToast('Gagal membaca file Excel', 'error'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  // Download template
  const handleDownloadTemplate = () => {
    if (!assyRows.length) return;
    const wb = XLSX.utils.book_new();
    const data = assyRows.map(r => ({
      assy_code:   r.assy_code,
      sequence:    r.sequence ?? '',
      carline:     r.carline || '',
      destinasi:   r.destinasi || '',
      komoditi:    r.komoditi || '',
      description: r.description || '',
      prod_qty:    editMap[getKey(r.assy_code, r.sequence)] ?? 0,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 35 }, { wch: 30 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Prod Plan');
    XLSX.writeFile(wb, `prod_plan_${selectedPeriode}.xlsx`);
  };

  const filtered = assyRows.filter(r =>
    r.assy_code.toLowerCase().includes(search.toLowerCase()) ||
    (r.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (r.carline ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const filledCount  = assyRows.filter(r => (editMap[getKey(r.assy_code, r.sequence)] ?? 0) > 0).length;
  const totalProdQty = Object.values(editMap).reduce((s, v) => s + (v || 0), 0);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: font }}>
      {/* Role banner */}
      <div style={{
        background: canEdit ? '#fef2f2' : '#fffbeb',
        border: `1px solid ${canEdit ? '#fecaca' : '#fde68a'}`,
        borderRadius: 10, padding: '10px 16px', marginBottom: 20,
        fontSize: 13, color: canEdit ? '#dc2626' : '#92400e',
        display: 'flex', alignItems: 'center', gap: 8,
      }}
        dangerouslySetInnerHTML={{ __html: canEdit
          ? '💰 Role <b>FINANCE</b> — dapat mengisi Prod Qty per ASSY per periode.'
          : `👁 Role <b>${role}</b> — hanya dapat melihat data Prod Plan.`
        }}
      />

      {!selectedPeriode ? (
        /* ── Daftar Periode ── */
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Prod Plan</h1>
              <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                Input Qty Produksi per ASSY per Periode —&nbsp;
                <b style={{ color: '#374151' }}>{periodes.length}</b> periode tersedia
              </p>
            </div>
          </div>

          {loading ? (
            <LoadingBox />
          ) : periodes.length === 0 ? (
            <EmptyBox msg="Belum ada periode BOM. Upload BOM terlebih dahulu melalui menu Master BOM." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {periodes.map(p => {
                const pct = p.total_assy > 0 ? Math.round((Number(p.filled_assy) / Number(p.total_assy)) * 100) : 0;
                const done = pct === 100;
                return (
                  <div key={p.periode} onClick={() => handleSelectPeriode(p.periode)} style={{
                    background: '#fff', border: `2px solid ${done ? '#bbf7d0' : '#e2e8f0'}`,
                    borderRadius: 14, padding: '20px 22px', cursor: 'pointer',
                    transition: 'all .15s', boxShadow: '0 1px 4px rgba(0,0,0,.06)',
                  }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(59,130,246,.15)'; }}
                  onMouseOut={e  => { e.currentTarget.style.borderColor = done ? '#bbf7d0' : '#e2e8f0'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.06)'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{formatPeriode(p.periode)}</div>
                        <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>{p.periode}</div>
                      </div>
                      <span style={{
                        background: done ? '#dcfce7' : pct > 0 ? '#fef9c3' : '#fee2e2',
                        color: done ? '#15803d' : pct > 0 ? '#854d0e' : '#dc2626',
                        borderRadius: 20, padding: '3px 10px', fontSize: 11.5, fontWeight: 700,
                      }}>{done ? '✓ Lengkap' : pct > 0 ? `${pct}%` : 'Belum diisi'}</span>
                    </div>

                    {/* Progress bar */}
                    <div style={{ background: '#f1f5f9', borderRadius: 99, height: 6, marginBottom: 12 }}>
                      <div style={{ background: done ? '#16a34a' : '#f59e0b', borderRadius: 99, height: 6, width: `${pct}%`, transition: 'width .3s' }} />
                    </div>

                    <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                      <div><span style={{ color: '#9ca3af' }}>ASSY</span> <b style={{ color: '#374151' }}>{Number(p.filled_assy)}/{Number(p.total_assy)}</b></div>
                      <div><span style={{ color: '#9ca3af' }}>Total Qty</span> <b style={{ color: '#374151' }}>{Number(p.total_prod_qty).toLocaleString()}</b></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* ── Detail Input Prod Qty ── */
        <>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => setSelectedPeriode(null)} style={{
                background: '#f3f4f6', border: 'none', borderRadius: 8,
                padding: '7px 14px', cursor: 'pointer', fontSize: 13,
                fontWeight: 600, color: '#6b7280', fontFamily: font,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>← Kembali</button>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>
                  Prod Plan — {formatPeriode(selectedPeriode)}
                </h1>
                <p style={{ fontSize: 12.5, color: '#6b7280', marginTop: 2 }}>
                  {filledCount} / {assyRows.length} ASSY terisi · Total Prod Qty: <b>{totalProdQty.toLocaleString()}</b>
                </p>
              </div>
            </div>

            {canEdit && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={handleDownloadTemplate} style={{
                  padding: '8px 16px', borderRadius: 9, border: '1.5px solid #e2e8f0',
                  background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: font, display: 'flex', alignItems: 'center', gap: 6,
                }}>📥 Download Template</button>
                <button onClick={() => fileRef.current?.click()} style={{
                  padding: '8px 16px', borderRadius: 9, border: '1.5px solid #7c3aed',
                  background: '#faf5ff', color: '#7c3aed', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: font, display: 'flex', alignItems: 'center', gap: 6,
                }}>📤 Upload Excel</button>
                <button onClick={handleSave} disabled={saving || !isDirty} style={{
                  padding: '8px 20px', borderRadius: 9, border: 'none',
                  background: isDirty ? 'linear-gradient(135deg,#15803d,#16a34a)' : '#e5e7eb',
                  color: isDirty ? '#fff' : '#9ca3af', fontSize: 13, fontWeight: 600,
                  cursor: isDirty ? 'pointer' : 'not-allowed', fontFamily: font,
                  display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: isDirty ? '0 2px 8px rgba(22,163,74,.3)' : 'none',
                }}>
                  {saving ? '⏳ Menyimpan...' : '💾 Simpan Semua'}
                </button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleUploadExcel} />
              </div>
            )}
          </div>

          {/* Stats bar */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Total ASSY', value: assyRows.length, color: '#1d4ed8', bg: '#eff6ff' },
              { label: 'Sudah Diisi', value: filledCount, color: '#15803d', bg: '#f0fdf4' },
              { label: 'Belum Diisi', value: assyRows.length - filledCount, color: '#dc2626', bg: '#fef2f2' },
              { label: 'Total Prod Qty', value: totalProdQty.toLocaleString(), color: '#7c3aed', bg: '#faf5ff' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '12px 18px', minWidth: 130 }}>
                <div style={{ fontSize: 11, color: s.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color, marginTop: 2 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 14, maxWidth: 320 }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 14 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari assy code / deskripsi..."
              style={{ padding: '9px 12px 9px 34px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: font, outline: 'none', width: '100%' }}
              onFocus={e => e.target.style.borderColor = '#3b82f6'}
              onBlur={e =>  e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          {/* Table */}
          {detailLoading ? <LoadingBox /> : (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8eaed', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: font }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['No','Assy Code','Seq','Carline','Destinasi','Komoditi','Status','Prod Qty'].map((h, i) => (
                      <th key={h} style={{ padding: '11px 14px', textAlign: i === 4 ? 'right' : 'left', fontWeight: 600, fontSize: 11.5, color: '#6b7280', borderBottom: '1px solid #e8eaed', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const qty    = editMap[r.assy_code] ?? 0;
                    const filled = qty > 0;
                    return (
                      <tr key={r.assy_code} style={{ borderBottom: '1px solid #f1f5f9' }}
                        onMouseOver={e => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseOut={e =>  (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 12 }}>{i + 1}</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12.5, color: '#1d4ed8', fontWeight: 700 }}>{r.assy_code}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          {r.sequence != null ? <span style={{ background: '#eff6ff', color: '#2563eb', borderRadius: 5, padding: '2px 8px', fontSize: 11.5, fontWeight: 700 }}>{r.sequence}</span> : <span style={{ color: '#d1d5db' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#374151', fontSize: 12.5 }}>{r.carline || '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#374151', fontSize: 12.5 }}>{r.destinasi || '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#374151', fontSize: 12.5 }}>{r.komoditi || '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#4b5563' }}>{r.description || '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            background: filled ? '#dcfce7' : '#fee2e2',
                            color: filled ? '#15803d' : '#dc2626',
                            borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600,
                          }}>{filled ? '✓ Terisi' : '✗ Kosong'}</span>
                        </td>
                        <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                          {canEdit ? (
                            <input
                              type="number" min="0" value={qty === 0 ? '' : qty}
                              placeholder="0"
                              onChange={e => handleQtyChange(r.assy_code, r.sequence, e.target.value)}
                              style={{
                                width: 110, padding: '6px 10px', borderRadius: 7, textAlign: 'right',
                                border: `1.5px solid ${filled ? '#bbf7d0' : '#e2e8f0'}`,
                                fontSize: 13, fontFamily: font, outline: 'none',
                                background: filled ? '#f0fdf4' : '#fff',
                                fontWeight: filled ? 700 : 400,
                              }}
                              onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.background = '#eff6ff'; }}
                              onBlur={e =>  { e.target.style.borderColor = filled ? '#bbf7d0' : '#e2e8f0'; e.target.style.background = filled ? '#f0fdf4' : '#fff'; }}
                            />
                          ) : (
                            <span style={{ fontWeight: 700, color: filled ? '#15803d' : '#9ca3af' }}>
                              {filled ? qty.toLocaleString() : '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && <EmptyBox msg="Tidak ada data yang cocok" />}
            </div>
          )}

          {/* Floating save reminder */}
          {canEdit && isDirty && (
            <div style={{
              position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
              background: '#1d4ed8', color: '#fff', borderRadius: 12,
              padding: '12px 24px', fontSize: 13, fontWeight: 600, fontFamily: font,
              boxShadow: '0 8px 24px rgba(0,0,0,.2)', display: 'flex', alignItems: 'center', gap: 12, zIndex: 500,
            }}>
              ✏️ Ada perubahan yang belum disimpan
              <button onClick={handleSave} disabled={saving} style={{
                background: '#fff', color: '#1d4ed8', border: 'none', borderRadius: 7,
                padding: '5px 14px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: font,
              }}>{saving ? 'Menyimpan...' : 'Simpan Sekarang'}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LoadingBox() {
  return (
    <div style={{ padding: '48px 0', textAlign: 'center', color: '#9ca3af', fontFamily: font }}>
      <div style={{ width: 28, height: 28, border: '3px solid #e5e7eb', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin .75s linear infinite', margin: '0 auto 12px' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      Memuat data...
    </div>
  );
}

function EmptyBox({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center', color: '#9ca3af', fontFamily: font }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
      <div style={{ fontSize: 13.5 }}>{msg}</div>
    </div>
  );
}