'use client';

import { useState, useEffect, useCallback } from 'react';

const font = "'DM Sans', system-ui, sans-serif";
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function fmtPeriode(p: string) {
  const [y, m] = p.split('-');
  return `${MONTHS[Number(m)-1].slice(0,3)} ${y}`;
}

interface ListRow { part_no: string; assy_code: string; part_name: string; unit: string; supplier_name: string; }
interface PivotPart { part_no: string; part_name: string; unit: string; }

function PageBtn({ children, onClick, disabled, active }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '6px 11px', borderRadius: 7, border: '1.5px solid',
      borderColor: active ? '#1d4ed8' : disabled ? '#e5e7eb' : '#e2e8f0',
      background: active ? '#1d4ed8' : '#fff',
      color: active ? '#fff' : disabled ? '#d1d5db' : '#374151',
      fontWeight: 600, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: font,
    }}>{children}</button>
  );
}

function LoadingBox() {
  return (
    <div style={{ padding: '48px 0', textAlign: 'center', color: '#9ca3af', fontFamily: font }}>
      <div style={{ width: 28, height: 28, border: '3px solid #e5e7eb', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin .75s linear infinite', margin: '0 auto 12px' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      Memuat data gabungan...
    </div>
  );
}

export default function BomGabunganModal({ onClose, availablePeriodes }: {
  onClose: () => void;
  availablePeriodes: string[];
}) {
  const now = new Date();
  const safePeriodes  = availablePeriodes?.length ? availablePeriodes : [`${now.getFullYear()}-01`];
  const defaultDari   = safePeriodes[safePeriodes.length - 1];
  const defaultSampai = safePeriodes[0];

  const [dari,    setDari]    = useState(defaultDari);
  const [sampai,  setSampai]  = useState(defaultSampai);
  const [tab,     setTab]     = useState<'list' | 'pivot'>('list');
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);
  const [hasLoaded, setHasLoaded] = useState(false);
  const LIMIT = 50;

  // State
  const [listRows,    setListRows]    = useState<ListRow[]>([]);
  const [listTotal,   setListTotal]   = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [assyCodes,   setAssyCodes]   = useState<string[]>([]);
  const [pivotParts,  setPivotParts]  = useState<PivotPart[]>([]);
  const [pivotTotal,  setPivotTotal]  = useState(0);
  const [pivotLoading,setPivotLoading]= useState(false);
  // qty_map: { part_no: { assy_code: { periode: qty } } }
  const [qtyMap,    setQtyMap]    = useState<Record<string, Record<string, Record<string, number>>>>({});
  const [periodes,  setPeriodes]  = useState<string[]>([]);

  const buildUrl = (mode: string, p: number, s: string) =>
    `/api/bom/gabungan?dari=${dari}&sampai=${sampai}&mode=${mode}&page=${p}&limit=${LIMIT}&search=${encodeURIComponent(s)}`;

  const fetchList = useCallback(async (p: number, s: string) => {
    setListLoading(true);
    try {
      const res  = await fetch(buildUrl('list', p, s));
      const data = await res.json();
      setListRows(data.rows ?? []);
      setListTotal(data.total ?? 0);
      setPeriodes(data.periodes ?? []);
      setQtyMap(data.qty_map ?? {});
    } catch { /**/ }
    setListLoading(false);
  }, [dari, sampai]);

  const fetchPivot = useCallback(async (p: number, s: string) => {
    setPivotLoading(true);
    try {
      const res  = await fetch(buildUrl('pivot', p, s));
      const data = await res.json();
      setAssyCodes(data.assy_codes ?? []);
      setPivotParts(data.parts ?? []);
      setQtyMap(data.qty_map ?? {});
      setPivotTotal(data.total ?? 0);
      setPeriodes(data.periodes ?? []);
    } catch { /**/ }
    setPivotLoading(false);
  }, [dari, sampai]);

  const handleLoad = () => {
    setPage(1); setSearch(''); setHasLoaded(true);
    if (tab === 'list') fetchList(1, '');
    else fetchPivot(1, '');
  };

  useEffect(() => {
    if (!hasLoaded) return;
    if (tab === 'list') fetchList(page, search);
    else fetchPivot(page, search);
  }, [tab, page]);

  const handleSearch = (val: string) => {
    setSearch(val); setPage(1);
    if (tab === 'list') fetchList(1, val);
    else fetchPivot(1, val);
  };

  const handleTab = (t: 'list' | 'pivot') => {
    setTab(t); setPage(1); setSearch('');
    if (hasLoaded) {
      if (t === 'list') fetchList(1, '');
      else fetchPivot(1, '');
    }
  };

  const totalPages = Math.ceil(((tab === 'list' ? listTotal : pivotTotal) ?? 0) / LIMIT) || 1;
  const jumlahBulan = (() => {
    const [dY,dM] = dari.split('-').map(Number);
    const [sY,sM] = sampai.split('-').map(Number);
    return (sY - dY) * 12 + (sM - dM) + 1;
  })();

const isExceedsMax = jumlahBulan > 12;
const maxBulanReached = jumlahBulan === 12;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(0,0,0,.45)', padding: '20px 16px', overflowY: 'auto' }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 1400, boxShadow: '0 20px 60px rgba(0,0,0,.2)', fontFamily: font, marginTop: 8 }}>

        {/* Header */}
        <div style={{ padding: '20px 28px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>📊 BOM Gabungan</h2>
            <p style={{ fontSize: 12.5, color: '#6b7280', marginTop: 3 }}>Qty ditampilkan per periode (tidak dijumlahkan)</p>
          </div>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 18, color: '#6b7280' }}>×</button>
        </div>

        {/* Period Picker */}
        <div style={{ padding: '16px 28px', borderBottom: '1px solid #e8eaed', background: '#f8fafc' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>Pilih Rentang Periode</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {[{ label: 'Dari', val: dari, set: setDari }, { label: 'Sampai', val: sampai, set: setSampai }].map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {idx === 1 && <span style={{ color: '#9ca3af', fontSize: 16 }}>→</span>}
                <span style={{ fontSize: 12.5, color: '#374151', fontWeight: 500 }}>{item.label}:</span>
                <select value={item.val} onChange={e => item.set(e.target.value)} style={{ padding: '7px 12px', borderRadius: 8, border: `1.5px solid ${isExceedsMax ? '#ef4444' : '#e2e8f0'}`, fontSize: 13, fontFamily: font, background: '#fff', cursor: 'pointer' }}>
                  {safePeriodes.map(p => <option key={p} value={p}>{MONTHS[Number(p.split('-')[1])-1]} {p.split('-')[0]}</option>)}
                </select>
              </div>
            ))}
            <button onClick={handleLoad} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: isExceedsMax ? '#d1d5db' : 'linear-gradient(135deg,#1d4ed8,#3b82f6)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: isExceedsMax ? 'not-allowed' : 'pointer', fontFamily: font, boxShadow: isExceedsMax ? 'none' : '0 2px 8px rgba(59,130,246,.3)' }}>
              🔍 Tampilkan
            </button>
            {hasLoaded && (
              <div style={{ marginLeft: 'auto', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, color: '#1d4ed8', fontWeight: 600 }}>
                {(() => {
                  if (!periodes || periodes.length === 0) return "";
                  const fmtBulanLengkap = (p: any) => {
                    const date = new Date(p); 
                    return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
                  };
                  const bulanAwal = fmtBulanLengkap(periodes[0]);
                  const bulanAkhir = fmtBulanLengkap(periodes[periodes.length - 1]);
                  const rentangWaktu = periodes.length === 1 
                    ? bulanAwal 
                    : `${bulanAwal} - ${bulanAkhir}`;

                  return `${rentangWaktu} · ${jumlahBulan} bulan`;
                })()}
              </div>
            )}
          </div>
            {isExceedsMax && (
            <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 13, color: '#991b1b', fontWeight: 500 }}>
              ⚠️ Maksimal 12 bulan untuk dibandingkan. Anda memilih {jumlahBulan} bulan.
            </div>
          )}
        </div>

        {/* Tabs + Search */}
        {hasLoaded && (
          <div style={{ padding: '14px 28px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {(['list','pivot'] as const).map(t => (
              <button key={t} onClick={() => handleTab(t)} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: tab === t ? '#1d4ed8' : '#f3f4f6', color: tab === t ? '#fff' : '#6b7280', fontWeight: 600, fontSize: 13, fontFamily: font }}>
                {t === 'list' ? '📋 Tampilan List' : '📊 Tampilan Pivot'}
              </button>
            ))}
            <div style={{ position: 'relative', marginLeft: 'auto' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 13 }}>🔍</span>
              <input value={search} onChange={e => handleSearch(e.target.value)}
                placeholder="Cari part no / assy code..."
                style={{ padding: '8px 12px 8px 32px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: font, outline: 'none', width: 240 }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                onBlur={e =>  e.target.style.borderColor = '#e2e8f0'}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div style={{ padding: '0 28px 24px', overflowX: 'auto' }}>
          {!hasLoaded ? (
            <div style={{ padding: '56px 0', textAlign: 'center', color: '#9ca3af', fontFamily: font }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#6b7280' }}>Pilih rentang periode lalu klik Tampilkan</div>
              <div style={{ fontSize: 12.5 }}>Qty ditampilkan per periode secara terpisah</div>
            </div>

          ) : tab === 'list' ? (
            listLoading ? <LoadingBox /> : (
              <>
                <p style={{ fontSize: 12, color: '#6b7280', padding: '12px 0 8px' }}>{(listTotal ?? 0).toLocaleString()} kombinasi part-assy ditemukan</p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['Part No','Part Name','Unit','Assy Code', ...periodes.map(p => fmtPeriode(p))].map(h => (
                          <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: '#6b7280', borderBottom: '1px solid #e8eaed', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {listRows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}
                          onMouseOver={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseOut={e =>  (e.currentTarget.style.background = '')}>
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11.5, color: '#1d4ed8', fontWeight: 700 }}>{r.part_no}</td>
                          <td style={{ padding: '8px 12px', color: '#374151' }}>{r.part_name || '—'}</td>
                          <td style={{ padding: '8px 12px' }}><span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 5, padding: '2px 6px', fontSize: 10.5, fontWeight: 700 }}>{r.unit || '—'}</span></td>
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11.5, color: '#7c3aed' }}>{r.assy_code}</td>
                          {periodes.map(p => {
                            const qty = qtyMap[r.part_no]?.[r.assy_code]?.[p];
                            return (
                              <td key={p} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: qty ? 700 : 400, color: qty ? '#15803d' : '#d1d5db' }}>
                                {qty ? Number(qty).toLocaleString() : '·'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )

          ) : (
            pivotLoading ? <LoadingBox /> : (
              <>
                <p style={{ fontSize: 12, color: '#6b7280', padding: '12px 0 8px' }}>
                  {(pivotTotal ?? 0).toLocaleString()} part × {(assyCodes?.length ?? 0)} ASSY × {periodes.length} periode
                </p>
                <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto', border: '1px solid #e8eaed', borderRadius: 10 }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                      {/* Row 1: Part info + ASSY group headers */}
                      <tr style={{ background: '#14532d' }}>
                        <th style={{ padding: '8px 10px', color: '#fff', fontWeight: 600, minWidth: 130, position: 'sticky', left: 0, background: '#14532d', zIndex: 11, borderRight: '2px solid #166534' }}>Part No</th>
                        <th style={{ padding: '8px 10px', color: '#fff', fontWeight: 600, minWidth: 55, position: 'sticky', left: 130, background: '#14532d', zIndex: 11, borderRight: '2px solid #166534' }}>Unit</th>
                        {assyCodes.map(a => (
                          <th key={a} colSpan={periodes.length} style={{ padding: '6px 8px', color: '#bbf7d0', fontWeight: 600, fontSize: 10, textAlign: 'center', borderRight: '2px solid #166534', minWidth: periodes.length * 60 }}>
                            {a.length > 18 ? a.slice(0,17)+'…' : a}
                          </th>
                        ))}
                      </tr>
                      {/* Row 2: periode sub-headers */}
                      <tr style={{ background: '#1e3a5f' }}>
                        <th style={{ padding: '5px 10px', position: 'sticky', left: 0, background: '#1e3a5f', zIndex: 11, borderRight: '2px solid #334155' }} />
                        <th style={{ padding: '5px 10px', position: 'sticky', left: 130, background: '#1e3a5f', zIndex: 11, borderRight: '2px solid #334155' }} />
                        {assyCodes.map(a =>
                          periodes.map(p => (
                            <th key={`${a}-${p}`} style={{ padding: '5px 6px', color: '#94a3b8', fontSize: 9.5, fontWeight: 500, textAlign: 'center', borderRight: '1px solid #334155', minWidth: 58 }}>
                              {fmtPeriode(p)}
                            </th>
                          ))
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {pivotParts.map((part, i) => (
                        <tr key={part.part_no} style={{ background: i%2===0 ? '#fff' : '#f0fdf4', borderBottom: '1px solid #e8eaed' }}>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, color: '#1d4ed8', fontWeight: 700, position: 'sticky', left: 0, background: i%2===0 ? '#fff' : '#f0fdf4', zIndex: 2, borderRight: '2px solid #e2e8f0' }}>{part.part_no}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', position: 'sticky', left: 130, background: i%2===0 ? '#fff' : '#f0fdf4', zIndex: 2, borderRight: '2px solid #e2e8f0' }}>
                            <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 700 }}>{part.unit || '—'}</span>
                          </td>
                          {assyCodes.map(a =>
                            periodes.map(p => {
                              const qty = qtyMap[part.part_no]?.[a]?.[p];
                              return (
                                <td key={`${a}-${p}`} style={{ padding: '6px 6px', textAlign: 'center', fontSize: 11, color: qty ? '#15803d' : '#e5e7eb', borderRight: '1px solid #f1f5f9', fontWeight: qty ? 700 : 400 }}>
                                  {qty ? Number(qty).toLocaleString() : '·'}
                                </td>
                              );
                            })
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          )}

          {/* Pagination */}
          {hasLoaded && totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
              <span style={{ fontSize: 12.5, color: '#6b7280', fontFamily: font }}>Halaman {page} dari {totalPages}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <PageBtn disabled={page===1} onClick={() => setPage(1)}>«</PageBtn>
                <PageBtn disabled={page===1} onClick={() => setPage(p => p-1)}>‹</PageBtn>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(page-2, totalPages-4)) + i;
                  return <PageBtn key={p} active={p===page} onClick={() => setPage(p)}>{p}</PageBtn>;
                })}
                <PageBtn disabled={page===totalPages} onClick={() => setPage(p => p+1)}>›</PageBtn>
                <PageBtn disabled={page===totalPages} onClick={() => setPage(totalPages)}>»</PageBtn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
