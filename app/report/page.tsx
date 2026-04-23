'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useVirtualizer } from '@tanstack/react-virtual';

const font = "'DM Sans', system-ui, sans-serif";
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function fmtPeriode(p: string) {
  const [y, m] = p.split('-');
  return `${MONTHS[Number(m)-1]} ${y}`;
}
function fmtPeriodeShort(p: string) {
  const [y, m] = p.split('-');
  return `${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][Number(m)-1]} ${y}`;
}

interface Part { part_no: string; part_no_as400: string; part_name: string; unit: string; supplier_name: string; }

interface PeriodeData {
  assy_codes:   string[];
  prod_qty_map: Record<string, number | Record<string, number>>;
  parts:        Part[];
  qty_map:      Record<string, Record<string, number | Record<string, number>>>;
  total_parts:  number;
  page:         number;
  limit:        number;
}

// ── Pre-computed row ────────────────────────────────────────────
// Semua kalkulasi dilakukan sekali saat data tiba, bukan saat render
interface ComputedRow {
  part:       Part;
  cells:      (number | null)[];  // flat array, index = colIndex
  totalQty:   number;
  totalUsage: number;
}

interface ColDef {
  assy:    string;
  periode: string | null; // null = single mode
  label:   string;
  prodQty: number;
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
      background:  active ? '#1d4ed8' : '#fff',
      color:       active ? '#fff'    : disabled ? '#d1d5db' : '#374151',
      fontWeight: 600, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: font,
    }}>{children}</button>
  );
}

