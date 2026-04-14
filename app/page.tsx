'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import MasterAssyPage from '@/components/MasterAssyPage';
import MasterPartPage from '@/components/MasterPartPage';
import MasterBomPage  from '@/components/MasterBomPage';
import ProdPlanPage   from '@/components/ProdPlanPage';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [page, setPage] = useState<'assy' | 'part' | 'bom' | 'prodplan'>('assy');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  if (status === 'loading' || !session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <div style={{ textAlign: 'center', color: '#475569' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTop: '3px solid #0f766e', borderRadius: '50%', animation: 'spin .75s linear infinite', margin: '0 auto 16px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <p style={{ fontSize: 14, fontWeight: 500 }}>Memuat...</p>
        </div>
      </div>
    );
  }

  const role = (session.user as { role?: string })?.role ?? '';
  const userName = session.user?.name ?? role;

  const roleColor: Record<string, string> = {
    MPC:     '#0f766e',
    PPC:     '#166534',
    DESIGN:  '#6b21a8',
    FINANCE: '#b45309',
  };
  const roleBg: Record<string, string> = {
    MPC:     '#f0fdfa',
    PPC:     '#f0fdf4',
    DESIGN:  '#faf5ff',
    FINANCE: '#fffbeb',
  };

  const tabs = [
    { key: 'assy',     label: 'Master ASSY', icon: '🔩' },
    { key: 'part',     label: 'Master Part',  icon: '⚙️' },
    { key: 'bom',      label: 'Master BOM',   icon: '📋' },
    { key: 'prodplan', label: 'Prod Plan',    icon: '📅' },
  ] as const;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'DM Sans', system-ui, sans-serif", display: 'flex' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes slideUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes fadeIn  { from { opacity:0; transform:scale(.98) } to { opacity:1; transform:scale(1) } }
        @keyframes slideIn { from { transform: translateX(-100%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes slideOut { from { transform: translateX(0); opacity: 1 } to { transform: translateX(-100%); opacity: 0 } }
      `}</style>

      {/* Sidebar */}
      <aside style={{
        width: sidebarOpen ? 260 : 0,
        background: '#fff',
        borderRight: '1px solid #e2e8f0',
        position: isMobile ? 'fixed' : 'relative',
        height: isMobile ? '100vh' : '100vh',
        zIndex: isMobile ? 999 : 'auto',
        overflow: 'hidden',
        transition: 'width .3s ease, opacity .3s ease',
        opacity: sidebarOpen ? 1 : 0,
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Sidebar Header */}
        <div style={{ padding: '20px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #0f766e, #14b8a6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 2px 8px rgba(15,118,110,.24)', flexShrink: 0 }}>📋</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', lineHeight: 1.1 }}>BOM</div>
              <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>Database</div>
            </div>
          </div>
        </div>

        {/* Sidebar Menu */}
        <nav style={{ flex: 1, overflow: 'auto', padding: '12px 0' }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => {
                setPage(t.key);
                if (isMobile) setSidebarOpen(false);
              }}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '10px 14px',
                textAlign: 'left',
                fontSize: 13.5,
                fontWeight: page === t.key ? 600 : 500,
                color: page === t.key ? roleColor[role] || '#0f766e' : '#64748b',
                borderLeft: page === t.key ? '3px solid ' + (roleColor[role] || '#0f766e') : '3px solid transparent',
                background: page === t.key ? (roleBg[role] || '#f0fdfa') : 'transparent',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                transition: 'all .2s',
                marginBottom: '2px',
              }}
              onMouseOver={e => {
                if (page !== t.key) {
                  e.currentTarget.style.background = '#f1f5f9';
                }
              }}
              onMouseOut={e => {
                if (page !== t.key) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}

          <Link href="/report" style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            fontSize: 13.5,
            fontWeight: 500,
            color: '#64748b',
            textDecoration: 'none',
            borderLeft: '3px solid transparent',
            background: 'transparent',
            fontFamily: 'inherit',
            transition: 'all .2s',
            marginTop: '2px',
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = '#f1f5f9';
            e.currentTarget.style.color = roleColor[role] || '#0f766e';
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#64748b';
          }}
          onClick={() => {
            if (isMobile) setSidebarOpen(false);
          }}
          >
            <span style={{ fontSize: 16 }}>📊</span>
            <span>Report</span>
          </Link>
        </nav>

        {/* Sidebar Footer - User Info */}
        <div style={{ padding: '14px 14px', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: roleBg[role] || '#f8fafc' }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: roleColor[role] || '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              {userName.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: roleColor[role] || '#475569' }}>{role}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,.5)',
            zIndex: 998,
            animation: 'fadeIn .2s ease',
          }}
        />
      )}

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top Header */}
        <header style={{
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 60,
          position: 'sticky',
          top: 0,
          zIndex: 50,
          boxShadow: '0 1px 0 rgba(0,0,0,.04)',
        }}>
          {/* Mobile Menu Button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              color: '#64748b',
              fontSize: 20,
              transition: 'all .2s',
              marginRight: 12,
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = '#f1f5f9';
              e.currentTarget.style.color = '#0f766e';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = '#64748b';
            }}
          >
            ☰
          </button>

          <div style={{ flex: 1 }} />

          {/* Right Section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              style={{
                background: 'none',
                border: '1.5px solid #e2e8f0',
                borderRadius: 7,
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                color: '#dc2626',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all .2s',
              }}
              onMouseOver={e => {
                e.currentTarget.style.borderColor = '#fecaca';
                e.currentTarget.style.background = '#fef2f2';
              }}
              onMouseOut={e => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.background = 'none';
              }}
            >
              🚪 Logout
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main style={{ flex: 1, overflow: 'auto', padding: isMobile ? '20px' : '28px 32px' }}>
          {page === 'assy' && <MasterAssyPage showToast={showToast} role={role} />}
          {page === 'part' && <MasterPartPage showToast={showToast} role={role} />}
          {page === 'bom' && <MasterBomPage showToast={showToast} role={role} />}
          {page === 'prodplan' && <ProdPlanPage showToast={showToast} role={role} />}
        </main>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 10000,
          background: toast.type === 'success' ? '#15803d' : '#dc2626',
          color: '#fff',
          borderRadius: 10,
          padding: '12px 18px',
          fontSize: 13.5,
          fontWeight: 500,
          boxShadow: '0 10px 28px rgba(0,0,0,.2)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          animation: 'slideUp .25s ease',
          fontFamily: 'inherit',
        }}>
          <span style={{ fontSize: 16 }}>{toast.type === 'success' ? '✓' : '✕'}</span>
          {toast.msg}
          <button
            onClick={() => setToast(null)}
            style={{
              background: 'rgba(255,255,255,.2)',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              marginLeft: 6,
              borderRadius: 5,
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              padding: 0,
              transition: 'background .2s',
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,.3)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,.2)';
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}