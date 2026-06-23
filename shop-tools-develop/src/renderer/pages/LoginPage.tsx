import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { KeyRound, LogIn } from 'lucide-react';
import type { AuthStatus } from '../../shared/types';

export function LoginPage() {
  const navigate = useNavigate();
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let disposed = false;
    void window.appApi.getAuthStatus().then((status) => {
      if (!disposed) {
        setAuthStatus(status);
      }
    });
    return () => {
      disposed = true;
    };
  }, []);

  async function submitLogin() {
    if (!username.trim() || !password) {
      setMessage('请输入账号和密码');
      return;
    }

    setIsSubmitting(true);
    try {
      const status = await window.appApi.loginAuth({
        username,
        password,
      });
      setAuthStatus(status);
      if (status.authenticated) {
        navigate('/', { replace: true });
        return;
      }
      setMessage(status.message || '登录失败');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '登录失败');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!authStatus) {
    return <p className="muted app-loading">正在读取登录状态...</p>;
  }

  if (authStatus.authenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-mark">
          <KeyRound size={24} />
        </div>
        <div>
          <span className="eyebrow">Account</span>
          <h1>TikTok AI Flow</h1>
          <p>请输入账号和密码登录正式客户端。</p>
        </div>

        <label className="field">
          <span>账号</span>
          <input
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void submitLogin();
              }
            }}
          />
        </label>

        <label className="field">
          <span>密码</span>
          <input
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void submitLogin();
              }
            }}
          />
        </label>

        {message ? <p className="warning-message">{message}</p> : null}

        <button
          className="primary-button full-width"
          type="button"
          disabled={isSubmitting}
          onClick={() => void submitLogin()}
        >
          <LogIn size={18} />
          {isSubmitting ? '登录中...' : '登录'}
        </button>
      </section>
    </main>
  );
}
