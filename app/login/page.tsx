'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm]     = useState({ username: '', password: '' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!form.username || !form.password) { setError('Username dan password wajib diisi'); return; }
    setLoading(true); setError('');
    const res = await signIn('credentials', {
      username: form.username,
      password: form.password,
      redirect: false,
    });
    setLoading(false);
    if (res?.ok) { router.push('/'); router.refresh(); }
    else setError('Username atau password salah');
  };

  const roleInfo = [
    { role: 'MPC',     color: '#2563eb', bg: '#eff6ff', desc: 'Master Part Raw Material' },
    { role: 'PPC',     color: '#16a34a', bg: '#f0fdf4', desc: 'Master ASSY & Prod Plan'  },
    { role: 'DESIGN',  color: '#9333ea', bg: '#faf5ff', desc: 'Upload BOM per Periode'   },
    { role: 'FINANCE', color: '#d97706', bg: '#fffbeb', desc: 'View & Download All Data'  },
  ];

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #f0f4ff 0%, #fafafa 50%, #f0fdf4 100%)',
      fontFamily: "'DM Sans', system-ui, sans-serif", padding: 20,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::placeholder { color: #9ca3af; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
      `}</style>

      <div style={{ width: '100%', maxWidth: 440, animation: 'fadeUp .35s ease' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, margin: '0 auto 16px',
            boxShadow: '0 4px 16px rgba(59,130,246,.35)',
          }}>📋</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 6 }}>BOM Database</h1>
          <p style={{ fontSize: 13.5, color: '#6b7280' }}>Silakan login untuk melanjutkan</p>
        </div>

        {/* Card */}
        <div style={{
          background: '#fff', borderRadius: 16, padding: '32px 32px 28px',
          boxShadow: '0 4px 24px rgba(0,0,0,.08)', border: '1px solid #e8eaed',
        }}>
          {/* Username */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Username
            </label>
            <input
              value={form.username}
              onChange={e => { setForm(f => ({ ...f, username: e.target.value })); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="Masukkan username"
              style={{ width: '100%', padding: '10px 13px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', fontFamily: 'inherit', color: '#111827', background: '#fff' }}
              onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,.1)'; }}
              onBlur={e =>  { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Password
            </label>
            <input
              type="password"
              value={form.password}
              onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="Masukkan password"
              style={{ width: '100%', padding: '10px 13px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', fontFamily: 'inherit', color: '#111827', background: '#fff' }}
              onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,.1)'; }}
              onBlur={e =>  { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
              ⚠ {error}
            </div>
          )}

          {/* Button */}
          <button onClick={handleLogin} disabled={loading} style={{
            width: '100%', padding: '11px', borderRadius: 8, border: 'none',
            background: loading ? '#94a3b8' : 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
            color: '#fff', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', boxShadow: loading ? 'none' : '0 2px 8px rgba(59,130,246,.3)',
            transition: 'opacity .15s',
          }}>
            {loading ? 'Memproses...' : 'Login'}
          </button>
        </div>

        {/* Role Info */}
        <div style={{ marginTop: 24 }}>
          <p style={{ fontSize: 11.5, color: '#9ca3af', textAlign: 'center', marginBottom: 12, fontWeight: 500 }}>AKSES PER DEPARTEMEN</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {roleInfo.map(r => (
              <div key={r.role} style={{ background: r.bg, border: `1px solid ${r.color}22`, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: r.color, marginBottom: 3 }}>{r.role}</div>
                <div style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.4 }}>{r.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
