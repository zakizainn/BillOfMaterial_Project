'use client';

import { useState, useEffect, useCallback } from 'react';

const font = "'DM Sans', system-ui, sans-serif";
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function fmtPeriode(p: string) {
  const [y, m] = p.split('-');
  return `${MONTHS[Number(m)-1]} ${y}`;
}

interface Part {
  part_no: string; part_no_as400: string; part_name: string;
  unit: string; supplier_name: string; out_whs_qty: number;
}
interface PeriodeData {
  assy_codes: string[];
  prod_qty_map: Record<string, number>;
  parts: Part[];
  qty_map: Record<string, Record<string, number>>;
}

function LoadingBox() {
  return (
    <div style={{ padding: '48px 0', textAlign: 'center', color: '#9ca3af', fontFamily: font }}>
      <div style={{ width: 28, height: 28, border: '3px solid #e5e7eb', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin .75s linear infinite', margin: '0 auto 12px' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      Menghitung Total Usage...
    </div>
  );
}

export default function TotalUsageModal({ onClose, availablePeriodes }: {
  onClose: () => void;
  availablePeriodes: string[];
}) {
  const safe = availablePeriodes?.length ? availablePeriodes : [];
  const [mode,       setMode]       = useState<'single' | 'gabungan'>('single');
  const [periode,    setPeriode]    = useState(safe[0] || '');
  const [dari,       setDari]       = useState(safe[safe.length-1] || '');
  const [sampai,     setSampai]     = useState(safe[0] || '');
  const [hasLoaded,  setHasLoaded]  = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [periodes,   setPeriodes]   = useState<string[]>([]);
  const [results,    setResults]    = useState<Record<string, PeriodeData>>({});
  const [search,     setSearch]     = useState('');
  const [activePer,  setActivePer]  = useState('');

  // Untuk mode gabungan — filter ASSY
  const [allAssyCodes,  setAllAssyCodes]  = useState<string[]>([]);
  const [selectedAssy,  setSelectedAssy]  = useState<Set<string>>(new Set());
  const [assySearch,    setAssySearch]    = useState('');
  const [showAssyPicker,setShowAssyPicker]= useState(false);

  // Load daftar ASSY untuk picker (mode gabungan)
  const loadAssyCodes = useCallback(async () => {
    if (!dari || !sampai) return;
    const res  = await fetch(`/api/bom/gabungan?dari=${dari}&sampai=${sampai}&mode=pivot&page=1&limit=1`);
    const data = await res.json();
    setAllAssyCodes(data.assy_codes ?? []);
  }, [dari, sampai]);

  useEffect(() => { if (mode === 'gabungan') loadAssyCodes(); }, [mode, dari, sampai, loadAssyCodes]);

  const fetchData = async () => {
    setLoading(true); setHasLoaded(true);
    try {
      let url = '';
      if (mode === 'single') {
        url = `/api/total-usage?periode=${encodeURIComponent(periode)}`;
      } else {
        const assyParam = selectedAssy.size > 0 ? `&assy_codes=${[...selectedAssy].join(',')}` : '';
        url = `/api/total-usage?dari=${dari}&sampai=${sampai}${assyParam}`;
      }
      const res  = await fetch(url);
      const data = await res.json();
      setPeriodes(data.periodes ?? []);
      setResults(data.results ?? {});
      setActivePer((data.periodes ?? [])[0] || '');
    } catch { /**/ }
    setLoading(false);
  };

  const currentData = results[activePer];
  const assyCodes   = currentData?.assy_codes ?? [];
  const prodQtyMap  = currentData?.prod_qty_map ?? {};
  const parts       = (currentData?.parts ?? []).filter(p =>
    !search ||
    p.part_no.toLowerCase().includes(search.toLowerCase()) ||
    (p.part_name ?? '').toLowerCase().includes(search.toLowerCase())
  );
  const qtyMap = currentData?.qty_map ?? {};

  // Hitung total usage per part = ROUNDUP(SUMPRODUCT(prod_qty, qty_per_unit), 0)
  const calcTotalUsage = (part_no: string) => {
    let sum = 0;
    for (const assy of assyCodes) {
      const qty     = qtyMap[part_no]?.[assy] ?? 0;
      const prodQty = prodQtyMap[assy] ?? 0;
      sum += qty * prodQty;
    }
    return Math.ceil(sum);
  };

  // Hitung sum per ASSY (baris bawah)
  const calcAssySum = (assy: string) => {
    return parts.reduce((s, p) => s + (qtyMap[p.part_no]?.[assy] ?? 0), 0);
  };

  const filteredAssy = allAssyCodes.filter(a =>
    !assySearch || a.toLowerCase().includes(assySearch.toLowerCase())
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(0,0,0,.45)', padding: '20px 16px', overflowY: 'auto' }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 1400, boxShadow: '0 20px 60px rgba(0,0,0,.2)', fontFamily: font, marginTop: 8 }}>

        {/* Header */}
        <div style={{ padding: '20px 28px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>📊 Total Usage</h2>
            <p style={{ fontSize: 12.5, color: '#6b7280', marginTop: 3 }}>ROUNDUP(qty_per_unit × prod_qty) per part per periode</p>
          </div>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 18, color: '#6b7280' }}>×</button>
        </div>

        {/* Mode + Filter */}
        <div style={{ padding: '16px 28px', borderBottom: '1px solid #e8eaed', background: '#f8fafc' }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {(['single','gabungan'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setHasLoaded(false); }} style={{
                padding: '7px 18px', borderRadius: 8, border: '1.5px solid',
                borderColor: mode === m ? '#1d4ed8' : '#e2e8f0',
                background: mode === m ? '#eff6ff' : '#fff',
                color: mode === m ? '#1d4ed8' : '#6b7280',
                fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: font,
              }}>
                {m === 'single' ? '📅 Single Periode' : '📆 Gabungan'}
              </button>
            ))}
          </div>

          {/* Filter baris */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {mode === 'single' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12.5, color: '#374151', fontWeight: 500 }}>Periode:</span>
                <select value={periode} onChange={e => setPeriode(e.target.value)} style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: font, background: '#fff', cursor: 'pointer' }}>
                  {safe.map(p => <option key={p} value={p}>{fmtPeriode(p)}</option>)}
                </select>
              </div>
            ) : (
              <>
                {[{ label: 'Dari', val: dari, set: setDari }, { label: 'Sampai', val: sampai, set: setSampai }].map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {idx === 1 && <span style={{ color: '#9ca3af' }}>→</span>}
                    <span style={{ fontSize: 12.5, color: '#374151', fontWeight: 500 }}>{item.label}:</span>
                    <select value={item.val} onChange={e => item.set(e.target.value)} style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: font, background: '#fff', cursor: 'pointer' }}>
                      {safe.map(p => <option key={p} value={p}>{fmtPeriode(p)}</option>)}
                    </select>
                  </div>
                ))}

                {/* Filter ASSY */}
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowAssyPicker(v => !v)} style={{
                    padding: '7px 14px', borderRadius: 8, border: '1.5px solid #7c3aed',
                    background: '#faf5ff', color: '#7c3aed', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: font,
                  }}>
                    🔩 Filter ASSY {selectedAssy.size > 0 ? `(${selectedAssy.size} dipilih)` : '(semua)'}
                  </button>
                  {showAssyPicker && (
                    <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 50, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', width: 320, maxHeight: 360, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                        <input value={assySearch} onChange={e => setAssySearch(e.target.value)} placeholder="Cari ASSY..." style={{ width: '100%', padding: '6px 10px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12.5, fontFamily: font, outline: 'none' }} />
                      </div>
                      <div style={{ padding: '6px 4px', display: 'flex', gap: 6, borderBottom: '1px solid #f1f5f9' }}>
                        <button onClick={() => setSelectedAssy(new Set(allAssyCodes))} style={{ flex: 1, padding: '4px', fontSize: 11.5, border: 'none', background: '#eff6ff', color: '#1d4ed8', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>Pilih Semua</button>
                        <button onClick={() => setSelectedAssy(new Set())} style={{ flex: 1, padding: '4px', fontSize: 11.5, border: 'none', background: '#fef2f2', color: '#dc2626', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>Reset</button>
                      </div>
                      <div style={{ overflowY: 'auto', flex: 1 }}>
                        {filteredAssy.map(a => (
                          <div key={a} onClick={() => setSelectedAssy(s => { const n = new Set(s); n.has(a) ? n.delete(a) : n.add(a); return n; })}
                            style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, background: selectedAssy.has(a) ? '#f0fdf4' : '#fff' }}
                            onMouseOver={e => (e.currentTarget.style.background = selectedAssy.has(a) ? '#dcfce7' : '#f8fafc')}
                            onMouseOut={e =>  (e.currentTarget.style.background = selectedAssy.has(a) ? '#f0fdf4' : '#fff')}>
                            <span style={{ width: 14, height: 14, borderRadius: 3, border: '1.5px solid', borderColor: selectedAssy.has(a) ? '#16a34a' : '#d1d5db', background: selectedAssy.has(a) ? '#16a34a' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {selectedAssy.has(a) && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>✓</span>}
                            </span>
                            <span style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{a}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ padding: '8px 12px', borderTop: '1px solid #f1f5f9' }}>
                        <button onClick={() => setShowAssyPicker(false)} style={{ width: '100%', padding: '7px', borderRadius: 7, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: font }}>Terapkan</button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            <button onClick={fetchData} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: font, boxShadow: '0 2px 8px rgba(59,130,246,.3)' }}>
              🔍 Tampilkan
            </button>
          </div>
        </div>

        {/* Periode tabs (mode gabungan) */}
        {hasLoaded && periodes.length > 1 && (
          <div style={{ padding: '10px 28px', borderBottom: '1px solid #e8eaed', display: 'flex', gap: 8, overflowX: 'auto' }}>
            {periodes.map(p => (
              <button key={p} onClick={() => setActivePer(p)} style={{
                padding: '6px 16px', borderRadius: 7, border: '1.5px solid',
                borderColor: activePer === p ? '#1d4ed8' : '#e2e8f0',
                background: activePer === p ? '#1d4ed8' : '#fff',
                color: activePer === p ? '#fff' : '#6b7280',
                fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: font, whiteSpace: 'nowrap',
              }}>{fmtPeriode(p)}</button>
            ))}
          </div>
        )}

        {/* Content */}
        <div style={{ padding: '0 28px 24px' }}>
          {!hasLoaded ? (
            <div style={{ padding: '56px 0', textAlign: 'center', color: '#9ca3af', fontFamily: font }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>Pilih periode lalu klik Tampilkan</div>
              <div style={{ fontSize: 12.5 }}>Kalkulasi: ROUNDUP(qty_per_unit × prod_qty, 0)</div>
            </div>
          ) : loading ? <LoadingBox /> : !currentData ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#9ca3af' }}>Tidak ada data</div>
          ) : (
            <>
              {/* Search + info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0 10px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 13 }}>🔍</span>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari part no / part name..."
                    style={{ padding: '8px 12px 8px 32px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: font, outline: 'none', width: 260 }}
                    onFocus={e => e.target.style.borderColor = '#3b82f6'}
                    onBlur={e =>  e.target.style.borderColor = '#e2e8f0'}
                  />
                </div>
                <span style={{ fontSize: 12.5, color: '#6b7280' }}>
                  {parts.length} part · {assyCodes.length} ASSY · Periode: <b>{fmtPeriode(activePer)}</b>
                  {!Object.values(prodQtyMap).some(v => v > 0) && (
                    <span style={{ marginLeft: 8, background: '#fef9c3', color: '#854d0e', borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>⚠ Prod Qty belum diisi Finance</span>
                  )}
                </span>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto', border: '1px solid #e8eaed', borderRadius: 10 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 11.5, whiteSpace: 'nowrap', width: '100%' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    {/* Row 1: info cols + ASSY headers */}
                    <tr style={{ background: '#1e3a5f' }}>
                      <th style={{ padding: '8px 10px', color: '#cbd5e1', fontWeight: 600, fontSize: 10, textAlign: 'left', position: 'sticky', left: 0, background: '#1e3a5f', zIndex: 11, borderRight: '1px solid #334155', minWidth: 130 }}>PART NO</th>
                      <th style={{ padding: '8px 10px', color: '#cbd5e1', fontWeight: 600, fontSize: 10, textAlign: 'left', background: '#1e3a5f', borderRight: '1px solid #334155', minWidth: 110 }}>PART NO AS400</th>
                      <th style={{ padding: '8px 10px', color: '#cbd5e1', fontWeight: 600, fontSize: 10, textAlign: 'left', background: '#1e3a5f', borderRight: '1px solid #334155', minWidth: 100 }}>SUPPLIER</th>
                      <th style={{ padding: '8px 10px', color: '#cbd5e1', fontWeight: 600, fontSize: 10, textAlign: 'left', background: '#1e3a5f', borderRight: '1px solid #334155', minWidth: 140 }}>PART NAME</th>
                      <th style={{ padding: '8px 10px', color: '#cbd5e1', fontWeight: 600, fontSize: 10, textAlign: 'center', background: '#1e3a5f', borderRight: '2px solid #475569', minWidth: 55 }}>UNIT</th>
                      {assyCodes.map(a => (
                        <th key={a} style={{ padding: '6px 8px', color: '#93c5fd', fontWeight: 600, fontSize: 9.5, textAlign: 'center', borderRight: '1px solid #334155', minWidth: 70, maxWidth: 90 }} title={a}>
                          {a.length > 12 ? a.slice(0,11)+'…' : a}
                        </th>
                      ))}
                      <th style={{ padding: '8px 10px', color: '#fbbf24', fontWeight: 700, fontSize: 10, textAlign: 'right', borderLeft: '2px solid #f59e0b', minWidth: 70, background: '#1c2d1e' }}>TOTAL</th>
                      <th style={{ padding: '8px 10px', color: '#4ade80', fontWeight: 700, fontSize: 10, textAlign: 'right', borderLeft: '2px solid #16a34a', minWidth: 90, background: '#1c2d1e' }}>TOTAL USAGE</th>
                    </tr>
                    {/* Row 2: Prod Qty per ASSY — cell kosong untuk kolom info */}
                    <tr style={{ background: '#0f172a' }}>
                      <td style={{ padding: '6px 10px', color: '#f59e0b', fontWeight: 700, fontSize: 10.5, position: 'sticky', left: 0, background: '#0f172a', zIndex: 11, borderRight: '1px solid #1e293b' }}>PROD QTY →</td>
                      <td style={{ background: '#0f172a', borderRight: '1px solid #1e293b' }} />
                      <td style={{ background: '#0f172a', borderRight: '1px solid #1e293b' }} />
                      <td style={{ background: '#0f172a', borderRight: '1px solid #1e293b' }} />
                      <td style={{ background: '#0f172a', borderRight: '2px solid #475569' }} />
                      {assyCodes.map(a => (
                        <td key={a} style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: (prodQtyMap[a] ?? 0) > 0 ? '#fbbf24' : '#475569', borderRight: '1px solid #1e293b' }}>
                          {(prodQtyMap[a] ?? 0) > 0 ? Number(prodQtyMap[a]).toLocaleString() : '—'}
                        </td>
                      ))}
                      <td style={{ borderLeft: '2px solid #f59e0b', background: '#0f172a' }} />
                      <td style={{ borderLeft: '2px solid #16a34a', background: '#0f172a' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((part, i) => {
                      const totalUsage = calcTotalUsage(part.part_no);
                      const totalQty   = assyCodes.reduce((s, a) => s + (qtyMap[part.part_no]?.[a] ?? 0), 0);
                      return (
                        <tr key={part.part_no} style={{ background: i%2===0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}
                          onMouseOver={e => (e.currentTarget.style.background = '#eff6ff')}
                          onMouseOut={e =>  (e.currentTarget.style.background = i%2===0 ? '#fff' : '#f8fafc')}>
                          <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11, color: '#1d4ed8', fontWeight: 700, position: 'sticky', left: 0, background: i%2===0 ? '#fff' : '#f8fafc', zIndex: 2, borderRight: '1px solid #e2e8f0' }}>{part.part_no}</td>
                          <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 10.5, color: '#6b7280', borderRight: '1px solid #e2e8f0' }}>{part.part_no_as400}</td>
                          <td style={{ padding: '7px 10px', fontSize: 11, color: '#4b5563', borderRight: '1px solid #e2e8f0' }}>{part.supplier_name || '—'}</td>
                          <td style={{ padding: '7px 10px', fontSize: 11, color: '#374151', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', borderRight: '1px solid #e2e8f0' }}>{part.part_name}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'center', borderRight: '2px solid #e2e8f0' }}>
                            <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{part.unit}</span>
                          </td>
                          {assyCodes.map(a => {
                            const qty = qtyMap[part.part_no]?.[a];
                            return (
                              <td key={a} style={{ padding: '7px 8px', textAlign: 'center', color: qty ? '#111827' : '#e5e7eb', fontWeight: qty ? 600 : 400, borderRight: '1px solid #f1f5f9', fontSize: 11 }}>
                                {qty ? Number(qty).toLocaleString() : '·'}
                              </td>
                            );
                          })}
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#92400e', borderLeft: '2px solid #fde68a', background: i%2===0 ? '#fffbeb' : '#fef9c3', fontSize: 11 }}>
                            {totalQty > 0 ? totalQty.toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: totalUsage > 0 ? '#15803d' : '#9ca3af', borderLeft: '2px solid #bbf7d0', background: i%2===0 ? '#f0fdf4' : '#dcfce7', fontSize: 11 }}>
                            {totalUsage > 0 ? totalUsage.toLocaleString() : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Footer — sum per ASSY */}
                  <tfoot>
                    <tr style={{ background: '#1e3a5f', position: 'sticky', bottom: 0 }}>
                      <td style={{ padding: '8px 10px', color: '#fbbf24', fontWeight: 700, fontSize: 10.5, position: 'sticky', left: 0, background: '#1e3a5f', zIndex: 11, borderRight: '1px solid #334155' }}>∑ TOTAL PER ASSY</td>
                      <td style={{ background: '#1e3a5f', borderRight: '1px solid #334155' }} />
                      <td style={{ background: '#1e3a5f', borderRight: '1px solid #334155' }} />
                      <td style={{ background: '#1e3a5f', borderRight: '1px solid #334155' }} />
                      <td style={{ background: '#1e3a5f', borderRight: '2px solid #475569' }} />
                      {assyCodes.map(a => (
                        <td key={a} style={{ padding: '8px 8px', textAlign: 'center', color: '#fbbf24', fontWeight: 700, fontSize: 11, borderRight: '1px solid #334155' }}>
                          {calcAssySum(a).toLocaleString()}
                        </td>
                      ))}
                      <td style={{ borderLeft: '2px solid #f59e0b', background: '#1e3a5f' }} />
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: '#4ade80', fontWeight: 700, fontSize: 11, borderLeft: '2px solid #16a34a', background: '#1e3a5f' }}>
                        {parts.reduce((s, p) => s + calcTotalUsage(p.part_no), 0).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
