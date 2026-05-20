// components/PartPriceModal.tsx

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';

const font = "'DM Sans', system-ui, sans-serif";
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const LIMIT = 100;

function fmtPeriode(p: string) {
  const [y, m] = p.split('-');
  return `${MONTHS[Number(m)-1]} ${y}`;
}

interface PriceRow {
  part_no: string; part_name: string; unit: string;
  supplier_name: string; price: number | null; updated_at: string | null;
}
interface Stats { total: number; filled: number; }

function PageBtn({ children, onClick, disabled, active }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      minWidth: 34, height: 34, borderRadius: 7, border: '1.5px solid',
      borderColor: active ? '#2563eb' : disabled ? '#e5e7eb' : '#e2e8f0',
      background: active ? '#2563eb' : '#fff',
      color: active ? '#fff' : disabled ? '#d1d5db' : '#374151',
      fontWeight: 600, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: font, padding: '0 6px',
      transition: 'all .15s',
    }}
    onMouseOver={e => { if (!disabled && !active) { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = '#bfdbfe'; }}}
    onMouseOut={e  => { if (!disabled && !active) { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0'; }}}
    >{children}</button>
  );
}

export default function PartPriceModal({ periode, role, onClose }: {
  periode: string; role: string; onClose: () => void;
}) {
  const canEdit = role === 'DESIGN';

  const [rows,      setRows]      = useState<PriceRow[]>([]);
  const [stats,     setStats]     = useState<Stats>({ total: 0, filled: 0 });
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [isDirty,   setIsDirty]   = useState(false);
  const [search,    setSearch]    = useState('');
  const [filter,    setFilter]    = useState<'all'|'filled'|'empty'>('all');
  const [priceMap,  setPriceMap]  = useState<Record<string, string>>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fileRef     = useRef<HTMLInputElement>(null);

  const totalPages = Math.ceil(total / LIMIT) || 1;
  const pct        = stats.total > 0 ? Math.round((stats.filled / stats.total) * 100) : 0;

  const fetchPage = useCallback(async (p: number, s: string, f: string) => {
    setLoading(true);
    try {
      const res  = await fetch(
        `/bom-management/api/part-price?periode=${encodeURIComponent(periode)}&page=${p}&limit=${LIMIT}&search=${encodeURIComponent(s)}&filter=${f}`
      );
      const data = await res.json();
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setStats(data.stats ?? { total: 0, filled: 0 });
      // Merge ke priceMap — hanya update yang belum pernah diedit
      setPriceMap(prev => {
        const next = { ...prev };
        for (const r of (data.rows ?? [])) {
          if (!(r.part_no in next)) {
            next[r.part_no] = r.price != null ? String(r.price) : '';
          }
        }
        return next;
      });
    } catch { /**/ }
    setLoading(false);
  }, [periode]);

  useEffect(() => { fetchPage(1, '', 'all'); }, []);

  // Debounce search
  const handleSearch = (val: string) => {
    setSearch(val); setPage(1);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchPage(1, val, filter), 400);
  };

  const handleFilter = (f: 'all'|'filled'|'empty') => {
    setFilter(f); setPage(1);
    fetchPage(1, search, f);
  };

  const handlePage = (p: number) => {
    setPage(p);
    fetchPage(p, search, filter);
  };

  const handlePriceChange = (part_no: string, val: string) => {
    setPriceMap(m => ({ ...m, [part_no]: val }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saveRows = Object.entries(priceMap)
        .map(([part_no, val]) => ({ part_no, price: val !== '' ? parseFloat(val) : null }));
      const res = await fetch('/bom-management/api/part-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periode, rows: saveRows }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      setIsDirty(false);
      fetchPage(page, search, filter);
    } catch { /**/ }
    setSaving(false);
  };

  // Download — ambil semua data dari server
  const handleDownload = async () => {
    try {
      const res  = await fetch(`/bom-management/api/part-price?periode=${encodeURIComponent(periode)}&download=true`);
      const data = await res.json();
      const allRows: PriceRow[] = data.rows ?? [];

      const wb = XLSX.utils.book_new();
      const sheetData = [
        ['part_no','part_name','unit','supplier_name','price'],
        ...allRows.map(r => [
          r.part_no, r.part_name || '', r.unit || '',
          r.supplier_name || '',
          priceMap[r.part_no] !== undefined
            ? (priceMap[r.part_no] !== '' ? parseFloat(priceMap[r.part_no]) : '')
            : (r.price ?? ''),
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      ws['!cols'] = [20,30,8,25,15].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, 'Part Price');
      XLSX.writeFile(wb, `part_price_${periode}.xlsx`);
    } catch { alert('Gagal download'); }
  };

  // Upload Excel — update priceMap saja, belum simpan ke DB
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ab   = await file.arrayBuffer();
      const wb   = XLSX.read(ab);
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
      const newMap = { ...priceMap };
      let count = 0;
      for (const row of data) {
        const part_no = String(row['part_no'] ?? '').trim();
        const price   = row['price'] !== '' && row['price'] != null
          ? parseFloat(String(row['price'])) : null;
        if (part_no) { newMap[part_no] = price != null ? String(price) : ''; count++; }
      }
      setPriceMap(newMap);
      setIsDirty(true);
      alert(`${count} baris berhasil dibaca — klik Simpan untuk menyimpan ke database`);
    } catch { alert('Gagal membaca file Excel'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const getPages = (): (number|'...')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (page <= 4)               return [1,2,3,4,5,'...',totalPages];
    if (page >= totalPages - 3)  return [1,'...',totalPages-4,totalPages-3,totalPages-2,totalPages-1,totalPages];
    return [1,'...',page-1,page,page+1,'...',totalPages];
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(6px)', padding: '20px 16px', overflowY: 'auto' }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 1100, boxShadow: '0 20px 60px rgba(0,0,0,.18)', fontFamily: font, marginTop: 8, border: '1px solid rgba(0,0,0,.06)' }}>

        {/* Header */}
        <div style={{ padding: '20px 28px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: -0.3 }}>
              💰 Price — {fmtPeriode(periode)}
            </h2>
            <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 3 }}>
              Harga part per unit · periode {periode}
              {!canEdit && <span style={{ marginLeft: 8, background: '#fef9c3', color: '#854d0e', borderRadius: 5, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>View Only</span>}
            </p>
          </div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 18, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s' }}
            onMouseOver={e => e.currentTarget.style.background = '#e2e8f0'}
            onMouseOut={e  => e.currentTarget.style.background = '#f1f5f9'}
          >×</button>
        </div>

        {/* Stats bar */}
        <div style={{ padding: '14px 28px', borderBottom: '1px solid #e8eaed', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Progress Pengisian</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? '#16a34a' : '#f59e0b' }}>{pct}%</span>
            </div>
            <div style={{ background: '#e2e8f0', borderRadius: 99, height: 6 }}>
              <div style={{ background: pct === 100 ? '#16a34a' : '#f59e0b', borderRadius: 99, height: 6, width: `${pct}%`, transition: 'width .4s' }} />
            </div>
          </div>

          {[
            { label: 'Total Part', value: stats.total.toLocaleString(), color: '#2563eb', bg: '#eff6ff' },
            { label: 'Sudah Diisi', value: stats.filled.toLocaleString(), color: '#16a34a', bg: '#f0fdf4' },
            { label: 'Belum Diisi', value: (stats.total - stats.filled).toLocaleString(), color: '#dc2626', bg: '#fef2f2' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 9, padding: '8px 16px', textAlign: 'center', minWidth: 90, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: s.color, borderRadius: '3px 0 0 3px' }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: 0.6 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1.2 }}>{s.value}</div>
            </div>
          ))}

          {canEdit && (
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
              <button onClick={handleDownload} style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: font, display: 'flex', alignItems: 'center', gap: 5, transition: 'all .15s' }}
                onMouseOver={e => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.background = '#eff6ff'; }}
                onMouseOut={e  => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#fff'; }}
              >📥 Download</button>
              <button onClick={() => fileRef.current?.click()} style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #e9d5ff', background: '#faf5ff', color: '#7c3aed', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: font, transition: 'all .15s' }}
                onMouseOver={e => e.currentTarget.style.background = '#f3e8ff'}
                onMouseOut={e  => e.currentTarget.style.background = '#faf5ff'}
              >📤 Upload Excel</button>
              <button onClick={handleSave} disabled={saving || !isDirty} style={{
                padding: '7px 18px', borderRadius: 8, border: 'none',
                background: isDirty ? 'linear-gradient(135deg,#15803d,#16a34a)' : '#e5e7eb',
                color: isDirty ? '#fff' : '#9ca3af', fontSize: 12.5, fontWeight: 700,
                cursor: isDirty ? 'pointer' : 'not-allowed', fontFamily: font,
                boxShadow: isDirty ? '0 2px 8px rgba(22,163,74,.28)' : 'none', transition: 'all .15s',
              }}>{saving ? '⏳ Menyimpan...' : '💾 Simpan'}</button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleUpload} />
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div style={{ padding: '12px 28px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }}>🔍</span>
            <input value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Cari part no / part name..."
              style={{ padding: '7px 12px 7px 32px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: font, outline: 'none', width: 260, transition: 'border-color .15s' }}
              onFocus={e => e.target.style.borderColor = '#2563eb'}
              onBlur={e =>  e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          <div style={{ display: 'flex', gap: 4, background: '#f8fafc', borderRadius: 8, padding: 3, border: '1px solid #e2e8f0' }}>
            {(['all','filled','empty'] as const).map(f => (
              <button key={f} onClick={() => handleFilter(f)} style={{
                padding: '5px 14px', borderRadius: 6, border: 'none', fontSize: 12.5,
                fontWeight: filter === f ? 700 : 500,
                background: filter === f ? '#fff' : 'transparent',
                color: filter === f ? '#0f172a' : '#64748b',
                cursor: 'pointer', fontFamily: font,
                boxShadow: filter === f ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                transition: 'all .15s',
              }}>{f === 'all' ? 'Semua' : f === 'filled' ? 'Terisi' : 'Kosong'}</button>
            ))}
          </div>

          <span style={{ fontSize: 12.5, color: '#64748b' }}>
            {total.toLocaleString()} part ditemukan · halaman {page}/{totalPages}
          </span>
        </div>

        {/* Table */}
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: '#94a3b8', fontFamily: font }}>
              <div style={{ width: 28, height: 28, border: '3px solid #e5e7eb', borderTop: '3px solid #2563eb', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 12px' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              Memuat {LIMIT} part...
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
              Tidak ada data
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: font }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e8eaed' }}>
                  {['No','Part No','Part Name','Unit','Supplier','Price (USD)','Terakhir Update'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Price (USD)' ? 'right' : 'left', fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.7, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const priceVal  = priceMap[r.part_no] ?? (r.price != null ? String(r.price) : '');
                  const hasFilled = priceVal !== '';
                  const rowNum    = (page - 1) * LIMIT + i + 1;
                  return (
                    <tr key={r.part_no} style={{ borderBottom: '1px solid #f1f5f9', background: i%2===0 ? '#fff' : '#fafafa', transition: 'background .1s' }}
                      onMouseOver={e => (e.currentTarget.style.background = '#f0f9ff')}
                      onMouseOut={e  => (e.currentTarget.style.background = i%2===0 ? '#fff' : '#fafafa')}>
                      <td style={{ padding: '9px 14px', color: '#94a3b8', fontSize: 12 }}>{rowNum}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 12, color: '#2563eb', fontWeight: 700 }}>{r.part_no}</td>
                      <td style={{ padding: '9px 14px', color: '#374151', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.part_name || '—'}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{ background: '#eff6ff', color: '#2563eb', borderRadius: 5, padding: '2px 7px', fontSize: 11, fontWeight: 700 }}>{r.unit || '—'}</span>
                      </td>
                      <td style={{ padding: '9px 14px', color: '#64748b', fontSize: 12 }}>{r.supplier_name || '—'}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                        {canEdit ? (
                          <input type="number" min="0" step="0.01" value={priceVal} placeholder="0.00"
                            onChange={e => handlePriceChange(r.part_no, e.target.value)}
                            style={{
                              width: 130, padding: '6px 10px', borderRadius: 7, textAlign: 'right',
                              border: `1.5px solid ${hasFilled ? '#bbf7d0' : '#e2e8f0'}`,
                              fontSize: 13, fontFamily: font, outline: 'none',
                              background: hasFilled ? '#f0fdf4' : '#fff',
                              fontWeight: hasFilled ? 700 : 400, transition: 'all .15s',
                            }}
                            onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.background = '#eff6ff'; }}
                            onBlur={e  => { e.target.style.borderColor = hasFilled ? '#bbf7d0' : '#e2e8f0'; e.target.style.background = hasFilled ? '#f0fdf4' : '#fff'; }}
                          />
                        ) : (
                          <span style={{ fontWeight: 700, color: hasFilled ? '#15803d' : '#94a3b8' }}>
                            {hasFilled ? `$ ${Number(priceVal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: 11.5, color: '#94a3b8' }}>
                        {r.updated_at ? new Date(r.updated_at).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: '12px 28px', borderTop: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 12.5, color: '#64748b' }}>
              Menampilkan <b style={{ color: '#0f172a' }}>{(page-1)*LIMIT+1}–{Math.min(page*LIMIT, total)}</b> dari <b style={{ color: '#0f172a' }}>{total.toLocaleString()}</b> part
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <PageBtn disabled={page===1} onClick={() => handlePage(1)}>«</PageBtn>
              <PageBtn disabled={page===1} onClick={() => handlePage(page-1)}>‹</PageBtn>
              {getPages().map((p, i) =>
                p === '...' ? (
                  <span key={`d${i}`} style={{ width: 34, textAlign: 'center', color: '#94a3b8', lineHeight: '34px', fontSize: 13 }}>•••</span>
                ) : (
                  <PageBtn key={p} active={p===page} onClick={() => handlePage(p as number)}>{p}</PageBtn>
                )
              )}
              <PageBtn disabled={page===totalPages} onClick={() => handlePage(page+1)}>›</PageBtn>
              <PageBtn disabled={page===totalPages} onClick={() => handlePage(totalPages)}>»</PageBtn>
            </div>
          </div>
        )}

        {/* Floating save */}
        {canEdit && isDirty && (
          <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid #e8eaed', padding: '12px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '0 0 16px 16px' }}>
            <span style={{ fontSize: 13, color: '#f59e0b', fontWeight: 600 }}>✏️ Ada perubahan yang belum disimpan</span>
            <button onClick={handleSave} disabled={saving} style={{
              padding: '8px 22px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg,#15803d,#16a34a)',
              color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: font,
              boxShadow: '0 2px 8px rgba(22,163,74,.28)',
            }}>{saving ? '⏳ Menyimpan...' : '💾 Simpan Sekarang'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
