'use client';

import { ReactNode } from 'react';

const font = "'DM Sans', system-ui, sans-serif";

// ─── Design tokens ────────────────────────────────────────────────────────────
const tokens = {
  primary:     '#2563eb',
  primaryHover:'#1d4ed8',
  primaryLight:'#eff6ff',
  primaryBorder:'#bfdbfe',
  danger:      '#dc2626',
  dangerLight: '#fef2f2',
  dangerBorder:'#fecaca',
  success:     '#16a34a',
  successLight:'#f0fdf4',
  teal:        '#0d9488',
  tealLight:   '#f0fdfa',
  gray50:      '#f9fafb',
  gray100:     '#f3f4f6',
  gray200:     '#e5e7eb',
  gray300:     '#d1d5db',
  gray400:     '#9ca3af',
  gray500:     '#6b7280',
  gray600:     '#4b5563',
  gray700:     '#374151',
  gray900:     '#111827',
  border:      '#e8eaed',
  radius:      10,
  radiusSm:    7,
  radiusLg:    14,
  shadow:      '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)',
  shadowMd:    '0 4px 12px rgba(0,0,0,.08), 0 2px 4px rgba(0,0,0,.04)',
  shadowLg:    '0 20px 40px rgba(0,0,0,.12), 0 8px 16px rgba(0,0,0,.06)',
};

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600,
      background: active ? tokens.successLight : tokens.dangerLight,
      color: active ? tokens.success : tokens.danger,
      border: `1px solid ${active ? '#bbf7d0' : tokens.dangerBorder}`,
      whiteSpace: 'nowrap', letterSpacing: 0.2,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? tokens.success : tokens.danger, flexShrink: 0 }} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: tokens.radiusLg, width: '100%',
        maxWidth: wide ? 780 : 520,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: tokens.shadowLg,
        animation: 'modalIn .2s cubic-bezier(.34,1.56,.64,1)',
        fontFamily: font, border: '1px solid rgba(0,0,0,.06)',
      }}>
        <style>{`
          @keyframes modalIn { from { opacity:0; transform:scale(.96) translateY(8px) } to { opacity:1; transform:scale(1) translateY(0) } }
        `}</style>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: `1px solid ${tokens.border}`,
          position: 'sticky', top: 0, background: '#fff', zIndex: 1,
          borderRadius: `${tokens.radiusLg}px ${tokens.radiusLg}px 0 0`,
        }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: tokens.gray900, letterSpacing: -0.2 }}>{title}</span>
          <button onClick={onClose} style={{
            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: tokens.radiusSm, background: tokens.gray100, border: `1px solid ${tokens.border}`,
            cursor: 'pointer', fontSize: 17, color: tokens.gray500, lineHeight: 1,
            transition: 'background .15s, color .15s',
          }}
          onMouseOver={e => { e.currentTarget.style.background = tokens.gray200; e.currentTarget.style.color = tokens.gray900; }}
          onMouseOut={e  => { e.currentTarget.style.background = tokens.gray100; e.currentTarget.style.color = tokens.gray500; }}
          >×</button>
        </div>
        <div style={{ padding: '22px 24px 26px' }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────
export function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 700, color: tokens.gray500,
        marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.7,
      }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {error && <p style={{ fontSize: 11.5, color: tokens.danger, marginTop: 5, fontFamily: font, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>⚠</span>{error}
      </p>}
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
export function Input({ value, onChange, placeholder, type = 'text', disabled }: {
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string; disabled?: boolean;
}) {
  return (
    <input
      type={type} value={value} onChange={onChange}
      placeholder={placeholder} disabled={disabled}
      style={{
        width: '100%', padding: '9px 12px', borderRadius: tokens.radiusSm, fontSize: 13.5,
        border: `1.5px solid ${tokens.border}`, outline: 'none',
        background: disabled ? tokens.gray50 : '#fff',
        color: disabled ? tokens.gray400 : tokens.gray900,
        fontFamily: font, boxSizing: 'border-box',
        transition: 'border-color .15s, box-shadow .15s',
      }}
      onFocus={e => { e.target.style.borderColor = tokens.primary; e.target.style.boxShadow = `0 0 0 3px rgba(37,99,235,.1)`; }}
      onBlur={e =>  { e.target.style.borderColor = tokens.border; e.target.style.boxShadow = 'none'; }}
    />
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
export function Select({ value, onChange, options }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
}) {
  return (
    <select value={value} onChange={onChange} style={{
      width: '100%', padding: '9px 12px', borderRadius: tokens.radiusSm, fontSize: 13.5,
      border: `1.5px solid ${tokens.border}`, outline: 'none',
      background: '#fff', color: tokens.gray900,
      fontFamily: font, boxSizing: 'border-box', cursor: 'pointer',
      transition: 'border-color .15s, box-shadow .15s',
      appearance: 'none',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 12px center',
      paddingRight: 36,
    }}
    onFocus={e => { e.target.style.borderColor = tokens.primary; e.target.style.boxShadow = `0 0 0 3px rgba(37,99,235,.1)`; }}
    onBlur={e =>  { e.target.style.borderColor = tokens.border; e.target.style.boxShadow = 'none'; }}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ─── BtnPrimary ───────────────────────────────────────────────────────────────
export function BtnPrimary({ onClick, children, disabled }: {
  onClick: () => void; children: ReactNode; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? tokens.gray300 : `linear-gradient(135deg, ${tokens.primary}, #3b82f6)`,
      color: '#fff', border: 'none', borderRadius: tokens.radiusSm,
      padding: '9px 20px', fontSize: 13, fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: font, whiteSpace: 'nowrap',
      boxShadow: disabled ? 'none' : `0 2px 8px rgba(37,99,235,.28)`,
      transition: 'opacity .15s, transform .1s, box-shadow .15s',
      letterSpacing: 0.1,
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}
    onMouseOver={e => { if (!disabled) { e.currentTarget.style.opacity = '.92'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 4px 14px rgba(37,99,235,.35)`; } }}
    onMouseOut={e  => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = disabled ? 'none' : `0 2px 8px rgba(37,99,235,.28)`; }}
    >{children}</button>
  );
}

// ─── BtnGhost ─────────────────────────────────────────────────────────────────
export function BtnGhost({ onClick, children, color = 'blue', disabled }: {
  onClick: () => void; children: ReactNode;
  color?: 'blue' | 'red' | 'gray' | 'teal'; disabled?: boolean;
}) {
  const map = {
    blue: { border: tokens.primaryBorder, text: tokens.primary, hoverBg: tokens.primaryLight, hoverBorder: '#93c5fd' },
    red:  { border: tokens.dangerBorder, text: tokens.danger, hoverBg: tokens.dangerLight, hoverBorder: '#fca5a5' },
    gray: { border: tokens.border, text: tokens.gray600, hoverBg: tokens.gray50, hoverBorder: tokens.gray300 },
    teal: { border: '#99f6e4', text: tokens.teal, hoverBg: tokens.tealLight, hoverBorder: '#5eead4' },
  };
  const c = map[color];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: '#fff',
      border: `1.5px solid ${disabled ? tokens.border : c.border}`,
      borderRadius: tokens.radiusSm, padding: '7px 14px', fontSize: 12.5, fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      color: disabled ? tokens.gray400 : c.text,
      fontFamily: font, whiteSpace: 'nowrap',
      transition: 'background .15s, border-color .15s, transform .1s',
      display: 'inline-flex', alignItems: 'center', gap: 5,
      letterSpacing: 0.1,
    }}
    onMouseOver={e => { if (!disabled) { e.currentTarget.style.background = c.hoverBg; e.currentTarget.style.borderColor = c.hoverBorder; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
    onMouseOut={e =>  { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = disabled ? tokens.border : c.border; e.currentTarget.style.transform = 'translateY(0)'; }}
    >{children}</button>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
export function ConfirmDialog({ msg, onConfirm, onCancel }: {
  msg: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal title="Konfirmasi Hapus" onClose={onCancel}>
      <div style={{ display: 'flex', gap: 14, marginBottom: 22 }}>
        <div style={{ width: 42, height: 42, borderRadius: 10, background: tokens.dangerLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🗑</div>
        <p style={{ color: tokens.gray600, fontSize: 13.5, lineHeight: 1.65, paddingTop: 2 }}>{msg}</p>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <BtnGhost onClick={onCancel} color="gray">Batal</BtnGhost>
        <button onClick={onConfirm} style={{
          background: tokens.danger, color: '#fff', border: 'none', borderRadius: tokens.radiusSm,
          padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: font,
          boxShadow: '0 2px 8px rgba(220,38,38,.22)',
          transition: 'opacity .15s, transform .1s',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
        onMouseOver={e => { e.currentTarget.style.opacity = '.9'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseOut={e =>  { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >🗑 Hapus</button>
      </div>
    </Modal>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────
export function LoadingSpinner() {
  return (
    <div style={{ textAlign: 'center', padding: '56px 0', color: tokens.gray400, fontSize: 13.5, fontFamily: font }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: `3px solid ${tokens.gray200}`,
        borderTop: `3px solid ${tokens.primary}`,
        animation: 'spin 0.7s linear infinite', margin: '0 auto 14px',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <span style={{ color: tokens.gray500, fontWeight: 500 }}>Memuat data...</span>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
export function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const bgMap: Record<string, string> = {
    '#2563eb': '#eff6ff', '#1d4ed8': '#eff6ff',
    '#16a34a': '#f0fdf4', '#15803d': '#f0fdf4',
    '#7c3aed': '#faf5ff', '#9333ea': '#faf5ff',
    '#d97706': '#fffbeb', '#f59e0b': '#fffbeb',
    '#dc2626': '#fef2f2',
  };
  const bg = bgMap[color] || tokens.gray50;
  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${tokens.border}`,
      borderRadius: tokens.radiusLg,
      padding: '16px 22px',
      minWidth: 148,
      boxShadow: tokens.shadow,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: color, borderRadius: '3px 0 0 3px' }} />
      <div style={{ fontSize: 10.5, fontWeight: 700, color: tokens.gray400, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1.1, letterSpacing: -0.5 }}>{value}</div>
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────
export function Table({ headers, rows }: {
  headers: { label: ReactNode; right?: boolean }[];
  rows: ReactNode[][];
}) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: tokens.radiusLg, border: `1px solid ${tokens.border}`, background: '#fff', boxShadow: tokens.shadow }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: font }}>
        <thead>
          <tr style={{ background: tokens.gray50, borderBottom: `1.5px solid ${tokens.border}` }}>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: '11px 16px', textAlign: h.right ? 'right' : 'left',
                fontSize: 10.5, fontWeight: 700, color: tokens.gray400,
                textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap',
              }}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} style={{ padding: '48px 16px', textAlign: 'center', color: tokens.gray400, fontSize: 13.5 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
                Tidak ada data ditemukan
              </td>
            </tr>
          ) : rows.map((row, ri) => (
            <tr key={ri}
              style={{ borderBottom: `1px solid ${tokens.gray100}`, transition: 'background .1s' }}
              onMouseOver={e => (e.currentTarget.style.background = '#f8faff')}
              onMouseOut={e =>  (e.currentTarget.style.background = 'transparent')}
            >
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: '12px 16px', fontSize: 13.5, color: tokens.gray700,
                  textAlign: headers[ci]?.right ? 'right' : 'left',
                  whiteSpace: 'nowrap', verticalAlign: 'middle',
                }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────
export function Pagination({ total, page, perPage, onPage, onPerPage }: {
  total: number; page: number; perPage: number;
  onPage: (p: number) => void; onPerPage: (n: number) => void;
}) {
  const totalPages = Math.ceil(total / perPage);
  if (total === 0) return null;
  const from = (page - 1) * perPage + 1;
  const to   = Math.min(page * perPage, total);

  const getPages = (): (number | '...')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (page <= 4)              return [1, 2, 3, 4, 5, '...', totalPages];
    if (page >= totalPages - 3) return [1, '...', totalPages-4, totalPages-3, totalPages-2, totalPages-1, totalPages];
    return [1, '...', page-1, page, page+1, '...', totalPages];
  };

  const pageBtn = (label: ReactNode, onClick: () => void, disabled: boolean, active = false, key?: string | number) => (
    <button key={key} onClick={onClick} disabled={disabled} style={{
      minWidth: 34, height: 34, borderRadius: tokens.radiusSm, border: '1.5px solid',
      borderColor: active ? tokens.primary : disabled ? tokens.gray200 : tokens.border,
      background: active ? tokens.primary : '#fff',
      color: active ? '#fff' : disabled ? tokens.gray300 : tokens.gray600,
      fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: font, padding: '0 6px',
      transition: 'background .15s, border-color .15s, transform .1s',
    }}
    onMouseOver={e => { if (!disabled && !active) { e.currentTarget.style.background = tokens.primaryLight; e.currentTarget.style.borderColor = tokens.primaryBorder; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
    onMouseOut={e  => { if (!disabled && !active) { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = tokens.border; e.currentTarget.style.transform = 'translateY(0)'; } }}
    >{label}</button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, flexWrap: 'wrap', gap: 12, fontFamily: font }}>
      <span style={{ fontSize: 13, color: tokens.gray500 }}>
        Menampilkan <b style={{ color: tokens.gray900 }}>{from}–{to}</b> dari <b style={{ color: tokens.gray900 }}>{total.toLocaleString()}</b> data
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {pageBtn('‹', () => onPage(page - 1), page === 1, false, 'prev')}
        {getPages().map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} style={{ width: 34, textAlign: 'center', color: tokens.gray400, fontSize: 13 }}>•••</span>
          ) : (
            pageBtn(p, () => onPage(p as number), false, p === page, `page-${p}`)
          )
        )}
        {pageBtn('›', () => onPage(page + 1), page === totalPages, false, 'next')}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: tokens.gray500 }}>
        Tampilkan
        <select value={perPage} onChange={e => { onPerPage(Number(e.target.value)); onPage(1); }} style={{
          padding: '6px 28px 6px 10px', borderRadius: tokens.radiusSm,
          border: `1.5px solid ${tokens.border}`,
          fontSize: 13, cursor: 'pointer', outline: 'none', fontFamily: font,
          background: '#fff', color: tokens.gray900,
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 8px center',
          transition: 'border-color .15s',
        }}
        onFocus={e => e.target.style.borderColor = tokens.primary}
        onBlur={e =>  e.target.style.borderColor = tokens.border}
        >
          {[10, 25, 50, 100, 250, 500].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        per halaman
      </div>
    </div>
  );
}
