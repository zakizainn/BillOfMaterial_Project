'use client';

import { useSession } from 'next-auth/react';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  currentPage: 'assy' | 'part' | 'bom' | 'prodplan' | 'report';
  onPageChange: (page: 'assy' | 'part' | 'bom' | 'prodplan' | 'report') => void;
  isMobile: boolean;
  onLogout: () => void;
}

const tabs = [
  { key: 'assy', label: 'Master ASSY', icon: 'M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75' },
  { key: 'part', label: 'Master Part', icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z' },
  { key: 'bom', label: 'Master BOM', icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z' },
  { key: 'prodplan', label: 'Prod Plan', icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z' },
  { key: 'report', label: 'Report', icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z' },
] as const;

const roleColor: Record<string, string> = {
  MPC: '#0f766e',
  PPC: '#166534',
  DESIGN: '#6b21a8',
  FINANCE: '#b45309',
};

const roleBg: Record<string, string> = {
  MPC: '#f0fdfa',
  PPC: '#f0fdf4',
  DESIGN: '#faf5ff',
  FINANCE: '#fffbeb',
};

function MenuIcon({ path, isActive, roleColorValue }: { path: string; isActive: boolean; roleColorValue: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      style={{
        width: 20,
        height: 20,
        color: isActive ? roleColorValue : '#64748b',
        flexShrink: 0,
      }}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

export default function Sidebar({
  isOpen,
  onToggle,
  currentPage,
  onPageChange,
  isMobile,
  onLogout,
}: SidebarProps) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? '';
  const userName = session?.user?.name ?? role;
  const currentRoleColor = roleColor[role] || '#0f766e';
  const currentRoleBg = roleBg[role] || '#f0fdfa';

  const sidebarWidth = isOpen ? 260 : 72;

  return (
    <>
      {/* Sidebar Spacer - maintains layout space for fixed sidebar */}
      {!isMobile && (
        <div
          style={{
            width: sidebarWidth,
            minWidth: sidebarWidth,
            flexShrink: 0,
            transition: 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      )}

      {/* Sidebar - Fixed Position */}
      <aside
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: sidebarWidth,
          height: '100vh',
          background: 'linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)',
          borderRight: 'none',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
          transition: 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
          boxShadow: '1px 0 20px rgba(0,0,0,0.03)',
          transform: isMobile && !isOpen ? 'translateX(-100%)' : 'translateX(0)',
          opacity: isMobile && !isOpen ? 0 : 1,
        }}
      >
        {/* Sidebar Header */}
        <div
          style={{
            padding: isOpen ? '16px' : '12px 8px',
            borderBottom: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: 12,
            flexShrink: 0,
            background: 'transparent',
            transition: 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
            position: 'relative',
          }}
        >
          {/* User Role at Top (moved from bottom) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isOpen ? 'flex-start' : 'center',
              gap: isOpen ? 12 : 0,
              padding: isOpen ? '12px 14px' : '8px',
              borderRadius: 12,
              background: isOpen ? currentRoleBg : 'transparent',
              border: isOpen ? `1px solid ${currentRoleColor}20` : 'none',
              width: isOpen ? 'calc(100% - 16px)' : 'auto',
              boxSizing: 'border-box',
              minHeight: isOpen ? 56 : 'auto',
              transition: 'all 0.2s ease',
              marginLeft: isOpen ? 8 : 0,
              marginRight: isOpen ? 8 : 0,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: `linear-gradient(135deg, ${currentRoleColor} 0%, ${currentRoleColor}cc 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                flexShrink: 0,
                boxShadow: `0 2px 8px ${currentRoleColor}40`,
              }}
            >
              {userName.charAt(0).toUpperCase()}
            </div>
            {isOpen && (
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#1e293b',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.4,
                  }}
                >
                  {userName}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: currentRoleColor,
                    lineHeight: 1.3,
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: currentRoleColor,
                    flexShrink: 0,
                  }} />
                  {role}
                </div>
              </div>
            )}
          </div>

          {/* Toggle button - Arrow icon on the side */}
          <button
            onClick={onToggle}
            style={{
              position: 'absolute',
              right: -12,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'rgba(241, 245, 249, 0.9)',
              border: '1px solid rgba(226, 232, 240, 0.6)',
              cursor: 'pointer',
              padding: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              color: '#64748b',
              transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
              flexShrink: 0,
              width: 24,
              height: 24,
              zIndex: 10,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(226, 232, 240, 0.95)';
              e.currentTarget.style.color = '#334155';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(241, 245, 249, 0.9)';
              e.currentTarget.style.color = '#64748b';
            }}
            title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              style={{
                width: 12,
                height: 12,
                transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        </div>

        {/* Navigation Label */}
        {isOpen && (
          <div style={{
            padding: '8px 16px 8px',
            fontSize: 11,
            fontWeight: 600,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            Menu
          </div>
        )}

        {/* Sidebar Menu */}
        <nav
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            padding: isOpen ? '0 12px' : '8px 8px 12px',
            gap: 4,
          }}
        >
          {tabs.map((t) => {
            const isActive = currentPage === t.key;
            return (
              <button
                key={t.key}
                onClick={() => {
                  onPageChange(t.key as any);
                  if (isMobile && isOpen) {
                    onToggle();
                  }
                }}
                style={{
                  width: '100%',
                  background: isActive ? currentRoleBg : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: isOpen ? '12px 14px' : '12px 0',
                  textAlign: isOpen ? 'left' : 'center',
                  fontSize: 13.5,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? currentRoleColor : '#64748b',
                  borderRadius: 12,
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: isOpen ? 'flex-start' : 'center',
                  gap: isOpen ? 12 : 0,
                  transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                  minHeight: 44,
                  flexShrink: 0,
                  position: 'relative',
                  boxShadow: isActive ? `0 2px 8px ${currentRoleColor}15` : 'none',
                }}
                onMouseOver={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'rgba(241, 245, 249, 0.8)';
                    e.currentTarget.style.color = '#334155';
                    e.currentTarget.style.transform = 'translateX(2px)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#64748b';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }
                }}
              >
                {isActive && (
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 3,
                    height: 20,
                    background: currentRoleColor,
                    borderRadius: '0 3px 3px 0',
                  }} />
                )}
                <MenuIcon path={t.icon} isActive={isActive} roleColorValue={currentRoleColor} />
                {isOpen && (
                  <span style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                  }}>
                    {t.label}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer - Logout Button (Always at bottom) */}
        <div
          style={{
            padding: isOpen ? '12px 16px' : '12px 8px',
            borderTop: 'none',
            background: 'transparent',
            flexShrink: 0,
            transition: 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <button
            onClick={onLogout}
            style={{
              width: isOpen ? 'calc(100% - 0px)' : 'calc(100% - 0px)',
              background: '#ef4444',
              border: '1px solid #ef4444',
              borderRadius: 12,
              padding: isOpen ? '12px 14px' : '12px 8px',
              cursor: 'pointer',
              fontSize: 13.5,
              fontWeight: 500,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isOpen ? 'flex-start' : 'center',
              gap: isOpen ? 10 : 0,
              fontFamily: 'inherit',
              transition: 'all .2s',
              minHeight: 44,
              boxSizing: 'border-box',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#dc2626';
              e.currentTarget.style.borderColor = '#dc2626';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.4)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#ef4444';
              e.currentTarget.style.borderColor = '#ef4444';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(239, 68, 68, 0.3)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              fill="none" 
              viewBox="0 0 24 24" 
              strokeWidth={1.5} 
              stroke="currentColor" 
              style={{ width: 16, height: 16, flexShrink: 0 }}
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" 
              />
            </svg>
            {isOpen && 'Logout'}
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isMobile && isOpen && (
        <div
          onClick={onToggle}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 999,
            animation: 'fadeIn 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      )}
    </>
  );
}
