'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const font = "'DM Sans', system-ui, sans-serif";
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function fmtPeriode(p: string) {
  const [y, m] = p.split('-');
  return `${MONTHS[Number(m)-1]} ${y}`;
}

interface Part { part_no: string; part_no_as400: string; part_name: string; unit: string; supplier_name: string; }
interface PeriodeData {
  assy_codes: string[];
  prod_qty_map: Record<string, number>;
  parts: Part[];
  qty_map: Record<string, Record<string, number>>;
  total_parts: number;
  page: number;
  limit: number;
}

function LoadingBox() {
  return (
    <div style={{ padding: '60px 0', textAlign: 'center', color: '#9ca3af', fontFamily: font }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin .75s linear infinite', margin: '0 auto 14px' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ fontSize: 13.5 }}>Memuat data Report...</div>
    </div>
  );
}

function PageBtn({ children, onClick, disabled, active }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '6px 12px', borderRadius: 7, border: '1.5px solid',
      borderColor: active ? '#1d4ed8' : disabled ? '#e5e7eb' : '#e2e8f0',
      background: active ? '#1d4ed8' : '#fff',
      color: active ? '#fff' : disabled ? '#d1d5db' : '#374151',
      fontWeight: 600, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: font,
    }}>{children}</button>
  );
}

export default function ReportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  if (status === 'loading' || !session) return null;

  return <ReportContent />;
}

