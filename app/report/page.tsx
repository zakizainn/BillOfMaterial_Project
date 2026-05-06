'use client';

import { useState, useEffect, useCallback, useRef, useMemo, useTransition } from 'react';
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

interface Part { part_no: string; part_no_as400: string; part_name: string; unit: string; supplier_name: string; price: number | null; }

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
      padding: '8px 14px', borderRadius: 7, border: '1.5px solid',
      borderColor: active ? '#1d4ed8' : disabled ? '#e5e7eb' : '#e2e8f0',
      background:  active ? '#1d4ed8' : '#fff',
      color:       active ? '#fff'    : disabled ? '#d1d5db' : '#374151',
      fontWeight: 600, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: font,
      transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
      transform: 'translateY(0)',
    }}
    onMouseOver={e => {
      if (!disabled) {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        if (!active) e.currentTarget.style.background = '#f0f9ff';
      }
    }}
    onMouseOut={e => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = 'none';
      if (!active) e.currentTarget.style.background = '#fff';
    }}
    onMouseDown={e => {
      if (!disabled) e.currentTarget.style.transform = 'translateY(0)';
    }}
    >{children}</button>
  );
}

// ── Virtual Report Table (FIXED MOBILE) ────────────────────────
function VirtualReportTable({
  rows, cols, mode, periodes,
  footerColSums, footerTotalUsage, isMobile,
}: {
  rows:             ComputedRow[];
  cols:             ColDef[];
  mode:             'single' | 'gabungan';
  periodes:         string[];
  isMobile:         boolean;
  footerColSums:    number[];
  footerTotalUsage: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Lebar tiap fixed column [part_no, part_no_as400, supplier, part_name, unit]
  // Mobile FW[0] = 155px — cukup untuk "∑ TOTAL PER ASSY" (font 11px bold) + padding 8px kiri-kanan
  // Rumus: measureText("∑ TOTAL PER ASSY", 11px DM Sans bold) ≈ 135px + 2×8px padding = 151px → pakai 155px
  const FW = isMobile ? [155, 110, 110, 160, 55] : [130, 110, 110, 160, 55];

  // KUNCI: fixedTotalW harus sama persis di SETIAP elemen tabel
  // Mobile  → hanya FW[0] yang sticky-fixed (kolom lain tidak dirender)
  // Desktop → semua FW[0..4] dirender dan sticky
  const fixedTotalW = isMobile
    ? FW[0]                            // 155
    : FW.reduce((a, b) => a + b, 0);  // 130+110+110+160+55 = 565

  const STICKY_RIGHT_PRICE = isMobile ? 68 : 80;
  const STICKY_RIGHT_TOTAL = isMobile ? 58 : 72;
  const STICKY_RIGHT_USAGE = isMobile ? 72 : 90;
  const STICKY_RIGHT_TOTAL_W = STICKY_RIGHT_PRICE + STICKY_RIGHT_TOTAL + STICKY_RIGHT_USAGE;

  const COL_W   = mode === 'gabungan' ? (isMobile ? 52 : 62) : (isMobile ? 72 : 90);
  const ROW_H   = isMobile ? 34 : 36;
  const HEAD1_H = isMobile ? 30 : 34;
  const HEAD2_H = mode === 'gabungan' ? (isMobile ? 22 : 26) : 0;
  const HEAD3_H = isMobile ? 26 : 30;
  const FS_HEADER = isMobile ? 10 : 11;
  const FS_BODY   = isMobile ? 11 : 12;
  const FS_SMALL  = isMobile ? 9  : 10;

  const colVirt = useVirtualizer({
    horizontal:       true,
    count:            cols.length,
    getScrollElement: () => scrollRef.current,
    estimateSize:     () => COL_W,
    overscan:         8,
  });

  const rowVirt = useVirtualizer({
    count:            rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize:     () => ROW_H,
    overscan:         12,
  });

  const dynW   = colVirt.getTotalSize();
  // totalW dipakai KONSISTEN di semua baris — jangan pakai 'minWidth:100%' saja
  const totalW = fixedTotalW + dynW + STICKY_RIGHT_TOTAL_W;

  // ── Helper: sticky fixed cell style ──────────────────────────
  const stickyCell = (
    left: number,
    width: number,
    bg: string,
    extra: React.CSSProperties = {}
  ): React.CSSProperties => ({
    position: 'sticky',
    left,
    width,
    flexShrink: 0,
    background: bg,
    zIndex: 21,
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    ...extra,
  });

  // ── Helper: sticky right cell style ──────────────────────────
  const stickyRight = (
    right: number,
    width: number,
    bg: string,
    extra: React.CSSProperties = {}
  ): React.CSSProperties => ({
    position: 'sticky',
    right,
    width,
    flexShrink: 0,
    background: bg,
    zIndex: 10,
    height: ROW_H,
    display: 'flex',
    alignItems: 'center',
    ...extra,
  });

  return (
    <div
      ref={scrollRef}
      style={{
        overflow: 'auto',
        maxHeight: 'calc(100vh - 260px)',
        position: 'relative',
        fontSize: FS_BODY,
        whiteSpace: 'nowrap',
        // Pastikan container tidak clip sticky elements
        WebkitOverflowScrolling: 'touch',
      }}
    >

      {/* ══════════════════════════════════════════
          STICKY HEADER
          width: totalW — konsisten dengan semua baris
          ══════════════════════════════════════════ */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        // KUNCI: width eksplisit, bukan minWidth:'100%'
        width: totalW,
        minWidth: '100%',
      }}>

        {/* ── Header Row 1: Column labels ── */}
        <div style={{ display: 'flex', background: '#1e3a5f', height: HEAD1_H, alignItems: 'center' }}>

          {/* Fixed col: PART NO — selalu ada */}
          <div style={stickyCell(0, FW[0], '#1e3a5f', {
            padding: isMobile ? '0 6px' : '0 10px',
            color: '#cbd5e1',
            fontWeight: 700,
            fontSize: FS_HEADER,
            // Border tebal di mobile karena ini border terakhir fixed area
            borderRight: isMobile ? '2px solid #475569' : '1px solid #334155',
          })}>
            PART NO
          </div>

          {/* Fixed cols desktop only */}
          {!isMobile && (
            <>
              <div style={stickyCell(FW[0], FW[1], '#1e3a5f', { padding: '0 10px', color: '#cbd5e1', fontWeight: 700, fontSize: FS_HEADER, borderRight: '1px solid #334155' })}>
                PART NO AS400
              </div>
              <div style={stickyCell(FW[0]+FW[1], FW[2], '#1e3a5f', { padding: '0 10px', color: '#cbd5e1', fontWeight: 700, fontSize: FS_HEADER, borderRight: '1px solid #334155' })}>
                SUPPLIER
              </div>
              <div style={stickyCell(FW[0]+FW[1]+FW[2], FW[3], '#1e3a5f', { padding: '0 10px', color: '#cbd5e1', fontWeight: 700, fontSize: FS_HEADER, borderRight: '1px solid #334155' })}>
                PART NAME
              </div>
              <div style={stickyCell(FW[0]+FW[1]+FW[2]+FW[3], FW[4], '#1e3a5f', { padding: '0 10px', color: '#cbd5e1', fontWeight: 700, fontSize: FS_HEADER, borderRight: '2px solid #475569' })}>
                UNIT
              </div>
            </>
          )}

          {/* Dynamic ASSY headers */}
          <div style={{ position: 'relative', width: dynW, flexShrink: 0, height: HEAD1_H }}>
            {colVirt.getVirtualItems().map(vcol => {
              const col = cols[vcol.index];
              const isFirstOfAssy = mode !== 'gabungan' || vcol.index === 0 || cols[vcol.index - 1].assy !== col.assy;
              const assySpanCount = mode === 'gabungan' ? periodes.length : 1;
              return (
                <div key={vcol.key} style={{
                  position: 'absolute',
                  left: vcol.start,
                  width: mode === 'gabungan' && isFirstOfAssy ? COL_W * assySpanCount : vcol.size,
                  height: HEAD1_H,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#93c5fd', fontWeight: 600, fontSize: FS_HEADER,
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

          {/* Sticky right headers */}
          <div style={stickyRight(STICKY_RIGHT_TOTAL + STICKY_RIGHT_USAGE, STICKY_RIGHT_PRICE, '#1c2d1e', {
            padding: isMobile ? '0 4px' : '0 8px',
            justifyContent: 'flex-end',
            color: '#a78bfa', fontWeight: 700, fontSize: FS_HEADER,
            borderLeft: '2px solid #8b5cf6',
            zIndex: 21,
          })}>
            PRICE
          </div>
          <div style={stickyRight(STICKY_RIGHT_USAGE, STICKY_RIGHT_TOTAL, '#1c2d1e', {
            padding: isMobile ? '0 4px' : '0 8px',
            justifyContent: 'flex-end',
            color: '#fbbf24', fontWeight: 700, fontSize: FS_HEADER,
            borderLeft: '2px solid #f59e0b',
            zIndex: 21,
          })}>
            TOT
          </div>
          <div style={stickyRight(0, STICKY_RIGHT_USAGE, '#1c2d1e', {
            padding: isMobile ? '0 4px' : '0 8px',
            justifyContent: 'flex-end',
            color: '#4ade80', fontWeight: 700, fontSize: FS_HEADER,
            borderLeft: '2px solid #16a34a',
            zIndex: 21,
          })}>
            {isMobile ? 'USAGE' : 'TOTAL USAGE'}
          </div>
        </div>

        {/* ── Header Row 2: Sub-header periode (gabungan only) ── */}
        {mode === 'gabungan' && HEAD2_H > 0 && (
          <div style={{ display: 'flex', background: '#1a2f3f', height: HEAD2_H, alignItems: 'center' }}>
            {/* Satu div fixed dengan lebar fixedTotalW PERSIS */}
            <div style={stickyCell(0, fixedTotalW, '#1a2f3f', { borderRight: '2px solid #475569' })} />

            <div style={{ position: 'relative', width: dynW, flexShrink: 0, height: HEAD2_H }}>
              {colVirt.getVirtualItems().map(vcol => {
                const col = cols[vcol.index];
                return (
                  <div key={vcol.key} style={{
                    position: 'absolute', left: vcol.start, width: vcol.size, height: HEAD2_H,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#94a3b8', fontSize: FS_SMALL, fontWeight: 500,
                    borderRight: '1px solid #334155', background: '#1a2f3f',
                  }}>
                    {col.periode ? fmtPeriodeShort(col.periode) : ''}
                  </div>
                );
              })}
            </div>

            <div style={{ width: STICKY_RIGHT_PRICE, flexShrink: 0, height: HEAD2_H, background: '#1a2f3f', borderLeft: '2px solid #8b5cf6', position: 'sticky', right: STICKY_RIGHT_TOTAL + STICKY_RIGHT_USAGE, zIndex: 21 }} />
            <div style={{ width: STICKY_RIGHT_TOTAL, flexShrink: 0, height: HEAD2_H, background: '#1a2f3f', borderLeft: '2px solid #f59e0b', position: 'sticky', right: STICKY_RIGHT_USAGE, zIndex: 21 }} />
            <div style={{ width: STICKY_RIGHT_USAGE, flexShrink: 0, height: HEAD2_H, background: '#1a2f3f', borderLeft: '2px solid #16a34a', position: 'sticky', right: 0, zIndex: 21 }} />
          </div>
        )}

        {/* ── Header Row 3: PROD QTY ── */}
        <div style={{ display: 'flex', background: '#0f172a', height: HEAD3_H, alignItems: 'center' }}>
          {/* Satu div fixed dengan lebar fixedTotalW PERSIS — sama dengan row lain */}
          <div style={stickyCell(0, fixedTotalW, '#0f172a', {
            padding: '0 10px',
            color: '#f59e0b', fontWeight: 700, fontSize: isMobile ? 11 : 12,
            borderRight: '2px solid #475569',
          })}>
            PROD QTY →
          </div>

          <div style={{ position: 'relative', width: dynW, flexShrink: 0, height: HEAD3_H }}>
            {colVirt.getVirtualItems().map(vcol => {
              const col = cols[vcol.index];
              return (
                <div key={vcol.key} style={{
                  position: 'absolute', left: vcol.start, width: vcol.size, height: HEAD3_H,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: col.prodQty > 0 ? '#fbbf24' : '#475569',
                  fontWeight: 700, fontSize: isMobile ? 11 : 12,
                  borderRight: '1px solid #1e293b',
                }}>
                  {col.prodQty > 0 ? col.prodQty.toLocaleString() : '—'}
                </div>
              );
            })}
          </div>

          <div style={{ width: STICKY_RIGHT_PRICE, flexShrink: 0, height: HEAD3_H, background: '#0f172a', borderLeft: '2px solid #8b5cf6', position: 'sticky', right: STICKY_RIGHT_TOTAL + STICKY_RIGHT_USAGE, zIndex: 21 }} />
          <div style={{ width: STICKY_RIGHT_TOTAL, flexShrink: 0, height: HEAD3_H, background: '#0f172a', borderLeft: '2px solid #f59e0b', position: 'sticky', right: STICKY_RIGHT_USAGE, zIndex: 21 }} />
          <div style={{ width: STICKY_RIGHT_USAGE, flexShrink: 0, height: HEAD3_H, background: '#0f172a', borderLeft: '2px solid #16a34a', position: 'sticky', right: 0, zIndex: 21 }} />
        </div>
      </div>
      {/* ── END STICKY HEADER ── */}


      {/* ══════════════════════════════════════════
          VIRTUAL ROWS
          width: totalW eksplisit — BUKAN '100%'
          Ini yang bikin footer tidak overlay
          ══════════════════════════════════════════ */}
      <div style={{ position: 'relative', height: rowVirt.getTotalSize(), width: totalW, minWidth: '100%' }}>
        {rowVirt.getVirtualItems().map(vrow => {
          const { part, cells, totalQty, totalUsage } = rows[vrow.index];
          const isEven = vrow.index % 2 === 0;
          const rowBg  = isEven ? '#fff' : '#f8fafc';

          return (
            <div
              key={vrow.key}
              style={{
                position: 'absolute',
                top: vrow.start,
                // KUNCI: width totalW eksplisit agar footer tidak overlay
                width: totalW,
                height: ROW_H,
                display: 'flex',
                alignItems: 'center',
                borderBottom: '1px solid #f1f5f9',
                background: rowBg,
              }}
              onMouseOver={e => (e.currentTarget.style.background = '#eff6ff')}
              onMouseOut={e  => (e.currentTarget.style.background = rowBg)}
            >
              {/* Fixed cell: PART NO — selalu ada */}
              <div style={{
                width: FW[0], flexShrink: 0,
                padding: isMobile ? '0 6px' : '0 10px',
                fontFamily: 'monospace', fontSize: FS_BODY,
                color: '#1d4ed8', fontWeight: 700,
                overflow: 'hidden', textOverflow: 'ellipsis',
                position: 'sticky', left: 0,
                background: rowBg, zIndex: 2,
                borderRight: isMobile ? '2px solid #e2e8f0' : '1px solid #e2e8f0',
                height: ROW_H, display: 'flex', alignItems: 'center',
              }}>
                {part.part_no}
              </div>

              {/* Fixed cells desktop only */}
              {!isMobile && (
                <>
                  <div style={{ width: FW[1], flexShrink: 0, padding: '0 10px', fontFamily: 'monospace', fontSize: FS_SMALL, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', position: 'sticky', left: FW[0], background: rowBg, zIndex: 2, borderRight: '1px solid #f1f5f9', height: ROW_H, display: 'flex', alignItems: 'center' }}>
                    {part.part_no_as400 || '—'}
                  </div>
                  <div style={{ width: FW[2], flexShrink: 0, padding: '0 10px', fontSize: FS_SMALL, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', position: 'sticky', left: FW[0]+FW[1], background: rowBg, zIndex: 2, borderRight: '1px solid #f1f5f9', height: ROW_H, display: 'flex', alignItems: 'center' }}>
                    {part.supplier_name || '—'}
                  </div>
                  <div style={{ width: FW[3], flexShrink: 0, padding: '0 10px', fontSize: FS_SMALL, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', position: 'sticky', left: FW[0]+FW[1]+FW[2], background: rowBg, zIndex: 2, borderRight: '1px solid #f1f5f9', height: ROW_H, display: 'flex', alignItems: 'center' }}>
                    {part.part_name || '—'}
                  </div>
                  <div style={{ width: FW[4], flexShrink: 0, padding: '0 6px', position: 'sticky', left: FW[0]+FW[1]+FW[2]+FW[3], background: rowBg, zIndex: 2, borderRight: '2px solid #e2e8f0', height: ROW_H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 4, padding: '1px 5px', fontSize: FS_SMALL, fontWeight: 700 }}>
                      {part.unit || '—'}
                    </span>
                  </div>
                </>
              )}

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
                      borderRight: '1px solid #f1f5f9', fontSize: FS_BODY,
                    }}>
                      {qty != null && qty > 0 ? Number(qty).toLocaleString() : '·'}
                    </div>
                  );
                })}
              </div>

              {/* Sticky right: PRICE */}
              <div style={stickyRight(STICKY_RIGHT_TOTAL + STICKY_RIGHT_USAGE, STICKY_RIGHT_PRICE, isEven ? '#f5f3ff' : '#ede9fe', {
                padding: isMobile ? '0 4px' : '0 8px',
                justifyContent: 'flex-end',
                fontWeight: 700,
                color: part.price != null ? '#7c3aed' : '#9ca3af',
                borderLeft: '2px solid #c4b5fd',
                fontSize: FS_BODY,
                zIndex: 10,
              })}>
                {part.price != null
                  ? Number(part.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '—'}
              </div>

              {/* Sticky right: TOTAL */}
              <div style={stickyRight(STICKY_RIGHT_USAGE, STICKY_RIGHT_TOTAL, isEven ? '#fffbeb' : '#fef9c3', {
                padding: isMobile ? '0 4px' : '0 8px',
                justifyContent: 'flex-end',
                fontWeight: 700,
                color: '#92400e',
                borderLeft: '2px solid #fde68a',
                fontSize: FS_BODY,
                zIndex: 10,
              })}>
                {totalQty > 0 ? totalQty.toLocaleString() : '—'}
              </div>

              {/* Sticky right: TOTAL USAGE */}
              <div style={stickyRight(0, STICKY_RIGHT_USAGE, isEven ? '#f0fdf4' : '#dcfce7', {
                padding: isMobile ? '0 4px' : '0 8px',
                justifyContent: 'flex-end',
                fontWeight: 700,
                color: totalUsage > 0 ? '#15803d' : '#9ca3af',
                borderLeft: '2px solid #bbf7d0',
                fontSize: FS_BODY,
                zIndex: 10,
              })}>
                {totalUsage > 0 ? totalUsage.toLocaleString() : '—'}
              </div>
            </div>
          );
        })}
      </div>
      {/* ── END VIRTUAL ROWS ── */}


      {/* ══════════════════════════════════════════
          STICKY FOOTER
          width: totalW eksplisit — sama dengan rows
          ══════════════════════════════════════════ */}
      <div style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        background: '#1e3a5f',
        height: ROW_H,
        // KUNCI: width totalW eksplisit — bukan '100%'
        width: totalW,
        minWidth: '100%',
      }}>
        {/* Fixed area footer — lebar fixedTotalW PERSIS */}
        <div style={stickyCell(0, fixedTotalW, '#1e3a5f', {
          padding: '0 10px',
          color: '#fbbf24', fontWeight: 700, fontSize: isMobile ? 11 : 12,
          borderRight: '2px solid #475569',
        })}>
          ∑ TOTAL PER ASSY
        </div>

        {/* Dynamic footer col sums */}
        <div style={{ position: 'relative', width: dynW, flexShrink: 0, height: ROW_H }}>
          {colVirt.getVirtualItems().map(vcol => (
            <div key={vcol.key} style={{
              position: 'absolute', left: vcol.start, width: vcol.size, height: ROW_H,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fbbf24', fontWeight: 700, fontSize: isMobile ? 11 : 12,
              borderRight: '1px solid #334155',
            }}>
              {footerColSums[vcol.index] > 0 ? footerColSums[vcol.index].toLocaleString() : '—'}
            </div>
          ))}
        </div>

        <div style={{ width: STICKY_RIGHT_PRICE, flexShrink: 0, height: ROW_H, borderLeft: '2px solid #8b5cf6', background: '#1e3a5f', position: 'sticky', right: STICKY_RIGHT_TOTAL + STICKY_RIGHT_USAGE, zIndex: 21 }} />
        <div style={{ width: STICKY_RIGHT_TOTAL, flexShrink: 0, height: ROW_H, borderLeft: '2px solid #f59e0b', background: '#1e3a5f', position: 'sticky', right: STICKY_RIGHT_USAGE, zIndex: 21 }} />
        <div style={{
          width: STICKY_RIGHT_USAGE, flexShrink: 0,
          padding: isMobile ? '0 4px' : '0 8px',
          height: ROW_H,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          color: '#4ade80', fontWeight: 700, fontSize: isMobile ? 11 : 12,
          borderLeft: '2px solid #16a34a', background: '#1e3a5f',
          position: 'sticky', right: 0, zIndex: 21,
        }}>
          {footerTotalUsage > 0 ? footerTotalUsage.toLocaleString() : '—'}
        </div>
      </div>
      {/* ── END STICKY FOOTER ── */}

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
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [isPending, startTransition] = useTransition();
  
  // Fetch ALL parts data for footer totals (not paginated)
  const [footerData, setFooterData] = useState<{
    col_sums: { assy_code: string; periode?: string; col_sum: string }[];
    prod_map: { assy_code: string; periode: string; prod_qty: string }[];
  }>({ col_sums: [], prod_map: [] });

  const footerAbortRef = useRef<AbortController | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  useEffect(() => { 
    if (mode !== 'gabungan' || !dari || !sampai) return;
    
    // Delay fetch agar browser selesai paint dulu (visual toggle kelar)
    const id = setTimeout(() => {
      loadAssyCodes();
    }, 80);
    
    return () => clearTimeout(id);
  }, [mode, dari, sampai, loadAssyCodes]);

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

  const handleLoad = useCallback(() => {
    if (loading) return; // Prevent multiple clicks while loading
    setPage(1); setSearch(''); setHasLoaded(true); setResults({}); setPeriodes([]); setActivePer('');
    fetchData(1, '');
  }, [loading, fetchData]);

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
    
  // Footer: fetch agregasi ringan dari server, debounce 300ms
  useEffect(() => {
    if (!hasLoaded) return;

    const timer = setTimeout(async () => {
      footerAbortRef.current?.abort();
      const ctrl = new AbortController();
      footerAbortRef.current = ctrl;

      try {
        const base = mode === 'single'
          ? `/api/report?periode=${encodeURIComponent(periode)}&footer=true`
          : `/api/report?dari=${dari}&sampai=${sampai}${selectedAssy.size > 0 ? `&assy_codes=${[...selectedAssy].join(',')}` : ''}&footer=true`;
        const url = `${base}${search ? `&search=${encodeURIComponent(search)}` : ''}`;

        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = await res.json();
        setFooterData(data);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.error('[Footer]', e);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      footerAbortRef.current?.abort();
    };
  }, [hasLoaded, mode, periode, dari, sampai, selectedAssy, search]);

  // ── PRE-KALKULASI — dilakukan sekali saat data berubah ───��──
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

    // 2. Build flat lookup for displayed rows (from qtyMap on current page)
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

    // 4. Pre-compute setiap baris (hanya untuk display page)
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
          if (col.prodQty > 0) hasProdQty = true;
        }
      }

      const roundedUsage = Math.ceil(totalUsage);

      return { part, cells, totalQty, totalUsage: roundedUsage };
    });

    // Build prod map dari footerData
    const prodMapForFooter = new Map<string, number>();
    for (const r of footerData.prod_map) {
      prodMapForFooter.set(`${r.assy_code}|${r.periode}`, Number(r.prod_qty));
    }

    // Footer col sums dari server — O(cols) bukan O(parts × cols)
    const footerColSums = cols.map(col => {
      const row = footerData.col_sums.find(r =>
        r.assy_code === col.assy &&
        (mode !== 'gabungan' || r.periode === col.periode)
      );
      return Number(row?.col_sum ?? 0);
    });

    // Footer total usage
    const footerTotalUsage = Math.ceil(
      cols.reduce((acc, col, ci) => {
        const prodQty = mode === 'gabungan'
          ? (prodMapForFooter.get(`${col.assy}|${col.periode}`) ?? 0)
          : col.prodQty;
        return acc + footerColSums[ci] * prodQty;
      }, 0)
    );

    return { cols, computedRows, footerColSums, footerTotalUsage, hasProdQty };
  }, [currentData, parts, assyCodes, periodes, qtyMap, prodQtyMap, mode, footerData]);

  const filteredAssy = allAssyCodes.filter(a =>
    !assySearch || a.toLowerCase().includes(assySearch.toLowerCase())
  );

  const buildDownloadUrl = (s: string) => {
    if (mode === 'gabungan') {
      return `/api/report?dari=${dari}&sampai=${sampai}${selectedAssy.size > 0 ? `&assy_codes=${[...selectedAssy].join(',')}` : ''}&search=${encodeURIComponent(s)}&download=true`;
    }
    return `/api/report?periode=${encodeURIComponent(periode)}${selectedAssy.size > 0 ? `&assy_codes=${[...selectedAssy].join(',')}` : ''}&search=${encodeURIComponent(s)}&download=true`;
  };

  const handleExport = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);

    // Buat AbortController baru setiap export
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const exportUrl = new URL('/api/report/export-stream', window.location.origin);
      if (mode === 'gabungan') {
        exportUrl.searchParams.set('dari', dari!);
        exportUrl.searchParams.set('sampai', sampai!);
      } else {
        exportUrl.searchParams.set('periode', periode!);
      }
      exportUrl.searchParams.set('mode', mode);
      if (selectedAssy.size > 0) {
        selectedAssy.forEach(assy => exportUrl.searchParams.append('assy', assy));
      }

      const response = await fetch(exportUrl.toString(), {
        signal: abortController.signal, // ← kirim signal ke fetch
      });

      if (!response.ok) throw new Error(`Export failed: ${response.status}`);

      const totalParts = parseInt(response.headers.get('x-total-parts') || '0', 10);
      const totalCols  = parseInt(response.headers.get('x-total-cols')  || '1',  10);
      const estimatedBytes = totalParts > 0
        ? totalParts * (5 + totalCols) * 15
        : 0;

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;
      let fakeProgress  = 0;
      let firstChunk    = false;

      const initTimer = setInterval(() => {
        fakeProgress = Math.min(fakeProgress + 1, 10);
        setDownloadProgress(fakeProgress);
      }, 150);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (!firstChunk) { clearInterval(initTimer); firstChunk = true; }

          chunks.push(value);
          receivedBytes += value.length;

          const realProgress = estimatedBytes > 0
            ? Math.floor(10 + Math.min(receivedBytes / estimatedBytes, 1) * 80)
            : Math.min(10 + Math.floor(receivedBytes / 50000), 89);

          setDownloadProgress(realProgress);
        }
      } catch (readErr: unknown) {
        // Jika cancel, reader.read() throw AbortError
        if (readErr instanceof Error && readErr.name === 'AbortError') {
          clearInterval(initTimer);
          reader.cancel();
          return; // langsung return, tidak trigger download
        }
        throw readErr;
      }

      clearInterval(initTimer);

      // Finalisasi progress
      setDownloadProgress(90);
      await new Promise(r => setTimeout(r, 200));
      setDownloadProgress(95);
      await new Promise(r => setTimeout(r, 200));
      setDownloadProgress(100);

      const blob = new Blob(chunks as BlobPart[], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor      = document.createElement('a');
      anchor.href       = downloadUrl;
      anchor.download   = `report_${mode === 'gabungan' ? `${dari}_${sampai}` : periode}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(downloadUrl);

      setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress(0);
        abortControllerRef.current = null;
      }, 800);

    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Cancel — tidak perlu alert
      } else {
        console.error('Export error:', error);
        alert('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
      setIsDownloading(false);
      setDownloadProgress(0);
      abortControllerRef.current = null;
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: font }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes fadeUp  { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes slideDown { from { opacity:0; transform:translateY(-12px) } to { opacity:1; transform:translateY(0) } }
      `}</style>

      {/* Professional Glassmorphic Header - Unified with Home Page */}
      <header style={{
        background: 'rgba(248, 250, 252, 0.5)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(226, 232, 240, 0.3)',
        padding: isMobile ? '12px 20px' : '12px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 56,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        transition: 'all 0.3s ease',
      }}>
        {/* Left: Breadcrumb navigation */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: isMobile ? 12 : 13 }}>
          <button onClick={() => router.back?.()} style={{
            background: 'rgba(255, 255, 255, 0.5)',
            border: '1px solid rgba(226, 232, 240, 0.8)',
            borderRadius: 8,
            cursor: 'pointer',
            color: '#64748b',
            fontWeight: 500,
            fontFamily: font,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            transition: 'all 0.2s ease',
          }}
            onMouseOver={e => { 
              e.currentTarget.style.background = 'rgba(241, 245, 249, 0.9)'; 
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.color = '#0f172a'; 
            }}
            onMouseOut={e => { 
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.5)'; 
              e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.8)';
              e.currentTarget.style.color = '#64748b'; 
            }}
          >
            <span style={{ fontSize: 16 }}>←</span> 
            <span style={{ display: isMobile ? 'none' : 'inline' }}>Home</span>
          </button>
          <span style={{ color: '#cbd5e1', display: isMobile ? 'none' : 'inline' }}>/</span>
          <span style={{ fontWeight: 600, color: '#0f172a', display: isMobile ? 'none' : 'inline' }}>Report</span>
        </nav>

        {/* Right: YAZAKI Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img
            src="/yazaki-logo.jpeg"
            alt="YAZAKI Logo"
            style={{
              height: isMobile ? 36 : 40,
              width: 'auto',
              objectFit: 'contain',
              opacity: 1,
              transition: 'opacity 0.3s ease',
            }}
          />
        </div>
      </header>

      {/* Top padding for fixed header */}
      <div style={{ height: 56 }} />
      <main style={{ padding: isMobile ? '24px 16px' : '32px 40px', maxWidth: 1600, margin: '0 auto', animation: 'fadeUp .3s ease' }}>
        <div style={{ marginBottom: isMobile ? 16 : 24 }}>
          <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: -0.5 }}>Report</h1>
          <p style={{ fontSize: isMobile ? 12.5 : 13.5, color: '#64748b', marginTop: 4 }}>Kalkulasi kebutuhan part berdasarkan BOM × Prod Qty</p>
        </div>

        {/* Filter card */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8eaed', padding: isMobile ? '16px 16px' : '24px 28px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,.05)', transition: 'all 0.2s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⚙️</div>
            <p style={{ fontSize: isMobile ? 12 : 13, fontWeight: 700, color: '#0f172a' }}>Konfigurasi Report</p>
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: '#f8fafc', borderRadius: 10, padding: 4, width: 'fit-content', border: '1px solid #e2e8f0', transition: 'all 0.2s ease', willChange: 'transform' }}>
            {(['single','gabungan'] as const).map(m => (
              <button key={m} 
              onClick={() => {
                if (mode === m) return; // skip kalau sudah aktif
                setMode(m);
                setHasLoaded(false);
                setResults({});
                setPeriodes([]);
              }}
              
              style={{
                padding: isMobile ? '6px 14px' : '7px 20px', borderRadius: 8, border: 'none',
                background: mode === m ? '#fff' : 'transparent',
                color:      mode === m ? '#1d4ed8' : '#64748b',
                fontWeight: mode === m ? 700 : 500,
                fontSize: isMobile ? 12 : 13, cursor: 'pointer', fontFamily: font,
                boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
                transition: 'background 0.1s, color 0.1s',
                transform: 'translateZ(0)', 
                willChange: 'background,color'
              }}
                onMouseOver={e => {
                  if (mode !== m) {
                    e.currentTarget.style.color = '#1d4ed8';
                    e.currentTarget.style.background = 'rgba(29, 78, 216, 0.05)';
                  }
                }}
                onMouseOut={e => {
                  if (mode !== m) {
                    e.currentTarget.style.color = '#64748b';
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                {m === 'single' ? '📅 Single Periode' : '📆 Gabungan'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {mode === 'single' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: isMobile ? 11.5 : 12.5, color: '#374151', fontWeight: 500 }}>Periode:</span>
                <select value={periode} onChange={e => setPeriode(e.target.value)} style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: font, background: '#fff', cursor: 'pointer', transition: 'all 0.2s ease' }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = '#1d4ed8';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(29, 78, 216, 0.1)';
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {availPer.map(p => <option key={p} value={p}>{fmtPeriode(p)}</option>)}
                </select>
              </div>
            ) : (
              <>
                {[{ label: 'Dari', val: dari, set: setDari }, { label: 'Sampai', val: sampai, set: setSampai }].map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {idx === 1 && <span style={{ color: '#9ca3af' }}>→</span>}
                    <span style={{ fontSize: isMobile ? 11.5 : 12.5, color: '#374151', fontWeight: 500 }}>{item.label}:</span>
                    <select value={item.val} onChange={e => item.set(e.target.value)} style={{ padding: '7px 12px', borderRadius: 8, border: `1.5px solid ${isExceedsMax ? '#ef4444' : '#e2e8f0'}`, fontSize: 13, fontFamily: font, background: '#fff', cursor: 'pointer', transition: 'all 0.2s ease' }}
                      onFocus={e => {
                        if (!isExceedsMax) {
                          e.currentTarget.style.borderColor = '#1d4ed8';
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(29, 78, 216, 0.1)';
                        }
                      }}
                      onBlur={e => {
                        e.currentTarget.style.boxShadow = 'none';
                        if (!isExceedsMax) {
                          e.currentTarget.style.borderColor = '#e2e8f0';
                        }
                      }}
                    >
                      {availPer.map(p => <option key={p} value={p}>{fmtPeriode(p)}</option>)}
                    </select>
                  </div>
                ))}

                {/* Filter ASSY picker */}
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowAssyPicker(v => !v)} style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #7c3aed', background: '#faf5ff', color: '#7c3aed', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: font, transition: 'all 0.2s ease' }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = '#f5e6ff';
                      e.currentTarget.style.borderColor = '#a855f7';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = '#faf5ff';
                      e.currentTarget.style.borderColor = '#7c3aed';
                    }}
                  >
                    Filter ASSY {selectedAssy.size > 0 ? `(${selectedAssy.size} dipilih)` : '(semua)'}
                  </button>
                  {showAssyPicker && (
                    <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 50, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', width: 320, maxHeight: 360, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                        <input value={assySearch} onChange={e => setAssySearch(e.target.value)} placeholder="Cari ASSY..." style={{ width: '100%', padding: '6px 10px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12.5, fontFamily: font, outline: 'none' }} />
                      </div>
                      <div style={{ padding: '6px', display: 'flex', gap: 6, borderBottom: '1px solid #f1f5f9' }}>
                        <button onClick={() => setSelectedAssy(new Set(allAssyCodes))} style={{ flex: 1, padding: '4px', fontSize: 11.5, border: 'none', background: '#eff6ff', color: '#1d4ed8', borderRadius: 5, cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s ease' }}
                          onMouseOver={e => {
                            e.currentTarget.style.background = '#dbeafe';
                          }}
                          onMouseOut={e => {
                            e.currentTarget.style.background = '#eff6ff';
                          }}
                        >Pilih Semua</button>
                        <button onClick={() => setSelectedAssy(new Set())} style={{ flex: 1, padding: '4px', fontSize: 11.5, border: 'none', background: '#fef2f2', color: '#dc2626', borderRadius: 5, cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s ease' }}
                          onMouseOver={e => {
                            e.currentTarget.style.background = '#fee2e2';
                          }}
                          onMouseOut={e => {
                            e.currentTarget.style.background = '#fef2f2';
                          }}
                        >Reset</button>
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
                        <button onClick={() => setShowAssyPicker(false)} style={{ width: '100%', padding: '7px', borderRadius: 7, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: font, transition: 'all 0.2s ease' }}
                          onMouseOver={e => {
                            e.currentTarget.style.background = '#1e40af';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(29, 78, 216, 0.3)';
                          }}
                          onMouseOut={e => {
                            e.currentTarget.style.background = '#1d4ed8';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >Terapkan</button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            <button onClick={handleLoad} disabled={loading || (mode === 'gabungan' && isExceedsMax)} style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: loading || (mode === 'gabungan' && isExceedsMax) ? '#d1d5db' : 'linear-gradient(135deg,#1e3a8a,#2563eb)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: loading || (mode === 'gabungan' && isExceedsMax) ? 'not-allowed' : 'pointer', fontFamily: font, boxShadow: loading || (mode === 'gabungan' && isExceedsMax) ? 'none' : '0 3px 10px rgba(37,99,235,.3)', transition: 'all 0.2s ease' }}
              onMouseOver={e => {
                if (!(loading || (mode === 'gabungan' && isExceedsMax))) {
                  e.currentTarget.style.background = 'linear-gradient(135deg,#1e40af,#3b82f6)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(37,99,235,.4)';
                }
              }}
              onMouseOut={e => {
                if (!(loading || (mode === 'gabungan' && isExceedsMax))) {
                  e.currentTarget.style.background = 'linear-gradient(135deg,#1e3a8a,#2563eb)';
                  e.currentTarget.style.boxShadow = '0 3px 10px rgba(37,99,235,.3)';
                }
              }}
            >
              Tampilkan
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
                transition: 'all 0.2s ease',
                transform: 'translateY(0)',
              }}
                onMouseOver={e => {
                  if (activePer !== p) {
                    e.currentTarget.style.borderColor = '#93c5fd';
                    e.currentTarget.style.background = '#eff6ff';
                    e.currentTarget.style.color = '#1d4ed8';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }
                }}
                onMouseOut={e => {
                  if (activePer !== p) {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.background = '#fff';
                    e.currentTarget.style.color = '#6b7280';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }
                }}
              >{fmtPeriode(p)}</button>
            ))}
          </div>
        )}

        {/* Content */}
        {!hasLoaded ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8eaed', padding: isMobile ? '60px 24px' : '80px 0', textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 4px rgba(0,0,0,.05)', animation: 'fadeUp 0.4s ease' }}>
            <div style={{ width: isMobile ? 80 : 100, height: isMobile ? 80 : 100, borderRadius: 20, background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 48 : 52, marginBottom: 16, animation: 'fadeUp 0.4s ease 0.1s both', boxShadow: '0 8px 16px rgba(37, 99, 235, 0.12)', margin: '0 auto 16px' }}>📊</div>
            <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: '#475569', marginBottom: 12, animation: 'fadeUp 0.4s ease 0.2s both' }}>Pilih periode lalu klik Tampilkan</div>
            <div style={{ fontSize: isMobile ? 12 : 13, color: '#94a3b8', fontFamily: 'monospace', background: '#f8fafc', display: 'inline-block', padding: isMobile ? '6px 12px' : '8px 16px', borderRadius: 6, border: '1px solid #e2e8f0', animation: 'fadeUp 0.4s ease 0.3s both', transition: 'all 0.2s ease', cursor: 'default' }}
              onMouseOver={e => {
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.background = '#f1f5f9';
              }}
              onMouseOut={e => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.background = '#f8fafc';
              }}
            >ROUNDUP(SUMPRODUCT(prod_qty × qty_per_unit), 0)</div>
          </div>
        ) : loading ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8eaed' }}><LoadingBox /></div>
        ) : !currentData ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8eaed', padding: '40px 0', textAlign: 'center', color: '#9ca3af' }}>Tidak ada data</div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8eaed', overflow: 'hidden' }}>
            {/* Toolbar */}
            <div style={{ padding: isMobile ? '10px 14px' : '14px 20px', borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, flexWrap: 'wrap', background: '#fafbfc', transition: 'all 0.2s ease' }}>
              <div style={{ position: 'relative', flex: isMobile ? '1 1 100%' : 'auto', minWidth: isMobile ? '100%' : 260 }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 13 }}>🔍</span>
                <input value={search} onChange={e => handleSearch(e.target.value)} placeholder="Cari part no / part name..."
                  style={{ padding: '7px 12px 7px 32px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: isMobile ? 12 : 13, fontFamily: font, outline: 'none', width: '100%', transition: 'all 0.2s ease' }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = '#1d4ed8';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(29, 78, 216, 0.1)';
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
              <button onClick={handleExport} style={{ padding: isMobile ? '7px 12px' : '8px 16px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontSize: isMobile ? 12 : 13, fontWeight: 700, cursor: 'pointer', fontFamily: font, transition: 'all 0.2s ease', whiteSpace: 'nowrap' }}
                onMouseOver={e => {
                  e.currentTarget.style.background = '#059669';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.25)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = '#10b981';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                Ekspor
              </button>
              <span style={{ fontSize: isMobile ? 11 : 12.5, color: '#6b7280', display: isMobile ? 'none' : 'inline' }}>
                <b style={{ color: '#111827' }}>{totalParts.toLocaleString()}</b> part ·
                <b style={{ color: '#111827' }}> {assyCodes.length}</b> ASSY ·
                Periode: <b style={{ color: '#1d4ed8' }}>
                  {mode === 'gabungan'
                    ? `${periodes.map(p => fmtPeriode(p)).join(' · ')} (${periodes.length} bulan)`
                    : fmtPeriode(activePer)}
                </b>
              </span>
              {!hasProdQty && (
                <span style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 6, padding: '4px 10px', fontSize: isMobile ? 10.5 : 11.5, fontWeight: 600 }}>
                  ⚠ Prod Qty belum diisi Finance
                </span>
              )}
            </div>

            {/* Download Progress Bar */}
            {isDownloading && (
              <div style={{ background: '#fff', borderBottom: '1px solid #e8eaed', padding: '12px 20px', animation: 'slideDown 0.3s ease' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 14 }}>⬇️</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
                      Mengunduh laporan... {Math.round(downloadProgress)}%
                    </div>
                    <div style={{ width: '100%', height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        width: `${downloadProgress}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #10b981, #059669)',
                        transition: 'width 0.2s ease',
                        borderRadius: 3
                      }} />
                    </div>
                  </div>
                  {/* ← Tombol cancel X */}
                  <button
                    onClick={() => {
                      abortControllerRef.current?.abort();
                      setIsDownloading(false);
                      setDownloadProgress(0);
                      abortControllerRef.current = null;
                    }}
                    title="Batalkan ekspor"
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      border: '1.5px solid #fca5a5',
                      background: '#fef2f2', color: '#dc2626',
                      fontSize: 14, fontWeight: 700,
                      cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, fontFamily: font,
                      transition: 'all .15s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.borderColor = '#ef4444'; }}
                    onMouseOut={e  => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fca5a5'; }}
                  >×</button>
                </div>
              </div>
            )}

            {/* Virtual Table */}
            <VirtualReportTable
              rows={computedRows}
              cols={cols}
              mode={mode}
              periodes={periodes}
              footerColSums={footerColSums}
              footerTotalUsage={footerTotalUsage}
              isMobile={isMobile}
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
