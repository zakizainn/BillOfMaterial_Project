'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import MasterAssyPage from '@/components/MasterAssyPage';
import MasterPartPage from '@/components/MasterPartPage';
import MasterBomPage  from '@/components/MasterBomPage';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [page, setPage] = useState<'assy' | 'part' | 'bom'>('assy');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  if (status === 'loading' || !session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #e5e7eb', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin .75s linear infinite', margin: '0 auto 14px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          Memuat...
        </div>
      </div>
    );
  }

  const role     = (session.user as { role?: string })?.role ?? '';
  const userName = session.user?.name ?? role;

  const roleColor: Record<string, string> = {
    MPC:     '#2563eb',
    PPC:     '#16a34a',
    DESIGN:  '#9333ea',
    FINANCE: '#d97706',
  };
  const roleBg: Record<string, string> = {
    MPC:     '#eff6ff',
    PPC:     '#f0fdf4',
    DESIGN:  '#faf5ff',
    FINANCE: '#fffbeb',
  };

  const tabs = [
    { key: 'assy', label: 'Master ASSY', icon: '🔩' },
    { key: 'part', label: 'Master Part',  icon: '⚙️' },
    { key: 'bom',  label: 'Master BOM',   icon: '📋' },
  ] as const;

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes slideUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes fadeIn  { from { opacity:0; transform:scale(.98) } to { opacity:1; transform:scale(1) } }
      `}</style>

      {/* Navbar */}
      <nav style={{
        background: '#fff', borderBottom: '1px solid #e8eaed',
        padding: '0 40px', display: 'flex', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 100, height: 60,
        boxShadow: '0 1px 3px rgba(0,0,0,.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 32, paddingRight: 32, borderRight: '1px solid #e8eaed' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, boxShadow: '0 2px 8px rgba(59,130,246,.3)' }}>📋</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: '#111827', lineHeight: 1.2 }}>BOM Database</div>
            <div style={{ fontSize: 10.5, color: '#9ca3af', fontWeight: 500 }}>Master Data Input</div>
          </div>
        </div>

        {tabs.map(t => (
          <button key={t.key} onClick={() => setPage(t.key)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '0 16px', height: 60, fontSize: 13,
            fontWeight: page === t.key ? 600 : 500,
            color: page === t.key ? '#1d4ed8' : '#6b7280',
            borderBottom: page === t.key ? '2px solid #1d4ed8' : '2px solid transparent',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7,
            transition: 'color .15s', whiteSpace: 'nowrap',
          }}>
            <span style={{ fontSize: 14 }}>{t.icon}</span>{t.label}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, background: roleBg[role] || '#f8fafc', border: `1px solid ${roleColor[role] || '#e2e8f0'}22` }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: roleColor[role] || '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>
              {userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', lineHeight: 1.2 }}>{userName}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: roleColor[role] || '#6b7280' }}>{role}</div>
            </div>
          </div>
          <button onClick={() => signOut({ callbackUrl: '/login' })} style={{
            background: 'none', border: '1.5px solid #e2e8f0', borderRadius: 8,
            padding: '7px 14px', fontSize: 12, fontWeight: 600, color: '#6b7280',
            cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
            transition: 'all .15s',
          }}
          onMouseOver={e => { e.currentTarget.style.borderColor = '#fca5a5'; e.currentTarget.style.color = '#dc2626'; }}
          onMouseOut={e =>  { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#6b7280'; }}
          >
            🚪 Logout
          </button>
        </div>
      </nav>

      <main style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
        {page === 'assy' && <MasterAssyPage showToast={showToast} role={role} />}
        {page === 'part' && <MasterPartPage showToast={showToast} role={role} />}
        {page === 'bom'  && <MasterBomPage  showToast={showToast} role={role} />}
      </main>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          background: toast.type === 'success' ? '#15803d' : '#dc2626',
          color: '#fff', borderRadius: 12, padding: '13px 20px',
          fontSize: 13.5, fontWeight: 500, boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'slideUp .25s ease', fontFamily: 'inherit',
        }}>
          <span style={{ fontSize: 15 }}>{toast.type === 'success' ? '✓' : '✕'}</span>
          {toast.msg}
          <button onClick={() => setToast(null)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', cursor: 'pointer', marginLeft: 6, borderRadius: 6, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>×</button>
        </div>
      )}
    </div>
  );
}