function ReportContent() {
  const router = useRouter();
  const [mode,        setMode]        = useState<'single' | 'gabungan'>('single');
  const [availPer,    setAvailPer]    = useState<string[]>([]);
  const [periode,     setPeriode]     = useState('');
  const [dari,        setDari]        = useState('');
  const [sampai,      setSampai]      = useState('');
  const [hasLoaded,   setHasLoaded]   = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [periodes,    setPeriodes]    = useState<string[]>([]);
  const [results,     setResults]     = useState<Record<string, PeriodeData>>({});
  const [activePer,   setActivePer]   = useState('');
  const [page,        setPage]        = useState(1);
  const [search,      setSearch]      = useState('');
  const LIMIT = 50;

  // Filter ASSY (mode gabungan)
  const [allAssyCodes,   setAllAssyCodes]   = useState<string[]>([]);
  const [selectedAssy,   setSelectedAssy]   = useState<Set<string>>(new Set());
  const [assySearch,     setAssySearch]     = useState('');
  const [showAssyPicker, setShowAssyPicker] = useState(false);

  // Load available periodes
  useEffect(() => {
    fetch('/api/bom').then(r => r.json()).then((data: { periode: string }[]) => {
      const ps = data.map(d => d.periode).sort().reverse();
      setAvailPer(ps);
      if (ps.length > 0) { setPeriode(ps[0]); setDari(ps[ps.length-1]); setSampai(ps[0]); }
    });
  }, []);

  // Load ASSY codes untuk mode gabungan
  const loadAssyCodes = useCallback(async () => {
    if (!dari || !sampai) return;
    const res  = await fetch(`/api/bom/gabungan?dari=${dari}&sampai=${sampai}&mode=pivot&page=1&limit=1`);
    const data = await res.json();
    setAllAssyCodes(data.assy_codes ?? []);
  }, [dari, sampai]);

  useEffect(() => { if (mode === 'gabungan') loadAssyCodes(); }, [mode, dari, sampai, loadAssyCodes]);

  const buildUrl = useCallback((p: number, s: string) => {
    const base = mode === 'single'
      ? `/api/report?periode=${encodeURIComponent(periode)}`
      : `/api/report?dari=${dari}&sampai=${sampai}${selectedAssy.size > 0 ? `&assy_codes=${[...selectedAssy].join(',')}` : ''}`;
    return `${base}&page=${p}&limit=${LIMIT}&search=${encodeURIComponent(s)}`;
  }, [mode, periode, dari, sampai, selectedAssy]);

  const fetchData = useCallback(async (p: number, s: string) => {
    setLoading(true);
    try {
      const res  = await fetch(buildUrl(p, s));
      const data = await res.json();
      setPeriodes(data.periodes ?? []);
      setResults(data.results ?? {});
      setActivePer((data.periodes ?? [])[0] || '');
    } catch { /**/ }
    setLoading(false);
  }, [buildUrl]);

  const handleLoad = () => {
    setPage(1); setSearch(''); setHasLoaded(true);
    fetchData(1, '');
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchData(newPage, search);
  };

  const handleSearch = (val: string) => {
    setSearch(val); setPage(1);
    fetchData(1, val);
  };

  const currentData = results[activePer];
  const assyCodes   = currentData?.assy_codes   ?? [];
  const prodQtyMap  = currentData?.prod_qty_map ?? {};
  const parts       = currentData?.parts        ?? [];
  const qtyMap      = currentData?.qty_map      ?? {};
  const totalParts  = currentData?.total_parts  ?? 0;
  const totalPages  = Math.ceil(totalParts / LIMIT) || 1;

  const calcTotalUsage = (part_no: string) => {
    let sum = 0;
    for (const assy of assyCodes) {
      sum += (qtyMap[part_no]?.[assy] ?? 0) * (prodQtyMap[assy] ?? 0);
    }
    return Math.ceil(sum);
  };

  const calcAssyColSum = (assy: string) =>
    parts.reduce((s, p) => s + (qtyMap[p.part_no]?.[assy] ?? 0), 0);

  const filteredAssy = allAssyCodes.filter(a =>
    !assySearch || a.toLowerCase().includes(assySearch.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: font }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* Navbar */}
      <nav style={{ background: '#fff', borderBottom: '1px solid #e8eaed', padding: '0 40px', display: 'flex', alignItems: 'center', height: 60, boxShadow: '0 1px 3px rgba(0,0,0,.06)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 24, paddingRight: 24, borderRight: '1px solid #e8eaed' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>📊</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: '#111827' }}>Report</div>
            <div style={{ fontSize: 10.5, color: '#9ca3af', fontWeight: 500 }}>BOM × Prod Qty</div>
          </div>
        </div>
        <button onClick={() => router.back?.()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#6b7280', fontWeight: 600, fontFamily: font, display: 'flex', alignItems: 'center', gap: 6 }}>
          ← Kembali
        </button>
      </nav>

      <main style={{ padding: '28px 40px', maxWidth: 1600, margin: '0 auto' }}>
        {/* Filter card */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8eaed', padding: '20px 24px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <p style={{ fontSize: 11.5, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 14 }}>Filter Report</p>

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {mode === 'single' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12.5, color: '#374151', fontWeight: 500 }}>Periode:</span>
                <select value={periode} onChange={e => setPeriode(e.target.value)} style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: font, background: '#fff', cursor: 'pointer' }}>
                  {availPer.map(p => <option key={p} value={p}>{fmtPeriode(p)}</option>)}
                </select>
              </div>
            ) : (
              <>
                {[{ label: 'Dari', val: dari, set: setDari }, { label: 'Sampai', val: sampai, set: setSampai }].map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {idx === 1 && <span style={{ color: '#9ca3af' }}>→</span>}
                    <span style={{ fontSize: 12.5, color: '#374151', fontWeight: 500 }}>{item.label}:</span>
                    <select value={item.val} onChange={e => item.set(e.target.value)} style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: font, background: '#fff', cursor: 'pointer' }}>
                      {availPer.map(p => <option key={p} value={p}>{fmtPeriode(p)}</option>)}
                    </select>
                  </div>
                ))}

                {/* Filter ASSY picker */}
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowAssyPicker(v => !v)} style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #7c3aed', background: '#faf5ff', color: '#7c3aed', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: font }}>
                    🔩 Filter ASSY {selectedAssy.size > 0 ? `(${selectedAssy.size} dipilih)` : '(semua)'}
                  </button>
                  {showAssyPicker && (
                    <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 50, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', width: 320, maxHeight: 360, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                        <input value={assySearch} onChange={e => setAssySearch(e.target.value)} placeholder="Cari ASSY..." style={{ width: '100%', padding: '6px 10px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12.5, fontFamily: font, outline: 'none' }} />
                      </div>
                      <div style={{ padding: '6px', display: 'flex', gap: 6, borderBottom: '1px solid #f1f5f9' }}>
                        <button onClick={() => setSelectedAssy(new Set(allAssyCodes))} style={{ flex: 1, padding: '4px', fontSize: 11.5, border: 'none', background: '#eff6ff', color: '#1d4ed8', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>Pilih Semua</button>
                        <button onClick={() => setSelectedAssy(new Set())} style={{ flex: 1, padding: '4px', fontSize: 11.5, border: 'none', background: '#fef2f2', color: '#dc2626', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>Reset</button>
                      </div>
                      <div style={{ overflowY: 'auto', flex: 1 }}>
                        {filteredAssy.map(a => (
                          <div key={a} onClick={() => setSelectedAssy(s => { const n = new Set(s); n.has(a) ? n.delete(a) : n.add(a); return n; })}
                            style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, background: selectedAssy.has(a) ? '#f0fdf4' : '#fff' }}>
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

            <button onClick={handleLoad} style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: font, boxShadow: '0 2px 8px rgba(59,130,246,.3)' }}>
              🔍 Tampilkan
            </button>
          </div>
        </div>

        {/* Periode tabs (mode gabungan) */}
        {hasLoaded && periodes.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
            {periodes.map(p => (
              <button key={p} onClick={() => { setActivePer(p); setPage(1); }} style={{
                padding: '7px 18px', borderRadius: 8, border: '1.5px solid',
                borderColor: activePer === p ? '#1d4ed8' : '#e2e8f0',
                background: activePer === p ? '#1d4ed8' : '#fff',
                color: activePer === p ? '#fff' : '#6b7280',
                fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: font, whiteSpace: 'nowrap',
              }}>{fmtPeriode(p)}</button>
            ))}
          </div>
        )}

        {/* Content */}
        {!hasLoaded ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8eaed', padding: '60px 0', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>📊</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>Pilih periode lalu klik Tampilkan</div>
            <div style={{ fontSize: 13 }}>Kalkulasi: ROUNDUP(SUMPRODUCT(prod_qty × qty_per_unit), 0)</div>
          </div>
        ) : loading ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8eaed' }}><LoadingBox /></div>
        ) : !currentData ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8eaed', padding: '40px 0', textAlign: 'center', color: '#9ca3af' }}>Tidak ada data</div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8eaed', overflow: 'hidden' }}>
            {/* Table toolbar */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 13 }}>🔍</span>
                <input value={search} onChange={e => handleSearch(e.target.value)} placeholder="Cari part no / part name..."
                  style={{ padding: '7px 12px 7px 32px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: font, outline: 'none', width: 260 }}
                  onFocus={e => e.target.style.borderColor = '#3b82f6'}
                  onBlur={e =>  e.target.style.borderColor = '#e2e8f0'}
                />
              </div>
              <span style={{ fontSize: 12.5, color: '#6b7280' }}>
                <b style={{ color: '#111827' }}>{totalParts.toLocaleString()}</b> part ·
                <b style={{ color: '#111827' }}> {assyCodes.length}</b> ASSY ·
                Periode: <b style={{ color: '#1d4ed8' }}>{fmtPeriode(activePer)}</b>
              </span>
              {!Object.values(prodQtyMap).some(v => v > 0) && (
                <span style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 600 }}>
                  ⚠ Prod Qty belum diisi Finance
                </span>
              )}
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 11.5, whiteSpace: 'nowrap' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  {/* Row 1: headers */}
                  <tr style={{ background: '#1e3a5f' }}>
                    <th style={{ padding: '9px 12px', color: '#cbd5e1', fontWeight: 600, fontSize: 10, textAlign: 'left', position: 'sticky', left: 0, background: '#1e3a5f', zIndex: 11, borderRight: '1px solid #334155', minWidth: 130 }}>PART NO</th>
                    <th style={{ padding: '9px 12px', color: '#cbd5e1', fontWeight: 600, fontSize: 10, background: '#1e3a5f', borderRight: '1px solid #334155', minWidth: 110 }}>PART NO AS400</th>
                    <th style={{ padding: '9px 12px', color: '#cbd5e1', fontWeight: 600, fontSize: 10, background: '#1e3a5f', borderRight: '1px solid #334155', minWidth: 110 }}>SUPPLIER</th>
                    <th style={{ padding: '9px 12px', color: '#cbd5e1', fontWeight: 600, fontSize: 10, background: '#1e3a5f', borderRight: '1px solid #334155', minWidth: 150 }}>PART NAME</th>
                    <th style={{ padding: '9px 12px', color: '#cbd5e1', fontWeight: 600, fontSize: 10, textAlign: 'center', background: '#1e3a5f', borderRight: '2px solid #475569', minWidth: 55 }}>UNIT</th>
                    {assyCodes.map(a => (
                      <th key={a} style={{ padding: '6px 8px', color: '#93c5fd', fontWeight: 600, fontSize: 9.5, textAlign: 'center', borderRight: '1px solid #334155', minWidth: 72 }} title={a}>
                        {a.length > 13 ? a.slice(0,12)+'…' : a}
                      </th>
                    ))}
                    <th style={{ padding: '9px 10px', color: '#fbbf24', fontWeight: 700, fontSize: 10, textAlign: 'right', borderLeft: '2px solid #f59e0b', minWidth: 72, background: '#1c2d1e', position: 'sticky', right: 90 }}>TOTAL</th>
                    <th style={{ padding: '9px 10px', color: '#4ade80', fontWeight: 700, fontSize: 10, textAlign: 'right', borderLeft: '2px solid #16a34a', minWidth: 90, background: '#1c2d1e', position: 'sticky', right: 0 }}>TOTAL USAGE</th>
                  </tr>
                  {/* Row 2: Prod Qty */}
                  <tr style={{ background: '#0f172a' }}>
                    <td style={{ padding: '6px 12px', color: '#f59e0b', fontWeight: 700, fontSize: 10.5, position: 'sticky', left: 0, background: '#0f172a', zIndex: 11, borderRight: '1px solid #1e293b' }}>PROD QTY →</td>
                    <td style={{ background: '#0f172a', borderRight: '1px solid #1e293b' }} />
                    <td style={{ background: '#0f172a', borderRight: '1px solid #1e293b' }} />
                    <td style={{ background: '#0f172a', borderRight: '1px solid #1e293b' }} />
                    <td style={{ background: '#0f172a', borderRight: '2px solid #475569' }} />
                    {assyCodes.map(a => (
                      <td key={a} style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: (prodQtyMap[a] ?? 0) > 0 ? '#fbbf24' : '#475569', borderRight: '1px solid #1e293b' }}>
                        {(prodQtyMap[a] ?? 0) > 0 ? Number(prodQtyMap[a]).toLocaleString() : '—'}
                      </td>
                    ))}
                    <td style={{ borderLeft: '2px solid #f59e0b', background: '#0f172a', position: 'sticky', right: 90 }} />
                    <td style={{ borderLeft: '2px solid #16a34a', background: '#0f172a', position: 'sticky', right: 0 }} />
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
                        <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontSize: 11, color: '#1d4ed8', fontWeight: 700, position: 'sticky', left: 0, background: i%2===0 ? '#fff' : '#f8fafc', zIndex: 2, borderRight: '1px solid #e2e8f0' }}>{part.part_no}</td>
                        <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontSize: 10.5, color: '#6b7280', borderRight: '1px solid #f1f5f9' }}>{part.part_no_as400 || '—'}</td>
                        <td style={{ padding: '7px 12px', fontSize: 11, color: '#4b5563', borderRight: '1px solid #f1f5f9' }}>{part.supplier_name || '—'}</td>
                        <td style={{ padding: '7px 12px', fontSize: 11, color: '#374151', borderRight: '1px solid #f1f5f9', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{part.part_name || '—'}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'center', borderRight: '2px solid #e2e8f0' }}>
                          <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{part.unit || '—'}</span>
                        </td>
                        {assyCodes.map(a => {
                          const qty = qtyMap[part.part_no]?.[a];
                          return (
                            <td key={a} style={{ padding: '7px 8px', textAlign: 'center', color: qty ? '#111827' : '#e5e7eb', fontWeight: qty ? 600 : 400, borderRight: '1px solid #f1f5f9', fontSize: 11 }}>
                              {qty ? Number(qty).toLocaleString() : '·'}
                            </td>
                          );
                        })}
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#92400e', borderLeft: '2px solid #fde68a', background: i%2===0 ? '#fffbeb' : '#fef9c3', fontSize: 11, position: 'sticky', right: 90 }}>
                          {totalQty > 0 ? totalQty.toLocaleString() : '—'}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: totalUsage > 0 ? '#15803d' : '#9ca3af', borderLeft: '2px solid #bbf7d0', background: i%2===0 ? '#f0fdf4' : '#dcfce7', fontSize: 11, position: 'sticky', right: 0 }}>
                          {totalUsage > 0 ? totalUsage.toLocaleString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Footer */}
                <tfoot>
                  <tr style={{ background: '#1e3a5f' }}>
                    <td style={{ padding: '8px 12px', color: '#fbbf24', fontWeight: 700, fontSize: 10.5, position: 'sticky', left: 0, background: '#1e3a5f', zIndex: 11, borderRight: '1px solid #334155' }}>∑ TOTAL PER ASSY</td>
                    <td style={{ background: '#1e3a5f', borderRight: '1px solid #334155' }} />
                    <td style={{ background: '#1e3a5f', borderRight: '1px solid #334155' }} />
                    <td style={{ background: '#1e3a5f', borderRight: '1px solid #334155' }} />
                    <td style={{ background: '#1e3a5f', borderRight: '2px solid #475569' }} />
                    {assyCodes.map(a => (
                      <td key={a} style={{ padding: '8px 8px', textAlign: 'center', color: '#fbbf24', fontWeight: 700, fontSize: 11, borderRight: '1px solid #334155' }}>
                        {calcAssyColSum(a).toLocaleString()}
                      </td>
                    ))}
                    <td style={{ borderLeft: '2px solid #f59e0b', background: '#1e3a5f', position: 'sticky', right: 90 }} />
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#4ade80', fontWeight: 700, fontSize: 11, borderLeft: '2px solid #16a34a', background: '#1e3a5f', position: 'sticky', right: 0 }}>
                      {parts.reduce((s, p) => s + calcTotalUsage(p.part_no), 0).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ padding: '14px 20px', borderTop: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <span style={{ fontSize: 12.5, color: '#6b7280' }}>
                  Menampilkan {((page-1)*LIMIT)+1}–{Math.min(page*LIMIT, totalParts)} dari {totalParts.toLocaleString()} part
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <PageBtn disabled={page===1} onClick={() => handlePageChange(1)}>«</PageBtn>
                  <PageBtn disabled={page===1} onClick={() => handlePageChange(page-1)}>‹</PageBtn>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const p = Math.max(1, Math.min(page-2, totalPages-4)) + i;
                    return <PageBtn key={p} active={p===page} onClick={() => handlePageChange(p)}>{p}</PageBtn>;
                  })}
                  <PageBtn disabled={page===totalPages} onClick={() => handlePageChange(page+1)}>›</PageBtn>
                  <PageBtn disabled={page===totalPages} onClick={() => handlePageChange(totalPages)}>»</PageBtn>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

