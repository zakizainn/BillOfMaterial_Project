'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// Install: npm install @tanstack/react-virtual
import { useVirtualizer } from '@tanstack/react-virtual';

const font = "'DM Sans', system-ui, sans-serif";
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function fmtPeriode(p: string) {
  const [y, m] = p.split('-');
  return `${MONTHS[Number(m)-1].slice(0,3)} ${y}`;
}

// ── Types ──────────────────────────────────────────────────────
interface ListRow    { part_no: string; assy_code: string; part_name: string; unit: string; supplier_name: string; }
interface PivotPart  { part_no: string; part_name: string; unit: string; part_no_as400?: string; supplier_name?: string; }

// ── Sub-components ────────────────────────────────────────────
function PageBtn({ children, onClick, disabled, active }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean;
}) {
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

function LoadingBox({ text = 'Memuat data gabungan...' }: { text?: string }) {
  return (
    <div style={{ padding: '48px 0', textAlign: 'center', color: '#9ca3af', fontFamily: font }}>
      <div style={{ width: 28, height: 28, border: '3px solid #e5e7eb', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin .75s linear infinite', margin: '0 auto 12px' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      {text}
    </div>
  );
}

// ── PIVOT TABLE dengan Virtual Scrolling ──────────────────────
// Render hanya kolom yang visible di viewport (krusial untuk 500 ASSY × 12 periode)
function VirtualPivotTable({
  parts, assyCodes, periodes, qtyMap,
}: {
  parts:     PivotPart[];
  assyCodes: string[];
  periodes:  string[];
  qtyMap:    Record<string, Record<string, Record<string, number>>>;
}) {
  const scrollRef   = useRef<HTMLDivElement>(null);
  const FIXED_W     = [130, 55]; // Part No, Unit
  const COL_W       = 62;        // lebar tiap cell periode
  const ROW_H       = 34;
  const HEADER_H    = 60;        // tinggi 2 baris header
  const totalDynCols = assyCodes.length * periodes.length;

  // Virtual rows
  const rowVirt = useVirtualizer({
    count:           parts.length,
    getScrollElement: () => scrollRef.current,
    estimateSize:    () => ROW_H,
    overscan:        15,
  });

  // Virtual columns (horizontal)
  const colVirt = useVirtualizer({
    horizontal:       true,
    count:            totalDynCols,
    getScrollElement: () => scrollRef.current,
    estimateSize:     () => COL_W,
    overscan:         8,
  });

  const fixedTotalW = FIXED_W[0] + FIXED_W[1];

  return (
    <div
      ref={scrollRef}
      style={{
        overflow:   'auto',
        height:     520,
        border:     '1px solid #e8eaed',
        borderRadius: 10,
        position:   'relative',
        background: '#fff',
      }}
    >
      {/* ── HEADER (sticky top) ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        width:    fixedTotalW + colVirt.getTotalSize(),
        minWidth: '100%',
      }}>
        {/* Row 1: Part No | Unit | ASSY group headers */}
        <div style={{ display: 'flex', background: '#14532d', height: 32 }}>
          <div style={{ width: FIXED_W[0], flexShrink: 0, padding: '6px 10px', color: '#fff', fontWeight: 700, fontSize: 11, position: 'sticky', left: 0, background: '#14532d', zIndex: 21, borderRight: '2px solid #166534', whiteSpace: 'nowrap' }}>
            Part No
          </div>
          <div style={{ width: FIXED_W[1], flexShrink: 0, padding: '6px 8px', color: '#fff', fontWeight: 700, fontSize: 11, position: 'sticky', left: FIXED_W[0], background: '#14532d', zIndex: 21, borderRight: '2px solid #166534', whiteSpace: 'nowrap' }}>
            Unit
          </div>
          {/* Virtual ASSY group headers */}
          <div style={{ position: 'relative', width: colVirt.getTotalSize(), flexShrink: 0, height: 32 }}>
            {colVirt.getVirtualItems().map(vcol => {
              const assyIdx   = Math.floor(vcol.index / periodes.length);
              const periodeIdx = vcol.index % periodes.length;
              const assy       = assyCodes[assyIdx];
              // Render label assy hanya di kolom pertama per assy
              return (
                <div key={vcol.key} style={{
                  position: 'absolute', left: vcol.start, width: vcol.size, height: 32,
                  borderRight: '1px solid #166534',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {periodeIdx === 0 && (
                    <span style={{ color: '#bbf7d0', fontSize: 9.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 4px', width: COL_W * periodes.length }}>
                      {assy.length > 20 ? assy.slice(0,19)+'…' : assy}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Row 2: periode sub-headers */}
        <div style={{ display: 'flex', background: '#1e3a5f', height: 28 }}>
          <div style={{ width: FIXED_W[0], flexShrink: 0, position: 'sticky', left: 0, background: '#1e3a5f', zIndex: 21, borderRight: '2px solid #334155' }} />
          <div style={{ width: FIXED_W[1], flexShrink: 0, position: 'sticky', left: FIXED_W[0], background: '#1e3a5f', zIndex: 21, borderRight: '2px solid #334155' }} />
          <div style={{ position: 'relative', width: colVirt.getTotalSize(), flexShrink: 0, height: 28 }}>
            {colVirt.getVirtualItems().map(vcol => {
              const periodeIdx = vcol.index % periodes.length;
              const periode     = periodes[periodeIdx];
              return (
                <div key={vcol.key} style={{
                  position: 'absolute', left: vcol.start, width: vcol.size, height: 28,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRight: '1px solid #334155',
                  color: '#94a3b8', fontSize: 9, fontWeight: 500,
                }}>
                  {fmtPeriode(periode)}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── ROWS (virtual) ── */}
      <div style={{
        position: 'relative',
        height:   rowVirt.getTotalSize(),
        width:    fixedTotalW + colVirt.getTotalSize(),
        minWidth: '100%',
      }}>
        {rowVirt.getVirtualItems().map(vrow => {
          const part = parts[vrow.index];
          const isEven = vrow.index % 2 === 0;
          const rowBg  = isEven ? '#fff' : '#f0fdf4';

          return (
            <div key={vrow.key} style={{
              position: 'absolute', top: vrow.start,
              height: ROW_H, width: '100%',
              display: 'flex', alignItems: 'center',
              borderBottom: '1px solid #e8eaed',
              background: rowBg,
            }}>
              {/* Fixed: Part No */}
              <div style={{
                width: FIXED_W[0], flexShrink: 0, padding: '0 10px',
                fontFamily: 'monospace', fontSize: 11, color: '#1d4ed8', fontWeight: 700,
                position: 'sticky', left: 0, background: rowBg, zIndex: 2,
                borderRight: '2px solid #e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden',
              }}>
                {part.part_no}
              </div>
              {/* Fixed: Unit */}
              <div style={{
                width: FIXED_W[1], flexShrink: 0, padding: '0 8px', textAlign: 'center',
                position: 'sticky', left: FIXED_W[0], background: rowBg, zIndex: 2,
                borderRight: '2px solid #e2e8f0',
              }}>
                <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 700 }}>
                  {part.unit || '—'}
                </span>
              </div>
              {/* Virtual cells */}
              <div style={{ position: 'relative', width: colVirt.getTotalSize(), flexShrink: 0, height: ROW_H }}>
                {colVirt.getVirtualItems().map(vcol => {
                  const assyIdx = Math.floor(vcol.index / periodes.length);
                  const perIdx  = vcol.index % periodes.length;
                  const assy    = assyCodes[assyIdx];
                  const periode  = periodes[perIdx];
                  const qty     = qtyMap[part.part_no]?.[assy]?.[periode];

                  return (
                    <div key={vcol.key} style={{
                      position: 'absolute', left: vcol.start, width: vcol.size, height: ROW_H,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRight: '1px solid #f1f5f9',
                      fontSize: 11,
                      color:      qty ? '#15803d' : '#e5e7eb',
                      fontWeight: qty ? 700 : 400,
                    }}>
                      {qty != null ? Number(qty).toLocaleString() : '·'}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── MAIN MODAL ────────────────────────────────────────────────
export default function BomGabunganModal({
  onClose,
  availablePeriodes,
}: {
  onClose: () => void;
  availablePeriodes: string[];
}) {
  const now         = new Date();
  const safePeriodes = availablePeriodes?.length
    ? availablePeriodes
    : [`${now.getFullYear()}-01`];
  const defaultDari   = safePeriodes[safePeriodes.length - 1];
  const defaultSampai = safePeriodes[0];

  const [dari,       setDari]       = useState(defaultDari);
  const [sampai,     setSampai]     = useState(defaultSampai);
  const [tab,        setTab]        = useState<'list' | 'pivot'>('list');
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(1);
  const [hasLoaded,  setHasLoaded]  = useState(false);
  const LIMIT = 50;

  // State list
  const [listRows,    setListRows]    = useState<ListRow[]>([]);
  const [listTotal,   setListTotal]   = useState(0);
  const [listLoading, setListLoading] = useState(false);

  // State pivot
  const [assyCodes,    setAssyCodes]    = useState<string[]>([]);
  const [pivotParts,   setPivotParts]   = useState<PivotPart[]>([]);
  const [pivotTotal,   setPivotTotal]   = useState(0);
  const [pivotLoading, setPivotLoading] = useState(false);

  // Shared
  const [qtyMap,   setQtyMap]   = useState<Record<string, Record<string, Record<string, number>>>>({});
  const [periodes, setPeriodes] = useState<string[]>([]);

  // ── Info bar ──────────────────────────────────────────────
  const jumlahBulan = (() => {
    const [dY, dM] = dari.split('-').map(Number);
    const [sY, sM] = sampai.split('-').map(Number);
    return (sY - dY) * 12 + (sM - dM) + 1;
  })();
  const isExceedsMax = jumlahBulan > 12;

  // ── Fetch helpers ─────────────────────────────────────────
  const buildUrl = (mode: string, p: number, s: string) =>
    `/api/bom/gabungan?dari=${dari}&sampai=${sampai}&mode=${mode}&page=${p}&limit=${LIMIT}&search=${encodeURIComponent(s)}`;

  const fetchList = useCallback(async (p: number, s: string) => {
    setListLoading(true);
    try {
      const res  = await fetch(buildUrl('list', p, s));
      const data = await res.json();
      setListRows(data.rows      ?? []);
      setListTotal(data.total    ?? 0);
      setPeriodes(data.periodes  ?? []);
      setQtyMap(data.qty_map     ?? {});
    } catch { /**/ }
    setListLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dari, sampai]);

  const fetchPivot = useCallback(async (p: number, s: string) => {
    setPivotLoading(true);
    try {
      const res  = await fetch(buildUrl('pivot', p, s));
      const data = await res.json();
      setAssyCodes(data.assy_codes ?? []);
      setPivotParts(data.parts     ?? []);
      setQtyMap(data.qty_map       ?? {});
      setPivotTotal(data.total     ?? 0);
      setPeriodes(data.periodes    ?? []);
    } catch { /**/ }
    setPivotLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dari, sampai]);

  const handleLoad = () => {
    if (isExceedsMax) return;
    setPage(1); setSearch(''); setHasLoaded(true);
    if (tab === 'list') fetchList(1, '');
    else fetchPivot(1, '');
  };

  useEffect(() => {
    if (!hasLoaded) return;
    if (tab === 'list') fetchList(page, search);
    else fetchPivot(page, search);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div style={{ padding: '16px 28px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#374151' }}>Dari:</span>
          <select value={dari} onChange={e => setDari(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: font, outline: 'none' }}>
            {safePeriodes.map(p => <option key={p} value={p}>{fmtPeriode(p)}</option>)}
          </select>
          <span style={{ color: '#9ca3af' }}>→</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#374151' }}>Sampai:</span>
          <select value={sampai} onChange={e => setSampai(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: font, outline: 'none' }}>
            {safePeriodes.map(p => <option key={p} value={p}>{fmtPeriode(p)}</option>)}
          </select>
          <button onClick={handleLoad} disabled={isExceedsMax} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: isExceedsMax ? 'not-allowed' : 'pointer',
            background: isExceedsMax ? '#e5e7eb' : '#1d4ed8', color: isExceedsMax ? '#9ca3af' : '#fff',
            fontWeight: 700, fontSize: 13, fontFamily: font,
          }}>
            🔍 Tampilkan
          </button>

          {/* Badge info */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: isExceedsMax ? '#fee2e2' : jumlahBulan === 12 ? '#fef9c3' : '#eff6ff',
              color:      isExceedsMax ? '#dc2626' : jumlahBulan === 12 ? '#92400e' : '#1d4ed8',
            }}>
              {fmtPeriode(dari)} – {fmtPeriode(sampai)} · {jumlahBulan} bulan
              {isExceedsMax && ' ⚠ Maks 12 bulan'}
            </span>
          </div>
        </div>

        {/* Tabs & Search */}
        {hasLoaded && (
          <div style={{ padding: '12px 28px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {(['list', 'pivot'] as const).map(t => (
              <button key={t} onClick={() => handleTab(t)} style={{
                padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: tab === t ? '#1d4ed8' : '#f3f4f6',
                color:      tab === t ? '#fff' : '#6b7280',
                fontWeight: 600, fontSize: 13, fontFamily: font,
              }}>
                {t === 'list' ? '📋 Tampilan List' : '📊 Tampilan Pivot'}
              </button>
            ))}
            {/* Stats */}
            <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>
              {tab === 'pivot'
                ? `${pivotTotal.toLocaleString()} part × ${assyCodes.length} ASSY × ${periodes.length} periode`
                : `${listTotal.toLocaleString()} kombinasi`}
            </span>
            {/* Search */}
            <div style={{ position: 'relative', marginLeft: 'auto' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 13 }}>🔍</span>
              <input
                value={search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Cari part no / assy code..."
                style={{ padding: '8px 12px 8px 32px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: font, outline: 'none', width: 240 }}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div style={{ padding: '0 28px 24px' }}>
          {!hasLoaded ? (
            <div style={{ padding: '56px 0', textAlign: 'center', color: '#9ca3af', fontFamily: font }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#6b7280' }}>Pilih rentang periode lalu klik Tampilkan</div>
              <div style={{ fontSize: 12.5 }}>Maksimal 12 bulan sekaligus</div>
            </div>

          ) : tab === 'list' ? (
            listLoading ? <LoadingBox /> : (
              <>
                <p style={{ fontSize: 12, color: '#6b7280', padding: '12px 0 8px' }}>
                  {listTotal.toLocaleString()} kombinasi part-assy ditemukan
                </p>
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
                        <tr key={i}
                          style={{ borderBottom: '1px solid #f1f5f9' }}
                          onMouseOver={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseOut={e =>  (e.currentTarget.style.background = '')}
                        >
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11.5, color: '#1d4ed8', fontWeight: 700 }}>{r.part_no}</td>
                          <td style={{ padding: '8px 12px', color: '#374151' }}>{r.part_name || '—'}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 5, padding: '2px 6px', fontSize: 10.5, fontWeight: 700 }}>{r.unit || '—'}</span>
                          </td>
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
            pivotLoading
              ? <LoadingBox text="Memuat pivot..." />
              : (
                <div style={{ paddingTop: 12 }}>
                  {/* Virtual Pivot Table */}
                  <VirtualPivotTable
                    parts={pivotParts}
                    assyCodes={assyCodes}
                    periodes={periodes}
                    qtyMap={qtyMap}
                  />
                </div>
              )
          )}

          {/* Pagination */}
          {hasLoaded && totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
              <span style={{ fontSize: 12.5, color: '#6b7280', fontFamily: font }}>
                Halaman {page} dari {totalPages}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <PageBtn disabled={page===1}          onClick={() => setPage(1)}>«</PageBtn>
                <PageBtn disabled={page===1}          onClick={() => setPage(p => p-1)}>‹</PageBtn>
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
