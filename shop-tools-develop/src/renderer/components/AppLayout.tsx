import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { Boxes, Home, LogOut, PackagePlus, Settings, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { AuthStatus } from '../../shared/types';

const links = [
  { to: '/', label: '首页', icon: Home },
  { to: '/tasks', label: 'AI智能比价', icon: Boxes },
  { to: '/tasks/settings', label: 'AI比价配置', icon: SlidersHorizontal },
  { to: '/listing', label: 'AI智能上架', icon: PackagePlus },
  { to: '/listing/settings', label: 'AI上架配置', icon: Settings },
];

export function AppLayout() {
  const navigate = useNavigate();
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

  useEffect(() => {
    let disposed = false;
    void window.appApi.verifyAuth().then((status) => {
      if (!disposed) {
        setAuthStatus(status);
      }
    });
    const timer = window.setInterval(() => {
      void window.appApi.heartbeatAuth().then((status) => {
        if (!disposed) {
          setAuthStatus(status);
        }
      });
    }, 300_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  async function logout() {
    await window.appApi.logoutAuth();
    navigate('/login', { replace: true });
  }

  if (!authStatus) {
    return <p className="muted app-loading">正在校验登录状态...</p>;
  }

  if (!authStatus.authenticated) {
    return <Navigate to="/login" replace />;
  }

  const user = authStatus.session?.user;
  const displayName = String(
    user?.displayName ??
      user?.nickname ??
      user?.name ??
      authStatus.session?.username ??
      '已登录',
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={22} />
          </div>
          <div>
            <strong>TikTok AI Flow</strong>
            <span>1688 识图找货源</span>
          </div>
        </div>

        <nav className="nav-list">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}
              >
                <Icon size={18} />
                {link.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-note sidebar-login-card">
          <span>已登录</span>
          <strong>{displayName}</strong>
          <button className="sidebar-logout-button" type="button" onClick={() => void logout()}>
            <LogOut size={14} />
            退出登录
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