// ── Virtual Report Table ────────────────────────────────────────
// Render hanya kolom yang visible — krusial untuk 500 ASSY × 12 periode
function VirtualReportTable({
  rows, cols, mode, periodes,
  footerColSums, footerTotalUsage,
}: {
  rows:             ComputedRow[];
  cols:             ColDef[];
  mode:             'single' | 'gabungan';
  periodes:         string[];
  footerColSums:    number[];
  footerTotalUsage: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fixed columns: Part No, AS400, Supplier, Part Name, Unit = 5 cols
  // lebar masing-masing:
  const FW = [130, 110, 110, 160, 55];
  const fixedTotalW = FW.reduce((a, b) => a + b, 0);
  const STICKY_RIGHT_TOTAL = 72;
  const STICKY_RIGHT_USAGE = 90;
  const COL_W   = mode === 'gabungan' ? 62 : 90;
  const ROW_H   = 34;
  const HEAD1_H = 32;
  const HEAD2_H = mode === 'gabungan' ? 24 : 0;
  const HEAD3_H = 28; // prod qty row
  const TOTAL_HEAD_H = HEAD1_H + HEAD2_H + HEAD3_H;

  // Virtual columns
  const colVirt = useVirtualizer({
    horizontal:       true,
    count:            cols.length,
    getScrollElement: () => scrollRef.current,
    estimateSize:     () => COL_W,
    overscan:         8,
  });

  // Virtual rows
  const rowVirt = useVirtualizer({
    count:            rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize:     () => ROW_H,
    overscan:         12,
  });

  const dynW = colVirt.getTotalSize();

  return (
    <div ref={scrollRef} style={{ overflow: 'auto', maxHeight: 'calc(100vh - 340px)', position: 'relative', fontSize: 11.5, whiteSpace: 'nowrap' }}>

      {/* ── STICKY HEADER ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', flexDirection: 'column', width: fixedTotalW + dynW + STICKY_RIGHT_TOTAL + STICKY_RIGHT_USAGE, minWidth: '100%' }}>

        {/* Row 1: Column labels */}
        <div style={{ display: 'flex', background: '#1e3a5f', height: HEAD1_H }}>
          {/* Fixed headers */}
          {(['PART NO','PART NO AS400','SUPPLIER','PART NAME','UNIT'] as const).map((label, i) => (
            <div key={label} style={{
              width: FW[i], flexShrink: 0, padding: '0 10px',
              display: 'flex', alignItems: 'center',
              color: '#cbd5e1', fontWeight: 600, fontSize: 10,
              borderRight: i === 4 ? '2px solid #475569' : '1px solid #334155',
              position: 'sticky', left: FW.slice(0,i).reduce((a,b)=>a+b,0), background: '#1e3a5f', zIndex: 21,
            }}>{label}</div>
          ))}
          {/* Dynamic ASSY headers */}
          <div style={{ position: 'relative', width: dynW, flexShrink: 0, height: HEAD1_H }}>
            {colVirt.getVirtualItems().map(vcol => {
              const col = cols[vcol.index];
              // Untuk gabungan: render label assy hanya di kolom pertama per assy
              const isFirstOfAssy = mode !== 'gabungan' || vcol.index === 0 ||
                cols[vcol.index - 1].assy !== col.assy;
              const assySpanCount = mode === 'gabungan'
                ? periodes.length : 1;
              return (
                <div key={vcol.key} style={{
                  position: 'absolute', left: vcol.start, width: mode === 'gabungan' && isFirstOfAssy ? COL_W * assySpanCount : vcol.size,
                  height: HEAD1_H,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#93c5fd', fontWeight: 600, fontSize: 9.5,
                  borderRight: '1px solid #334155',
                  overflow: 'hidden',
                  pointerEvents: isFirstOfAssy ? 'auto' : 'none',
                  opacity: isFirstOfAssy ? 1 : 0,
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 4px', maxWidth: '100%' }} title={col.assy}>
                    {col.assy}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Sticky right: Total, Total Usage */}
          <div style={{ width: STICKY_RIGHT_TOTAL, flexShrink: 0, padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', color: '#fbbf24', fontWeight: 700, fontSize: 10, borderLeft: '2px solid #f59e0b', background: '#1c2d1e', position: 'sticky', right: STICKY_RIGHT_USAGE }}>TOTAL</div>
          <div style={{ width: STICKY_RIGHT_USAGE, flexShrink: 0, padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', color: '#4ade80', fontWeight: 700, fontSize: 10, borderLeft: '2px solid #16a34a', background: '#1c2d1e', position: 'sticky', right: 0 }}>TOTAL USAGE</div>
        </div>

        {/* Row 2: Sub-header periode (gabungan only) */}
        {mode === 'gabungan' && HEAD2_H > 0 && (
          <div style={{ display: 'flex', background: '#1a2f3f', height: HEAD2_H }}>
            {FW.map((w, i) => (
              <div key={i} style={{ width: w, flexShrink: 0, borderRight: i === 4 ? '2px solid #475569' : '1px solid #334155', position: 'sticky', left: FW.slice(0,i).reduce((a,b)=>a+b,0), background: '#1a2f3f', zIndex: 21 }} />
            ))}
            <div style={{ position: 'relative', width: dynW, flexShrink: 0, height: HEAD2_H }}>
              {colVirt.getVirtualItems().map(vcol => {
                const col = cols[vcol.index];
                return (
                  <div key={vcol.key} style={{
                    position: 'absolute', left: vcol.start, width: vcol.size, height: HEAD2_H,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#94a3b8', fontSize: 9, fontWeight: 500,
                    borderRight: '1px solid #334155', background: '#1a2f3f',
                  }}>
                    {col.periode ? fmtPeriodeShort(col.periode) : ''}
                  </div>
                );
              })}
            </div>
            <div style={{ width: STICKY_RIGHT_TOTAL, flexShrink: 0, borderLeft: '2px solid #f59e0b', background: '#1a2f3f', position: 'sticky', right: STICKY_RIGHT_USAGE }} />
            <div style={{ width: STICKY_RIGHT_USAGE, flexShrink: 0, borderLeft: '2px solid #16a34a', background: '#1a2f3f', position: 'sticky', right: 0 }} />
          </div>
        )}

        {/* Row 3: Prod Qty */}
        <div style={{ display: 'flex', background: '#0f172a', height: HEAD3_H }}>
          <div style={{ width: FW[0], flexShrink: 0, padding: '0 10px', display: 'flex', alignItems: 'center', color: '#f59e0b', fontWeight: 700, fontSize: 10.5, borderRight: '1px solid #1e293b', position: 'sticky', left: 0, background: '#0f172a', zIndex: 21 }}>PROD QTY →</div>
          {FW.slice(1).map((w, i) => (
            <div key={i} style={{ width: w, flexShrink: 0, borderRight: i === 3 ? '2px solid #475569' : '1px solid #1e293b', position: i === 0 ? 'sticky' : 'relative', left: i === 0 ? FW[0] : undefined, background: '#0f172a', zIndex: i === 0 ? 21 : undefined }} />
          ))}
          <div style={{ position: 'relative', width: dynW, flexShrink: 0, height: HEAD3_H }}>
            {colVirt.getVirtualItems().map(vcol => {
              const col = cols[vcol.index];
              return (
                <div key={vcol.key} style={{
                  position: 'absolute', left: vcol.start, width: vcol.size, height: HEAD3_H,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: col.prodQty > 0 ? '#fbbf24' : '#475569',
                  fontWeight: 700, fontSize: 11,
                  borderRight: '1px solid #1e293b',
                }}>
                  {col.prodQty > 0 ? col.prodQty.toLocaleString() : '—'}
                </div>
              );
            })}
          </div>
          <div style={{ width: STICKY_RIGHT_TOTAL, flexShrink: 0, borderLeft: '2px solid #f59e0b', background: '#0f172a', position: 'sticky', right: STICKY_RIGHT_USAGE }} />
          <div style={{ width: STICKY_RIGHT_USAGE, flexShrink: 0, borderLeft: '2px solid #16a34a', background: '#0f172a', position: 'sticky', right: 0 }} />
        </div>
      </div>

      {/* ── VIRTUAL ROWS ── */}
      <div style={{ position: 'relative', height: rowVirt.getTotalSize(), width: fixedTotalW + dynW + STICKY_RIGHT_TOTAL + STICKY_RIGHT_USAGE, minWidth: '100%' }}>
        {rowVirt.getVirtualItems().map(vrow => {
          const { part, cells, totalQty, totalUsage } = rows[vrow.index];
          const isEven = vrow.index % 2 === 0;
          const rowBg  = isEven ? '#fff' : '#f8fafc';
          const fixedBg = rowBg;

          return (
            <div key={vrow.key} style={{
              position: 'absolute', top: vrow.start, height: ROW_H, width: '100%',
              display: 'flex', alignItems: 'center',
              borderBottom: '1px solid #f1f5f9', background: rowBg,
            }}
              onMouseOver={e => (e.currentTarget.style.background = '#eff6ff')}
              onMouseOut={e =>  (e.currentTarget.style.background = rowBg)}
            >
              {/* Fixed cells */}
              <div style={{ width: FW[0], flexShrink: 0, padding: '0 10px', fontFamily: 'monospace', fontSize: 11, color: '#1d4ed8', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', position: 'sticky', left: 0, background: fixedBg, zIndex: 2, borderRight: '1px solid #e2e8f0', height: ROW_H, display: 'flex', alignItems: 'center' }}>{part.part_no}</div>
              <div style={{ width: FW[1], flexShrink: 0, padding: '0 10px', fontFamily: 'monospace', fontSize: 10.5, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', borderRight: '1px solid #f1f5f9', height: ROW_H, display: 'flex', alignItems: 'center' }}>{part.part_no_as400 || '—'}</div>
              <div style={{ width: FW[2], flexShrink: 0, padding: '0 10px', fontSize: 11, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', borderRight: '1px solid #f1f5f9', height: ROW_H, display: 'flex', alignItems: 'center' }}>{part.supplier_name || '—'}</div>
              <div style={{ width: FW[3], flexShrink: 0, padding: '0 10px', fontSize: 11, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', borderRight: '1px solid #f1f5f9', height: ROW_H, display: 'flex', alignItems: 'center' }}>{part.part_name || '—'}</div>
              <div style={{ width: FW[4], flexShrink: 0, padding: '0 6px', textAlign: 'center', borderRight: '2px solid #e2e8f0', height: ROW_H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 700 }}>{part.unit || '—'}</span>
              </div>

              {/* Virtual dynamic cells */}
              <div style={{ position: 'relative', width: dynW, flexShrink: 0, height: ROW_H }}>
                {colVirt.getVirtualItems().map(vcol => {
                  const qty = cells[vcol.index];
                  return (
                    <div key={vcol.key} style={{
                      position: 'absolute', left: vcol.start, width: vcol.size, height: ROW_H,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color:      qty ? '#111827' : '#e5e7eb',
                      fontWeight: qty ? 600 : 400,
                      borderRight: '1px solid #f1f5f9', fontSize: 11,
                    }}>
                      {qty != null && qty > 0 ? Number(qty).toLocaleString() : '·'}
                    </div>
                  );
                })}
              </div>

              {/* Sticky right: Total, Total Usage */}
              <div style={{ width: STICKY_RIGHT_TOTAL, flexShrink: 0, padding: '0 8px', textAlign: 'right', fontWeight: 700, color: '#92400e', borderLeft: '2px solid #fde68a', background: isEven ? '#fffbeb' : '#fef9c3', fontSize: 11, position: 'sticky', right: STICKY_RIGHT_USAGE, height: ROW_H, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                {totalQty > 0 ? totalQty.toLocaleString() : '—'}
              </div>
              <div style={{ width: STICKY_RIGHT_USAGE, flexShrink: 0, padding: '0 8px', textAlign: 'right', fontWeight: 700, color: totalUsage > 0 ? '#15803d' : '#9ca3af', borderLeft: '2px solid #bbf7d0', background: isEven ? '#f0fdf4' : '#dcfce7', fontSize: 11, position: 'sticky', right: 0, height: ROW_H, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                {totalUsage > 0 ? totalUsage.toLocaleString() : '—'}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── FOOTER ── */}
      <div style={{
        position: 'sticky', bottom: 0, zIndex: 20,
        display: 'flex', background: '#1e3a5f', height: ROW_H,
        width: fixedTotalW + dynW + STICKY_RIGHT_TOTAL + STICKY_RIGHT_USAGE, minWidth: '100%',
      }}>
        <div style={{ width: FW[0], flexShrink: 0, padding: '0 10px', display: 'flex', alignItems: 'center', color: '#fbbf24', fontWeight: 700, fontSize: 10.5, borderRight: '1px solid #334155', position: 'sticky', left: 0, background: '#1e3a5f', zIndex: 21 }}>∑ TOTAL PER ASSY</div>
        {FW.slice(1).map((w, i) => (
          <div key={i} style={{ width: w, flexShrink: 0, borderRight: i === 3 ? '2px solid #475569' : '1px solid #334155', background: '#1e3a5f' }} />
        ))}
        <div style={{ position: 'relative', width: dynW, flexShrink: 0, height: ROW_H }}>
          {colVirt.getVirtualItems().map(vcol => (
            <div key={vcol.key} style={{
              position: 'absolute', left: vcol.start, width: vcol.size, height: ROW_H,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fbbf24', fontWeight: 700, fontSize: 11,
              borderRight: '1px solid #334155',
            }}>
              {footerColSums[vcol.index] > 0 ? footerColSums[vcol.index].toLocaleString() : '—'}
            </div>
          ))}
        </div>
        <div style={{ width: STICKY_RIGHT_TOTAL, flexShrink: 0, borderLeft: '2px solid #f59e0b', background: '#1e3a5f', position: 'sticky', right: STICKY_RIGHT_USAGE }} />
        <div style={{ width: STICKY_RIGHT_USAGE, flexShrink: 0, padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', color: '#4ade80', fontWeight: 700, fontSize: 11, borderLeft: '2px solid #16a34a', background: '#1e3a5f', position: 'sticky', right: 0 }}>
          {footerTotalUsage > 0 ? footerTotalUsage.toLocaleString() : '—'}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════
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

  const [allAssyCodes,   setAllAssyCodes]   = useState<string[]>([]);
  const [selectedAssy,   setSelectedAssy]   = useState<Set<string>>(new Set());
  const [assySearch,     setAssySearch]     = useState('');
  const [showAssyPicker, setShowAssyPicker] = useState(false);

  const gabunganKey = `${dari}_${sampai}`;

  useEffect(() => {
    fetch('/api/bom').then(r => r.json()).then((data: { periode: string }[]) => {
      const ps = data.map(d => d.periode).sort().reverse();
      setAvailPer(ps);
      if (ps.length > 0) { setPeriode(ps[0]); setDari(ps[ps.length-1]); setSampai(ps[0]); }
    });
  }, []);

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
      setResults(data.results  ?? {});
      if (mode === 'gabungan') {
        const key = data.results?.[gabunganKey] ? gabunganKey : Object.keys(data.results ?? {})[0] ?? '';
        setActivePer(key);
      } else {
        setActivePer((data.periodes ?? [])[0] || '');
      }
    } catch { /**/ }
    setLoading(false);
  }, [buildUrl, mode, gabunganKey]);

  const handleLoad = () => {
    setPage(1); setSearch(''); setHasLoaded(true); setResults({}); setPeriodes([]); setActivePer('');
    fetchData(1, '');
  };

  const handlePageChange = (newPage: number) => { setPage(newPage); fetchData(newPage, search); };
  const handleSearch = (val: string) => { setSearch(val); setPage(1); fetchData(1, val); };

  const jumlahBulan = (() => {
    if (mode !== 'gabungan' || !dari || !sampai) return 0;
    const [dY,dM] = dari.split('-').map(Number);
    const [sY,sM] = sampai.split('-').map(Number);
    return (sY - dY) * 12 + (sM - dM) + 1;
  })();
  const isExceedsMax = jumlahBulan > 12;

  const currentData = mode === 'gabungan'
    ? results[gabunganKey] ?? results[activePer] ?? Object.values(results)[0]
    : results[activePer]   ?? Object.values(results)[0];

  const assyCodes  = currentData?.assy_codes   ?? [];
  const prodQtyMap = currentData?.prod_qty_map ?? {};
  const parts      = currentData?.parts        ?? [];
  const qtyMap     = currentData?.qty_map      ?? {};
  const totalParts = currentData?.total_parts  ?? 0;
  const totalPages = Math.ceil(totalParts / LIMIT) || 1;

  // ── PRE-KALKULASI — dilakukan sekali saat data berubah ──────
  // Ini yang menggantikan getBomQty/getProdQty/calcTotalUsage/calcAssyColSum
  // yang sebelumnya dipanggil berulang kali saat render

  const { cols, computedRows, footerColSums, footerTotalUsage, hasProdQty } = useMemo(() => {
    if (!currentData || parts.length === 0) {
      return { cols: [], computedRows: [], footerColSums: [], footerTotalUsage: 0, hasProdQty: false };
    }

    // 1. Build column definitions dengan prodQty sudah tersimpan
    const cols: ColDef[] = [];
    if (mode === 'gabungan') {
      for (const assy of assyCodes) {
        for (const per of periodes) {
          const prodVal = prodQtyMap[assy];
          const prodQty = prodVal && typeof prodVal === 'object'
            ? Number((prodVal as Record<string,number>)[per] ?? 0)
            : 0;
          cols.push({ assy, periode: per, label: `${assy}|${per}`, prodQty });
        }
      }
    } else {
      for (const assy of assyCodes) {
        const prodQty = Number((prodQtyMap[assy] as number) ?? 0);
        cols.push({ assy, periode: null, label: assy, prodQty });
      }
    }

    // 2. Build flat lookup: "part_no|assy|periode" → qty
    //    O(n) sekali, bukan O(n) per render
    const lookup = new Map<string, number>();
    for (const [partNo, assyMap] of Object.entries(qtyMap)) {
      for (const [assy, val] of Object.entries(assyMap as Record<string, unknown>)) {
        if (mode === 'gabungan' && typeof val === 'object' && val !== null) {
          for (const [per, qty] of Object.entries(val as Record<string, number>)) {
            lookup.set(`${partNo}|${assy}|${per}`, Number(qty));
          }
        } else {
          lookup.set(`${partNo}|${assy}`, Number(val));
        }
      }
    }

    // 3. Pre-compute setiap baris
    const footerColSums = new Array(cols.length).fill(0);
    let   footerTotalUsage = 0;
    let   hasProdQty = false;

    const computedRows: ComputedRow[] = parts.map(part => {
      const cells: (number | null)[] = new Array(cols.length).fill(null);
      let totalQty   = 0;
      let totalUsage = 0;

      for (let ci = 0; ci < cols.length; ci++) {
        const col = cols[ci];
        const key = mode === 'gabungan'
          ? `${part.part_no}|${col.assy}|${col.periode}`
          : `${part.part_no}|${col.assy}`;
        const qty = lookup.get(key) ?? 0;

        if (qty > 0) {
          cells[ci] = qty;
          totalQty += qty;
          const usage = qty * col.prodQty;
          totalUsage += usage;
          footerColSums[ci] += qty;
          if (col.prodQty > 0) hasProdQty = true;
        }
      }

      const roundedUsage = Math.ceil(totalUsage);
      footerTotalUsage += roundedUsage;

      return { part, cells, totalQty, totalUsage: roundedUsage };
    });

    return { cols, computedRows, footerColSums, footerTotalUsage, hasProdQty };
  }, [currentData, parts, assyCodes, periodes, qtyMap, prodQtyMap, mode]);

  const filteredAssy = allAssyCodes.filter(a =>
    !assySearch || a.toLowerCase().includes(assySearch.toLowerCase())
  );

  const buildDownloadUrl = (s: string) => {
    if (mode === 'gabungan') {
      return `/api/report?dari=${dari}&sampai=${sampai}${selectedAssy.size > 0 ? `&assy_codes=${[...selectedAssy].join(',')}` : ''}&search=${encodeURIComponent(s)}&download=true`;
    }
    return `/api/report?periode=${encodeURIComponent(periode)}${selectedAssy.size > 0 ? `&assy_codes=${[...selectedAssy].join(',')}` : ''}&search=${encodeURIComponent(s)}&download=true`;
  };

  const handleExport = () => {
    const anchor = document.createElement('a');
    anchor.href  = buildDownloadUrl(search);
    anchor.click();
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: font }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes fadeUp  { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
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
          <button onClick={() => router.back?.()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#64748b', fontWeight: 500, fontFamily: font, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 6 }}
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
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: -0.5 }}>Report</h1>
          <p style={{ fontSize: 13.5, color: '#64748b', marginTop: 4 }}>Kalkulasi kebutuhan part berdasarkan BOM × Prod Qty</p>
        </div>

        {/* Filter card */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8eaed', padding: '24px 28px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⚙️</div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Konfigurasi Report</p>
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: '#f8fafc', borderRadius: 10, padding: 4, width: 'fit-content', border: '1px solid #e2e8f0' }}>
            {(['single','gabungan'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setHasLoaded(false); }} style={{
                padding: '7px 20px', borderRadius: 8, border: 'none',
                background: mode === m ? '#fff' : 'transparent',
                color:      mode === m ? '#1d4ed8' : '#64748b',
                fontWeight: mode === m ? 700 : 500,
                fontSize: 13, cursor: 'pointer', fontFamily: font,
                boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
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

            <button onClick={handleLoad} disabled={mode === 'gabungan' && isExceedsMax} style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: mode === 'gabungan' && isExceedsMax ? '#d1d5db' : 'linear-gradient(135deg,#1e3a8a,#2563eb)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: mode === 'gabungan' && isExceedsMax ? 'not-allowed' : 'pointer', fontFamily: font, boxShadow: mode === 'gabungan' && isExceedsMax ? 'none' : '0 3px 10px rgba(37,99,235,.3)' }}>
              🔍 Tampilkan
            </button>
            {mode === 'gabungan' && isExceedsMax && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 13, color: '#991b1b', fontWeight: 500 }}>
                ⚠️ Maksimal 12 bulan. Anda memilih {jumlahBulan} bulan.
              </div>
            )}
          </div>
        </div>

        {/* Periode tabs (mode single) */}
        {hasLoaded && mode === 'single' && periodes.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
            {periodes.map(p => (
              <button key={p} onClick={() => { setActivePer(p); setPage(1); }} style={{
                padding: '7px 18px', borderRadius: 8, border: '1.5px solid',
                borderColor: activePer === p ? '#1d4ed8' : '#e2e8f0',
                background:  activePer === p ? '#1d4ed8' : '#fff',
                color:       activePer === p ? '#fff' : '#6b7280',
                fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: font, whiteSpace: 'nowrap',
              }}>{fmtPeriode(p)}</button>
            ))}
          </div>
        )}

        {/* Content */}
        {!hasLoaded ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8eaed', padding: '80px 0', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>📊</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#475569', marginBottom: 8 }}>Pilih periode lalu klik Tampilkan</div>
            <div style={{ fontSize: 13, color: '#94a3b8', fontFamily: 'monospace', background: '#f8fafc', display: 'inline-block', padding: '4px 14px', borderRadius: 6, border: '1px solid #e2e8f0' }}>ROUNDUP(SUMPRODUCT(prod_qty × qty_per_unit), 0)</div>
          </div>
        ) : loading ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8eaed' }}><LoadingBox /></div>
        ) : !currentData ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8eaed', padding: '40px 0', textAlign: 'center', color: '#9ca3af' }}>Tidak ada data</div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8eaed', overflow: 'hidden' }}>
            {/* Toolbar */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 13 }}>🔍</span>
                <input value={search} onChange={e => handleSearch(e.target.value)} placeholder="Cari part no / part name..."
                  style={{ padding: '7px 12px 7px 32px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: font, outline: 'none', width: 260 }}
                  onFocus={e => e.target.style.borderColor = '#3b82f6'}
                  onBlur={e =>  e.target.style.borderColor = '#e2e8f0'}
                />
              </div>
              <button onClick={handleExport} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: font }}>
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
            </div>

            {/* Virtual Table */}
            <VirtualReportTable
              rows={computedRows}
              cols={cols}
              mode={mode}
              periodes={periodes}
              footerColSums={footerColSums}
              footerTotalUsage={footerTotalUsage}
            />

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ padding: '14px 20px', borderTop: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <span style={{ fontSize: 12.5, color: '#6b7280' }}>
                  Menampilkan {((page-1)*LIMIT)+1}–{Math.min(page*LIMIT, totalParts)} dari {totalParts.toLocaleString()} part
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <PageBtn disabled={page===1}          onClick={() => handlePageChange(1)}>«</PageBtn>
                  <PageBtn disabled={page===1}          onClick={() => handlePageChange(page-1)}>‹</PageBtn>
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
