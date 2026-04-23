'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import Sidebar        from '@/components/Sidebar';
import MasterAssyPage from '@/components/MasterAssyPage';
import MasterPartPage from '@/components/MasterPartPage';
import MasterBomPage  from '@/components/MasterBomPage';
import ProdPlanPage   from '@/components/ProdPlanPage';

export default function Home() {
  const { data: session, status } = useSession();
  const [page, setPage] = useState<'assy' | 'part' | 'bom' | 'prodplan'>('assy');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // ✅ DIHAPUS: useEffect redirect — sekarang middleware yang handle ini server-side
  // Tidak perlu lagi: if (status === 'unauthenticated') router.push('/login')

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

  // ✅ Tampilkan loading HANYA saat status masih 'loading'
  // Kalau 'unauthenticated', middleware sudah redirect ke /login sebelum sampai sini
  if (status === 'loading') {
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

  // ✅ Guard: kalau tidak ada session (seharusnya tidak pernah terjadi karena middleware)
  // tapi ini sebagai safety net
  if (!session) return null;

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

      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        currentPage={page}
        onPageChange={(newPage) => {
          if (newPage === 'report') {
            window.location.href = '/report';
          } else {
            setPage(newPage);
          }
        }}
        isMobile={isMobile}
      />

      {/* Main Content */}
      <div style={{ 
        flex: 1,
        display: 'flex', 
        flexDirection: 'column', 
        overflow: 'auto',
        width: '100%',
        position: 'relative',
      }}>
        {/* Top Header - Fixed with Glassmorphism effect */}
        <header style={{
          background: 'rgba(248, 250, 252, 0.5)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: 'none',
          padding: '12px 24px', 
          display: 'flex', 
          alignItems: 'center',
          justifyContent: 'flex-end', 
          height: 56,
          position: 'fixed', 
          top: 0, 
          right: 0,
          left: isMobile ? 0 : (sidebarOpen ? 260 : 72),
          zIndex: 100,
          transition: 'left 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
        }}>
          {/* Mobile hamburger button and title */}
          {isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 'auto' }}>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                style={{
                  background: 'rgba(255, 255, 255, 0.8)',
                  border: '1px solid rgba(226, 232, 240, 0.8)',
                  borderRadius: 10,
                  padding: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748b',
                  transition: 'all 0.2s',
                }}
                onMouseOver={e => { e.currentTarget.style.background = 'rgba(241, 245, 249, 0.9)'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)'; e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.8)'; }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 20, height: 20 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
              <h1 style={{
                fontSize: 15,
                fontWeight: 600,
                color: '#334155',
                margin: 0,
              }}>
                {page === 'assy' && 'Master ASSY'}
                {page === 'part' && 'Master Part'}
                {page === 'bom' && 'Master BOM'}
                {page === 'prodplan' && 'Prod Plan'}
              </h1>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              style={{
                background: 'rgba(255, 255, 255, 0.8)', 
                border: '1px solid rgba(226, 232, 240, 0.8)', 
                borderRadius: 10,
                padding: '8px 16px', 
                fontSize: 13, 
                fontWeight: 500, 
                color: '#64748b',
                cursor: 'pointer', 
                fontFamily: 'inherit', 
                display: 'flex',
                alignItems: 'center', 
                gap: 8, 
                transition: 'all .2s',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
              onMouseOver={e => { 
                e.currentTarget.style.borderColor = '#fecaca'; 
                e.currentTarget.style.background = '#fef2f2'; 
                e.currentTarget.style.color = '#dc2626'; 
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(220, 38, 38, 0.15)';
              }}
              onMouseOut={e => { 
                e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.8)'; 
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)'; 
                e.currentTarget.style.color = '#64748b'; 
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 16, height: 16 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
              {!isMobile && 'Logout'}
            </button>
          </div>
        </header>

        {/* Main Content Area - with top padding for fixed header */}
        <main style={{ 
          flex: 1, 
          padding: isMobile ? '72px 12px 16px' : '80px 28px 24px',
        }}>
          {page === 'assy'     && <MasterAssyPage showToast={showToast} role={role} />}
          {page === 'part'     && <MasterPartPage showToast={showToast} role={role} />}
          {page === 'bom'      && <MasterBomPage  showToast={showToast} role={role} />}
          {page === 'prodplan' && <ProdPlanPage   showToast={showToast} role={role} />}
        </main>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 10000,
          background: toast.type === 'success' ? '#15803d' : '#dc2626',
          color: '#fff', borderRadius: 10, padding: '12px 18px',
          fontSize: 13.5, fontWeight: 500,
          boxShadow: '0 10px 28px rgba(0,0,0,.2)',
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'slideUp .25s ease', fontFamily: 'inherit',
        }}>
          <span style={{ fontSize: 16 }}>{toast.type === 'success' ? '✓' : '✕'}</span>
          {toast.msg}
          <button
            onClick={() => setToast(null)}
            style={{
              background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff',
              cursor: 'pointer', marginLeft: 6, borderRadius: 5,
              width: 20, height: 20, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 14, padding: 0, transition: 'background .2s',
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,.3)'}
            onMouseOut={e =>  e.currentTarget.style.background = 'rgba(255,255,255,.2)'}
          >×</button>
        </div>
      )}
    </div>
  );
}
