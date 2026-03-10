'use client';

import { useState } from 'react';
import MasterAssyPage from '@/components/MasterAssyPage';
import MasterPartPage from '@/components/MasterPartPage';

export default function Home() {
  const [page, setPage] = useState<'assy' | 'part'>('assy');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: "'Geist', 'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f0f2f5; }
        input::placeholder { color: #94a3b8; }
        @keyframes slideUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes fadeIn  { from { opacity:0; transform:scale(.98) } to { opacity:1; transform:scale(1) } }
        @keyframes spin    { to { transform: rotate(360deg) } }
      `}</style>

      {/* Navbar */}
      <nav style={{
        background: '#fff',
        borderBottom: '1px solid #e8eaed',
        padding: '0 40px',
        display: 'flex',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        height: 60,
        boxShadow: '0 1px 3px rgba(0,0,0,.06)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 40, paddingRight: 40, borderRight: '1px solid #e8eaed' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, boxShadow: '0 2px 8px rgba(59,130,246,.35)',
          }}>📋</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: '#111827', lineHeight: 1.2 }}>BOM Database</div>
            <div style={{ fontSize: 10.5, color: '#9ca3af', fontWeight: 500 }}>Master Data Input</div>
          </div>
        </div>

        {/* Tabs */}
        {([
          { key: 'assy', label: 'Master ASSY', icon: '🔩' },
          { key: 'part', label: 'Master Part',  icon: '⚙️' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setPage(t.key)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '0 18px', height: 60,
            fontSize: 13, fontWeight: page === t.key ? 600 : 500,
            color: page === t.key ? '#1d4ed8' : '#6b7280',
            borderBottom: page === t.key ? '2px solid #1d4ed8' : '2px solid transparent',
            fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 7,
            transition: 'color .15s',
          }}>
            <span style={{ fontSize: 14 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>
          Periode: Okt – Nov 2025
        </div>
      </nav>

      {/* Page Content */}
      <main style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
        {page === 'assy' && <MasterAssyPage showToast={showToast} />}
        {page === 'part' && <MasterPartPage showToast={showToast} />}
      </main>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          background: toast.type === 'success' ? '#15803d' : '#dc2626',
          color: '#fff', borderRadius: 12, padding: '13px 20px',
          fontSize: 13.5, fontWeight: 500,
          boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'slideUp .25s ease',
          fontFamily: 'inherit',
        }}>
          <span style={{ fontSize: 15 }}>{toast.type === 'success' ? '✓' : '✕'}</span>
          {toast.msg}
          <button onClick={() => setToast(null)} style={{
            background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff',
            cursor: 'pointer', marginLeft: 6, borderRadius: 6,
            width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
          }}>×</button>
        </div>
      )}
    </div>
  );
}
