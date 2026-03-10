'use client';

import { ReactNode } from 'react';

const font = "'DM Sans', system-ui, sans-serif";

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600,
      background: active ? '#f0fdf4' : '#fef2f2',
      color: active ? '#16a34a' : '#dc2626',
      border: `1px solid ${active ? '#bbf7d0' : '#fecaca'}`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? '#16a34a' : '#ef4444', flexShrink: 0 }} />
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
      background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%',
        maxWidth: wide ? 760 : 500,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,.18)',
        animation: 'fadeIn .2s ease',
        fontFamily: font,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: '1px solid #f1f5f9',
          position: 'sticky', top: 0, background: '#fff', zIndex: 1, borderRadius: '16px 16px 0 0',
        }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{title}</span>
          <button onClick={onClose} style={{
            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0',
            cursor: 'pointer', fontSize: 16, color: '#6b7280', lineHeight: 1,
          }}>×</button>
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
        display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280',
        marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6,
      }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {error && <p style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, fontFamily: font }}>{error}</p>}
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
        width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13.5,
        border: '1.5px solid #e2e8f0', outline: 'none',
        background: disabled ? '#f9fafb' : '#fff',
        color: disabled ? '#9ca3af' : '#111827',
        fontFamily: font, boxSizing: 'border-box',
        transition: 'border-color .15s, box-shadow .15s',
      }}
      onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,.1)'; }}
      onBlur={e =>  { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
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
      width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13.5,
      border: '1.5px solid #e2e8f0', outline: 'none',
      background: '#fff', color: '#111827',
      fontFamily: font, boxSizing: 'border-box', cursor: 'pointer',
      transition: 'border-color .15s',
    }}
    onFocus={e => { e.target.style.borderColor = '#3b82f6'; }}
    onBlur={e =>  { e.target.style.borderColor = '#e2e8f0'; }}
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
      background: disabled ? '#cbd5e1' : 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
      color: '#fff', border: 'none', borderRadius: 8,
      padding: '10px 20px', fontSize: 13, fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: font, whiteSpace: 'nowrap',
      boxShadow: disabled ? 'none' : '0 2px 8px rgba(59,130,246,.3)',
      transition: 'opacity .15s, transform .1s',
    }}
    onMouseOver={e => { if (!disabled) e.currentTarget.style.opacity = '.9'; }}
    onMouseOut={e =>  { e.currentTarget.style.opacity = '1'; }}
    >{children}</button>
  );
}

// ─── BtnGhost ─────────────────────────────────────────────────────────────────
export function BtnGhost({ onClick, children, color = 'blue', disabled }: {
  onClick: () => void; children: ReactNode;
  color?: 'blue' | 'red' | 'gray' | 'teal'; disabled?: boolean;
}) {
  const map = {
    blue: { border: '#bfdbfe', text: '#1d4ed8', hoverBg: '#eff6ff' },
    red:  { border: '#fecaca', text: '#dc2626', hoverBg: '#fef2f2' },
    gray: { border: '#e2e8f0', text: '#64748b', hoverBg: '#f8fafc' },
    teal: { border: '#99f6e4', text: '#0d9488', hoverBg: '#f0fdfa' },
  };
  const c = map[color];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: '#fff', border: `1.5px solid ${disabled ? '#e2e8f0' : c.border}`,
      borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      color: disabled ? '#94a3b8' : c.text,
      fontFamily: font, whiteSpace: 'nowrap',
      transition: 'background .15s',
    }}
    onMouseOver={e => { if (!disabled) e.currentTarget.style.background = c.hoverBg; }}
    onMouseOut={e =>  { e.currentTarget.style.background = '#fff'; }}
    >{children}</button>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
export function ConfirmDialog({ msg, onConfirm, onCancel }: {
  msg: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal title="Konfirmasi Hapus" onClose={onCancel}>
      <p style={{ color: '#4b5563', fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>{msg}</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <BtnGhost onClick={onCancel} color="gray">Batal</BtnGhost>
        <button onClick={onConfirm} style={{
          background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8,
          padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: font,
          boxShadow: '0 2px 8px rgba(220,38,38,.25)',
        }}>Hapus</button>
      </div>
    </Modal>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────
export function LoadingSpinner() {
  return (
    <div style={{ textAlign: 'center', padding: '52px 0', color: '#9ca3af', fontSize: 13.5, fontFamily: font }}>
      <div style={{
        width: 34, height: 34, border: '3px solid #e5e7eb',
        borderTop: '3px solid #3b82f6', borderRadius: '50%',
        animation: 'spin 0.75s linear infinite', margin: '0 auto 14px',
      }} />
      Memuat data...
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
export function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e8eaed', borderRadius: 12,
      padding: '14px 22px', minWidth: 140,
      boxShadow: '0 1px 3px rgba(0,0,0,.04)',
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────
export function Table({ headers, rows }: {
  headers: { label: string; right?: boolean }[];
  rows: ReactNode[][];
}) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #e8eaed', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: font }}>
        <thead>
          <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e8eaed' }}>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: '12px 16px', textAlign: h.right ? 'right' : 'left',
                fontSize: 11, fontWeight: 700, color: '#6b7280',
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
              <td colSpan={headers.length} style={{ padding: '40px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13.5 }}>
                Tidak ada data ditemukan
              </td>
            </tr>
          ) : rows.map((row, ri) => (
            <tr key={ri}
              style={{ borderBottom: '1px solid #f3f4f6', transition: 'background .1s' }}
              onMouseOver={e => (e.currentTarget.style.background = '#fafafa')}
              onMouseOut={e =>  (e.currentTarget.style.background = 'transparent')}
            >
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: '13px 16px', fontSize: 13.5, color: '#1f2937',
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

  const navBtn = (disabled: boolean) => ({
    width: 34, height: 34, borderRadius: 8,
    border: '1.5px solid #e2e8f0', background: '#fff',
    color: disabled ? '#d1d5db' : '#4b5563',
    fontSize: 14, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: font,
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, flexWrap: 'wrap', gap: 12 }}>
      <span style={{ fontSize: 13, color: '#6b7280', fontFamily: font }}>
        Menampilkan <b style={{ color: '#111827' }}>{from}–{to}</b> dari <b style={{ color: '#111827' }}>{total}</b> data
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <button onClick={() => onPage(page - 1)} disabled={page === 1} style={navBtn(page === 1)}>‹</button>
        {getPages().map((p, i) =>
          p === '...' ? (
            <span key={i} style={{ width: 34, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>•••</span>
          ) : (
            <button key={i} onClick={() => onPage(p as number)} style={{
              width: 34, height: 34, borderRadius: 8, border: '1.5px solid',
              borderColor: p === page ? '#1d4ed8' : '#e2e8f0',
              background: p === page ? '#1d4ed8' : '#fff',
              color: p === page ? '#fff' : '#4b5563',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: font,
            }}>{p}</button>
          )
        )}
        <button onClick={() => onPage(page + 1)} disabled={page === totalPages} style={navBtn(page === totalPages)}>›</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6b7280', fontFamily: font }}>
        Tampilkan
        <select value={perPage} onChange={e => { onPerPage(Number(e.target.value)); onPage(1); }} style={{
          padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0',
          fontSize: 13, cursor: 'pointer', outline: 'none', fontFamily: font,
          background: '#fff', color: '#111827',
        }}>
          {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        per halaman
      </div>
    </div>
  );
}
