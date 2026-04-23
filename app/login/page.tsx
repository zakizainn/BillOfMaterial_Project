'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [focused,  setFocused]  = useState<'username' | 'password' | null>(null);
  const router = useRouter();

  const handleLogin = async () => {
    if (!username || !password) { setError('Username dan password wajib diisi'); return; }
    setLoading(true); setError('');
    const res = await signIn('credentials', { username, password, redirect: false });
    if (res?.ok) {
      window.location.href = '/';
    } else {
      setError('Username atau password salah');
      setLoading(false);
    }
  };

  // ... (sisa kode UI sama persis, tidak berubah)
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      background: '#fff',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeInLeft { from { opacity:0; transform:translateX(-40px) } to { opacity:1; transform:translateX(0) } }
        @keyframes fadeInRight { from { opacity:0; transform:translateX(40px) } to { opacity:1; transform:translateX(0) } }
        @keyframes slideUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes float { 0%, 100% { transform: translateY(0px) } 50% { transform: translateY(-12px) } }
        input::placeholder { color: #cbd5e1; }
        input::-webkit-autofill {
          -webkit-box-shadow: 0 0 0 1000px #fff inset !important;
          -webkit-text-fill-color: #1e293b !important;
        }
        @media (max-width: 768px) {
          .left-section { display: none !important; }
          .right-section { flex: 1; }
        }
      `}</style>

      {/* LEFT SECTION — Branding */}
      <div
        className="left-section"
        style={{
          flex: 1,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #1e3a5f 100%)',
          padding: '60px 48px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
        }}>
        <div style={{ position: 'absolute', top: -150, left: -150, width: 500, height: 500, borderRadius: '50%', background: 'rgba(59,130,246,.1)', animation: 'float 8s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: 'rgba(37,99,235,.08)', animation: 'float 10s ease-in-out infinite 1s' }} />

        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ marginBottom: 48, animation: 'fadeInLeft .6s ease .1s backwards' }}>
            <img
              src="/yazaki-logo.jpeg"
              alt="YAZAKI Logo"
              style={{ height: 52, width: 'auto', filter: 'brightness(1.1) drop-shadow(0 2px 8px rgba(0,0,0,.2))' }}
            />
          </div>
          <h1 style={{ fontSize: 42, fontWeight: 800, color: '#fff', marginBottom: 16, letterSpacing: -1, lineHeight: 1.1, animation: 'fadeInLeft .6s ease .2s backwards' }}>
            Bill of Materials Management
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,.75)', lineHeight: 1.7, maxWidth: 380, animation: 'fadeInLeft .6s ease .3s backwards' }}>
            Platform terpusat untuk manajemen data BOM, Prod Plan, dan kalkulasi Total Usage lintas departemen Yazaki.
          </p>
        </div>
        <div style={{ position: 'relative', zIndex: 2 }} />
      </div>

      {/* RIGHT SECTION — Login Form */}
      <div
        className="right-section"
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 48px', background: '#f8fafc' }}>
        <div style={{ width: '100%', maxWidth: 380, animation: 'fadeInRight .6s ease .2s backwards' }}>
          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: '#1e293b', marginBottom: 8, letterSpacing: -0.5 }}>Masuk</h2>
            <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, fontWeight: 500 }}>
              Gunakan akun departemen Anda untuk mengakses sistem
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Username */}
            <div style={{ animation: 'slideUp .6s ease .3s backwards' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: focused === 'username' ? '#1e40af' : '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, transition: 'color .2s' }}>
                Username
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16 }}>👤</span>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  onFocus={() => setFocused('username')}
                  onBlur={() => setFocused(null)}
                  placeholder="Masukkan username Anda"
                  style={{ width: '100%', padding: '12px 16px 12px 44px', borderRadius: 10, border: focused === 'username' ? '2px solid #1e40af' : '1.5px solid #e2e8f0', fontSize: 14, fontFamily: "'DM Sans', system-ui", outline: 'none', color: '#1e293b', background: '#fff', transition: 'all .25s', boxShadow: focused === 'username' ? '0 0 0 4px rgba(30,64,175,.1)' : 'none' }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ animation: 'slideUp .6s ease .35s backwards' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: focused === 'password' ? '#1e40af' : '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, transition: 'color .2s' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16 }}>🔒</span>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  placeholder="Masukkan password Anda"
                  style={{ width: '100%', padding: '12px 16px 12px 44px', borderRadius: 10, border: focused === 'password' ? '2px solid #1e40af' : '1.5px solid #e2e8f0', fontSize: 14, fontFamily: "'DM Sans', system-ui", outline: 'none', color: '#1e293b', background: '#fff', transition: 'all .25s', boxShadow: focused === 'password' ? '0 0 0 4px rgba(30,64,175,.1)' : 'none' }}
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#991b1b', fontSize: 13, fontWeight: 500, animation: 'slideUp .3s ease' }}>
                <span style={{ fontSize: 16 }}>⚠</span>
                {error}
              </div>
            )}

            {/* Button */}
            <button
              onClick={handleLogin}
              disabled={loading}
              style={{
                width: '100%', padding: '13px 16px',
                background: loading ? 'linear-gradient(135deg, #bfdbfe 0%, #93c5fd 100%)' : 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)',
                color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', system-ui",
                boxShadow: loading ? 'none' : '0 8px 20px rgba(30,64,175,.25)',
                transition: 'all .25s', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 8, marginTop: 12,
                animation: 'slideUp .6s ease .4s backwards',
              }}
              onMouseOver={e => { if (!loading) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(30,64,175,.35)'; }}}
              onMouseOut={e =>  { if (!loading) { e.currentTarget.style.transform = 'translateY(0)';   e.currentTarget.style.boxShadow = '0 8px 20px rgba(30,64,175,.25)'; }}}
            >
              {loading ? (
                <>
                  <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                  <span>Masuk...</span>
                </>
              ) : 'Masuk'}
            </button>
          </div>

          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid #e2e8f0', textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
            <p>YAZAKI BOM Management System</p>
          </div>
        </div>
      </div>
    </div>
  );
}