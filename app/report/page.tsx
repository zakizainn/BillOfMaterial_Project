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

// ── Mode single: prod_qty_map = { assy_code: qty }
//    Mode gabungan: prod_qty_map = { assy_code: { periode: qty } }
interface PeriodeData {
  assy_codes: string[];
  prod_qty_map: Record<string, number | Record<string, number>>;
  parts: Part[];
  // Mode single:    qty_map = { part_no: { assy_code: qty } }
  // Mode gabungan:  qty_map = { part_no: { assy_code: { periode: qty } } }
  qty_map: Record<string, Record<string, number | Record<string, number>>>;
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

  // Untuk mode gabungan: key result adalah "dari_sampai"
  const gabunganKey = `${dari}_${sampai}`;

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

  const buildDownloadUrl = (targetPeriode: string, s: string) => {
    if (mode === 'gabungan') {
      return `/api/report?dari=${dari}&sampai=${sampai}${selectedAssy.size > 0 ? `&assy_codes=${[...selectedAssy].join(',')}` : ''}&search=${encodeURIComponent(s)}&download=true`;
    }
    const base = `/api/report?periode=${encodeURIComponent(targetPeriode)}${selectedAssy.size > 0 ? `&assy_codes=${[...selectedAssy].join(',')}` : ''}`;
    return `${base}&search=${encodeURIComponent(s)}&download=true`;
  };

  const handleExport = () => {
    const targetPeriode = mode === 'single' ? periode : activePer;
    if (!targetPeriode && mode === 'single') return;
    const url = buildDownloadUrl(targetPeriode, search);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.click();
  };

  const fetchData = useCallback(async (p: number, s: string) => {
    setLoading(true);
    try {
      const res  = await fetch(buildUrl(p, s));
      const data = await res.json();
      const fetchedResults = data.results ?? {};
      setPeriodes(data.periodes ?? []);
      setResults(fetchedResults);

      // Untuk mode single: activePer = periode pertama
      // Untuk mode gabungan: activePer = gabunganKey
      if (mode === 'gabungan') {
        setActivePer(fetchedResults[gabunganKey] ? gabunganKey : Object.keys(fetchedResults)[0] ?? '');
      } else {
        setActivePer((data.periodes ?? [])[0] || '');
      }
    } catch { /**/ }
    setLoading(false);
  }, [buildUrl, mode, dari, sampai, gabunganKey]);

