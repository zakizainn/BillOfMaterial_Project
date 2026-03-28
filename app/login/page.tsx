'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const router = useRouter();

  const handleLogin = async () => {
    if (!username || !password) { setError('Username dan password wajib diisi'); return; }
    setLoading(true); setError('');
    const res = await signIn('credentials', { username, password, redirect: false });
    if (res?.ok) {
      router.push('/');
    } else {
      setError('Username atau password salah');
    }
    setLoading(false);
  };

  const roles = [
    { role: 'MPC',     color: '#2563eb', bg: '#eff6ff', desc: 'Master Part' },
    { role: 'PPC',     color: '#16a34a', bg: '#f0fdf4', desc: 'Master ASSY' },
    { role: 'DESIGN',  color: '#7c3aed', bg: '#faf5ff', desc: 'Upload BOM'  },
    { role: 'FINANCE', color: '#d97706', bg: '#fffbeb', desc: 'Prod Plan'   },
  ];

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      background: '#f8fafc',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
        input::placeholder { color: #9ca3af; }
      `}</style>

      {/* Left panel — branding */}
      <div style={{
        flex: 1, display: 'none',
        background: 'linear-gradient(145deg, #1e3a5f 0%, #1d4ed8 50%, #2563eb 100%)',
        padding: '60px 48px', flexDirection: 'column', justifyContent: 'space-between',
        position: 'relative', overflow: 'hidden',
      }} className="left-panel">
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320, borderRadius: '50%', background: 'rgba(255,255,255,.06)' }} />
        <div style={{ position: 'absolute', bottom: -60, left: -60, width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,.04)' }} />
        <div style={{ position: 'absolute', top: '40%', right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,.03)' }} />

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 60 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, border: '1px solid rgba(255,255,255,.2)' }}>📋</div>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: -0.3 }}>BOM Database</span>
          </div>

          <h1 style={{ color: '#fff', fontSize: 38, fontWeight: 800, lineHeight: 1.2, letterSpacing: -1, marginBottom: 16 }}>
            Bill of Materials<br />Management
          </h1>
          <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 15, lineHeight: 1.7, maxWidth: 340 }}>
            Platform terpusat untuk manajemen data BOM, Prod Plan, dan kalkulasi Total Usage lintas departemen.
          </p>
        </div>

        <div>
          <div style={{ marginBottom: 24, color: 'rgba(255,255,255,.5)', fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Akses per Departemen</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {roles.map(r => (
              <div key={r.role} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.1)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>{r.role[0]}</div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 13, letterSpacing: 0.2 }}>{r.role}</div>
                  <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 11.5 }}>{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div style={{
        width: '100%', maxWidth: 480,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 32px',
        margin: '0 auto',
      }}>
        <div style={{ width: '100%', animation: 'fadeUp .4s ease' }}>
          {/* Logo mobile */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 4px 12px rgba(37,99,235,.3)' }}>📋</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#111827', letterSpacing: -0.3 }}>BOM Database</div>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>Master Data Input System</div>
            </div>
          </div>

          <h2 style={{ fontSize: 26, fontWeight: 800, color: '#111827', marginBottom: 6, letterSpacing: -0.5 }}>Selamat Datang</h2>
          <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 32, lineHeight: 1.5 }}>Masuk dengan akun departemen Anda</p>

          {/* Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.7 }}>Username</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: '#9ca3af' }}>👤</span>
                <input
                  value={username} onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  placeholder="Masukkan username"
                  style={{
                    width: '100%', padding: '11px 12px 11px 38px',
                    borderRadius: 9, border: '1.5px solid #e2e8f0',
                    fontSize: 14, fontFamily: "'DM Sans', system-ui", outline: 'none',
                    color: '#111827', background: '#fff',
                    transition: 'border-color .15s, box-shadow .15s',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,.1)'; }}
                  onBlur={e =>  { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.7 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: '#9ca3af' }}>🔒</span>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  placeholder="Masukkan password"
                  style={{
                    width: '100%', padding: '11px 12px 11px 38px',
                    borderRadius: 9, border: '1.5px solid #e2e8f0',
                    fontSize: 14, fontFamily: "'DM Sans', system-ui", outline: 'none',
                    color: '#111827', background: '#fff',
                    transition: 'border-color .15s, box-shadow .15s',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,.1)'; }}
                  onBlur={e =>  { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
            </div>

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, fontWeight: 500 }}>
                <span>⚠</span> {error}
              </div>
            )}

            <button onClick={handleLogin} disabled={loading} style={{
              width: '100%', padding: '12px',
              background: loading ? '#93c5fd' : 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
              color: '#fff', border: 'none', borderRadius: 9,
              fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: "'DM Sans', system-ui",
              boxShadow: '0 4px 14px rgba(37,99,235,.3)',
              transition: 'opacity .15s, transform .1s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              marginTop: 4,
            }}
            onMouseOver={e => { if (!loading) { e.currentTarget.style.opacity = '.93'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
            onMouseOut={e =>  { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {loading ? (
                <>
                  <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.4)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                  Masuk...
                </>
              ) : 'Masuk'}
            </button>
          </div>


        </div>
      </div>
    </div>
  );
}