  const handleLoad = () => {
    setPage(1);
    setSearch('');
    setHasLoaded(true);
    setResults({});
    setPeriodes([]);
    setActivePer('');
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

  const jumlahBulan = (() => {
    if (mode !== 'gabungan' || !dari || !sampai) return 0;
    const [dY,dM] = dari.split('-').map(Number);
    const [sY,sM] = sampai.split('-').map(Number);
    return (sY - dY) * 12 + (sM - dM) + 1;
  })();
  const isExceedsMax = jumlahBulan > 12;

  const currentData = mode === 'gabungan'
    ? results[gabunganKey] ?? results[activePer] ?? Object.values(results)[0]
    : results[activePer] ?? Object.values(results)[0];
  const assyCodes   = currentData?.assy_codes   ?? [];
  const prodQtyMap  = currentData?.prod_qty_map ?? {};
  const parts       = currentData?.parts        ?? [];
  const qtyMap      = currentData?.qty_map      ?? {};
  const totalParts  = currentData?.total_parts  ?? 0;
  const totalPages  = Math.ceil(totalParts / LIMIT) || 1;

  // ── Helper: ambil qty BOM per part+assy (per periode di gabungan)
  const findKey = (map: Record<string, unknown>, key: string) => {
    if (key in map) return key;
    const trimmedKey = key.trim();
    return Object.keys(map).find(k => k.trim() === trimmedKey);
  };

  const getBomQty = (part_no: string, assy: string, per?: string): number => {
    const partMap = qtyMap[part_no] as Record<string, unknown> | undefined;
    if (!partMap) return 0;
    const assyKey = findKey(partMap, assy);
    if (!assyKey) return 0;
    const val = partMap[assyKey];
    if (val === undefined || val === null) return 0;
    if (mode === 'gabungan' && per) {
      return Number(((val as Record<string, number>)[per] ?? 0));
    }
    return Number(val as number);
  };

  // ── Helper: ambil prod_qty per assy (per periode di gabungan)
  const getProdQty = (assy: string, per?: string): number => {
    const assyKey = findKey(prodQtyMap, assy);
    if (!assyKey) return 0;
    const val = prodQtyMap[assyKey];
    if (val === undefined || val === null) return 0;
    if (mode === 'gabungan' && per) {
      return Number(((val as Record<string, number>)[per] ?? 0));
    }
    return Number(val as number);
  };

  // ── Total usage: sum(bom_qty × prod_qty) per part, semua assy × semua periode
  const calcTotalUsage = (part_no: string): number => {
    let sum = 0;
    if (mode === 'gabungan') {
      for (const assy of assyCodes) {
        for (const per of periodes) {
          sum += getBomQty(part_no, assy, per) * getProdQty(assy, per);
        }
      }
    } else {
      for (const assy of assyCodes) {
        sum += getBomQty(part_no, assy) * getProdQty(assy);
      }
    }
    return Math.ceil(sum);
  };

  // ── Total BOM qty per kolom (assy×periode di gabungan, assy di single)
  const calcAssyColSum = (assy: string, per?: string): number =>
    parts.reduce((s, p) => s + getBomQty(p.part_no, assy, per), 0);

  // ── Footer: total usage semua part di halaman ini
  const calcFooterTotalUsage = (): number =>
    parts.reduce((s, p) => s + calcTotalUsage(p.part_no), 0);

  const filteredAssy = allAssyCodes.filter(a =>
    !assySearch || a.toLowerCase().includes(assySearch.toLowerCase())
  );

  // ── Apakah ada prod qty yang terisi?
  const hasProdQty = mode === 'gabungan'
    ? Object.values(prodQtyMap).some(v => typeof v === 'object' ? Object.values(v as Record<string,number>).some(q => q > 0) : Number(v) > 0)
    : Object.values(prodQtyMap).some(v => Number(v) > 0);

  const hasProdBomOverlap = mode === 'gabungan'
    ? parts.some(part => assyCodes.some(assy => periodes.some(per => getBomQty(part.part_no, assy, per) > 0 && getProdQty(assy, per) > 0)))
    : parts.some(part => assyCodes.some(assy => getBomQty(part.part_no, assy) > 0 && getProdQty(assy) > 0));

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: font }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
      `}</style>

      {/* Navbar */}
      <nav style={{ background: '#fff', borderBottom: '1px solid #e8eaed', padding: '0 40px', display: 'flex', alignItems: 'center', height: 58, boxShadow: '0 1px 0 #e8eaed, 0 2px 8px rgba(0,0,0,.04)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, boxShadow: '0 2px 10px rgba(37,99,235,.28)', flexShrink: 0 }}>📊</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', letterSpacing: -0.3 }}>BOM Database</div>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>Master Data System</div>
          </div>
        </div>
        <div style={{ width: 1, height: 28, background: '#e8eaed', margin: '0 20px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
          <button onClick={() => router.back?.()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#64748b', fontWeight: 500, fontFamily: font, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 6, transition: 'background .15s, color .15s' }}
            onMouseOver={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#0f172a'; }}
            onMouseOut={e  => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#64748b'; }}
          >
            <span style={{ fontSize: 14 }}>←</span> Home
          </button>
          <span style={{ color: '#cbd5e1' }}>/</span>
          <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>Report</span>
        </div>
      </nav>

      <main style={{ padding: '32px 40px', maxWidth: 1600, margin: '0 auto', animation: 'fadeUp .3s ease' }}>
        {/* Page title */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: -0.5 }}>Report</h1>
          <p style={{ fontSize: 13.5, color: '#64748b', marginTop: 4 }}>Kalkulasi kebutuhan part berdasarkan BOM × Prod Qty</p>
        </div>

        {/* Filter card */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8eaed', padding: '24px 28px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⚙️</div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', letterSpacing: -0.1 }}>Konfigurasi Report</p>
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: '#f8fafc', borderRadius: 10, padding: 4, width: 'fit-content', border: '1px solid #e2e8f0' }}>
            {(['single','gabungan'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setHasLoaded(false); }} style={{
                padding: '7px 20px', borderRadius: 8, border: 'none',
                background: mode === m ? '#fff' : 'transparent',
                color: mode === m ? '#1d4ed8' : '#64748b',
                fontWeight: mode === m ? 700 : 500,
                fontSize: 13, cursor: 'pointer', fontFamily: font,
                boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
                transition: 'all .15s',
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
                    <select value={item.val} onChange={e => item.set(e.target.value)} style={{ padding: '7px 12px', borderRadius: 8, border: `1.5px solid ${isExceedsMax ? '#ef4444' : '#e2e8f0'}`, fontSize: 13, fontFamily: font, background: '#fff', cursor: 'pointer' }}>
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

            <button onClick={handleLoad} disabled={mode === 'gabungan' && isExceedsMax} style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: mode === 'gabungan' && isExceedsMax ? '#d1d5db' : 'linear-gradient(135deg,#1e3a8a,#2563eb)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: mode === 'gabungan' && isExceedsMax ? 'not-allowed' : 'pointer', fontFamily: font, boxShadow: mode === 'gabungan' && isExceedsMax ? 'none' : '0 3px 10px rgba(37,99,235,.3)', letterSpacing: 0.1 }}>
              🔍 Tampilkan
            </button>
            {mode === 'gabungan' && isExceedsMax && (
              <div style={{ marginLeft: 0, padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 13, color: '#991b1b', fontWeight: 500 }}>
                ⚠️ Maksimal 12 bulan. Anda memilih {jumlahBulan} bulan.
              </div>
            )}
          </div>
        </div>

        {/* Periode tabs (mode single hanya, jika multi-periode) */}
        {hasLoaded && mode === 'single' && periodes.length > 1 && (
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
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8eaed', padding: '80px 0', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ fontSize: 52, marginBottom: 16, filter: 'grayscale(.2)' }}>📊</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#475569', marginBottom: 8, letterSpacing: -0.2 }}>Pilih periode lalu klik Tampilkan</div>
            <div style={{ fontSize: 13, color: '#94a3b8', fontFamily: 'monospace', background: '#f8fafc', display: 'inline-block', padding: '4px 14px', borderRadius: 6, border: '1px solid #e2e8f0' }}>ROUNDUP(SUMPRODUCT(prod_qty × qty_per_unit), 0)</div>
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
              <button onClick={handleExport} disabled={loading} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: !loading ? '#10b981' : '#d1d5db', color: '#fff', fontSize: 13, fontWeight: 700, cursor: !loading ? 'pointer' : 'not-allowed', fontFamily: font, whiteSpace: 'nowrap' }}>
                ⬇️ Ekspor
              </button>
              <span style={{ fontSize: 12.5, color: '#6b7280' }}>
                <b style={{ color: '#111827' }}>{totalParts.toLocaleString()}</b> part ·
                <b style={{ color: '#111827' }}> {assyCodes.length}</b> ASSY ·
                Periode: <b style={{ color: '#1d4ed8' }}>
                  {mode === 'gabungan'
                    ? `${periodes.map(p => fmtPeriode(p)).join(' · ')} (${periodes.length} bulan)`
                    : fmtPeriode(activePer)}
                </b>
              </span>
              {!hasProdQty && (
                <span style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 600 }}>
                  ⚠ Prod Qty belum diisi Finance
                </span>
              )}
              {mode === 'gabungan' && hasLoaded && !loading && !hasProdBomOverlap && (
                <span style={{ background: '#fef2f2', color: '#991b1b', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 600 }}>
                  ⚠ Tidak ada overlap PROD QTY × BOM untuk periode yang dipilih. Cek data prod_plan dan bom_detail.
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
                    {mode === 'gabungan' ? (
                      assyCodes.map(a => (
                        <th key={a} colSpan={periodes.length} style={{ padding: '6px 8px', color: '#93c5fd', fontWeight: 600, fontSize: 9.5, textAlign: 'center', borderRight: '1px solid #334155' }} title={a}>
                          {a}
                        </th>
                      ))
                    ) : (
                      assyCodes.map(a => (
                        <th key={a} style={{ padding: '6px 8px', color: '#93c5fd', fontWeight: 600, fontSize: 9.5, textAlign: 'center', borderRight: '1px solid #334155', minWidth: 100 }} title={a}>
                          {a}
                        </th>
                      ))
                    )}
                    <th style={{ padding: '9px 10px', color: '#fbbf24', fontWeight: 700, fontSize: 10, textAlign: 'right', borderLeft: '2px solid #f59e0b', minWidth: 72, background: '#1c2d1e', position: 'sticky', right: 90 }}>TOTAL</th>
                    <th style={{ padding: '9px 10px', color: '#4ade80', fontWeight: 700, fontSize: 10, textAlign: 'right', borderLeft: '2px solid #16a34a', minWidth: 90, background: '#1c2d1e', position: 'sticky', right: 0 }}>TOTAL USAGE</th>
                  </tr>

                  {/* Row 2: sub-header periode (mode gabungan only) */}
                  {mode === 'gabungan' && periodes.length > 0 && (
                    <tr style={{ background: '#1a2f3f' }}>
                      <td style={{ background: '#1a2f3f', borderRight: '1px solid #334155' }} />
                      <td style={{ background: '#1a2f3f', borderRight: '1px solid #334155' }} />
                      <td style={{ background: '#1a2f3f', borderRight: '1px solid #334155' }} />
                      <td style={{ background: '#1a2f3f', borderRight: '1px solid #334155' }} />
                      <td style={{ background: '#1a2f3f', borderRight: '2px solid #475569' }} />
                      {assyCodes.flatMap(a =>
                        periodes.map(p => {
                          const [y, m] = p.split('-').map(Number);
                          const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1];
                          return (
                            <td key={`${a}-${p}`} style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 500, fontSize: 9, color: '#94a3b8', borderRight: '1px solid #334155', background: '#1a2f3f', minWidth: 60 }}>
                              {month} {y}
                            </td>
                          );
                        })
                      )}
                      <td style={{ borderLeft: '2px solid #f59e0b', background: '#1a2f3f', position: 'sticky', right: 90 }} />
                      <td style={{ borderLeft: '2px solid #16a34a', background: '#1a2f3f', position: 'sticky', right: 0 }} />
                    </tr>
                  )}

                  {/* Row 3: Prod Qty */}
                  <tr style={{ background: '#0f172a' }}>
                    <td style={{ padding: '6px 12px', color: '#f59e0b', fontWeight: 700, fontSize: 10.5, position: 'sticky', left: 0, background: '#0f172a', zIndex: 11, borderRight: '1px solid #1e293b' }}>PROD QTY →</td>
                    <td style={{ background: '#0f172a', borderRight: '1px solid #1e293b' }} />
                    <td style={{ background: '#0f172a', borderRight: '1px solid #1e293b' }} />
                    <td style={{ background: '#0f172a', borderRight: '1px solid #1e293b' }} />
                    <td style={{ background: '#0f172a', borderRight: '2px solid #475569' }} />
                    {mode === 'gabungan' ? (
                      assyCodes.flatMap(a =>
                        periodes.map(p => {
                          const qty = getProdQty(a, p);
                          return (
                            <td key={`${a}-${p}`} style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: qty > 0 ? '#fbbf24' : '#475569', borderRight: '1px solid #1e293b' }}>
                              {qty > 0 ? qty.toLocaleString() : '—'}
                            </td>
                          );
                        })
                      )
                    ) : (
                      assyCodes.map(a => {
                        const qty = getProdQty(a);
                        return (
                          <td key={a} style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: qty > 0 ? '#fbbf24' : '#475569', borderRight: '1px solid #1e293b' }}>
                            {qty > 0 ? qty.toLocaleString() : '—'}
                          </td>
                        );
                      })
                    )}
                    <td style={{ borderLeft: '2px solid #f59e0b', background: '#0f172a', position: 'sticky', right: 90 }} />
                    <td style={{ borderLeft: '2px solid #16a34a', background: '#0f172a', position: 'sticky', right: 0 }} />
                  </tr>
                </thead>

                <tbody>
                  {parts.map((part, i) => {
                    const totalUsage = calcTotalUsage(part.part_no);
                    // Total BOM qty: sum semua kolom (assy × periode di gabungan)
                    const totalQty = mode === 'gabungan'
                      ? assyCodes.reduce((s, a) => s + periodes.reduce((ps, p) => ps + getBomQty(part.part_no, a, p), 0), 0)
                      : assyCodes.reduce((s, a) => s + getBomQty(part.part_no, a), 0);

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
                        {mode === 'gabungan' ? (
                          assyCodes.flatMap(a =>
                            periodes.map(p => {
                              const qty = getBomQty(part.part_no, a, p);
                              return (
                                <td key={`${a}-${p}`} style={{ padding: '7px 8px', textAlign: 'center', color: qty ? '#111827' : '#e5e7eb', fontWeight: qty ? 600 : 400, borderRight: '1px solid #f1f5f9', fontSize: 11 }}>
                                  {qty ? Number(qty).toLocaleString() : '·'}
                                </td>
                              );
                            })
                          )
                        ) : (
                          assyCodes.map(a => {
                            const qty = getBomQty(part.part_no, a);
                            return (
                              <td key={a} style={{ padding: '7px 8px', textAlign: 'center', color: qty ? '#111827' : '#e5e7eb', fontWeight: qty ? 600 : 400, borderRight: '1px solid #f1f5f9', fontSize: 11 }}>
                                {qty ? Number(qty).toLocaleString() : '·'}
                              </td>
                            );
                          })
                        )}
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
                    {mode === 'gabungan' ? (
                      assyCodes.flatMap(a =>
                        periodes.map(p => (
                          <td key={`${a}-${p}`} style={{ padding: '8px 8px', textAlign: 'center', color: '#fbbf24', fontWeight: 700, fontSize: 11, borderRight: '1px solid #334155' }}>
                            {calcAssyColSum(a, p).toLocaleString()}
                          </td>
                        ))
                      )
                    ) : (
                      assyCodes.map(a => (
                        <td key={a} style={{ padding: '8px 8px', textAlign: 'center', color: '#fbbf24', fontWeight: 700, fontSize: 11, borderRight: '1px solid #334155' }}>
                          {calcAssyColSum(a).toLocaleString()}
                        </td>
                      ))
                    )}
                    <td style={{ borderLeft: '2px solid #f59e0b', background: '#1e3a5f', position: 'sticky', right: 90 }} />
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#4ade80', fontWeight: 700, fontSize: 11, borderLeft: '2px solid #16a34a', background: '#1e3a5f', position: 'sticky', right: 0 }}>
                      {calcFooterTotalUsage().toLocaleString()}
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