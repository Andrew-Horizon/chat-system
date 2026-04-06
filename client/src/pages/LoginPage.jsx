import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginApi, sendCodeApi } from '../api/auth';
import AlertModal from '../components/AlertModal';
import '../styles/auth.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '',
    password: '',
    phone: '',
    code: ''
  });
  const [loginMode, setLoginMode] = useState('password'); // 'password' or 'code'
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [alertModal, setAlertModal] = useState({
    visible: false,
    title: '提示',
    message: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({
      ...form,
      [name]: value
    });
  };

  const handleSendCode = async () => {
    if (!form.phone || !/^1[3-9]\d{9}$/.test(form.phone)) {
      setErrorMsg('请先输入正确的手机号');
      return;
    }
    
    setErrorMsg('');
    try {
      await sendCodeApi({ phone: form.phone });
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error) {
      setErrorMsg(error?.response?.data?.message || '验证码发送失败');
    }
  };

  const showAlert = (message, title = '提示') => {
    setAlertModal({
      visible: true,
      title,
      message
    });
  };

  const closeAlert = () => {
    const shouldRedirect = alertModal.message === '登录成功';

    setAlertModal((prev) => ({
      ...prev,
      visible: false
    }));

    if (shouldRedirect) {
      navigate('/');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (loginMode === 'password') {
      if (!form.username || !form.password) {
        setErrorMsg('请输入用户名和密码');
        return;
      }
    } else {
      if (!form.phone || !form.code) {
        setErrorMsg('请输入手机号和验证码');
        return;
      }
    }

    try {
      setLoading(true);
      const res = await loginApi(form);

      const { token, user } = res.data.data;

      localStorage.setItem('token', token);
      localStorage.setItem('userInfo', JSON.stringify(user));

      showAlert('登录成功');
    } catch (error) {
      setErrorMsg(error?.response?.data?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🐱</div>
        <h1 className="auth-title">登录</h1>
        <p className="auth-subtitle">欢迎登录聊天室系统</p>

        
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '20px' }}>
          <div 
            style={{ flex: 1, textAlign: 'center', padding: '10px', cursor: 'pointer', borderBottom: loginMode === 'password' ? '2px solid #4f46e5' : '2px solid transparent', color: loginMode === 'password' ? '#4f46e5' : '#64748b' }}
            onClick={() => { setLoginMode('password'); setErrorMsg(''); }}
          >
            密码登录
          </div>
          <div 
            style={{ flex: 1, textAlign: 'center', padding: '10px', cursor: 'pointer', borderBottom: loginMode === 'code' ? '2px solid #4f46e5' : '2px solid transparent', color: loginMode === 'code' ? '#4f46e5' : '#64748b' }}
            onClick={() => { setLoginMode('code'); setErrorMsg(''); }}
          >
            验证码登录
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {loginMode === 'password' ? (
            <>
              <div className="auth-form-item">
                <label>用户名</label>
                <input
                  type="text"
                  name="username"
                  placeholder="请输入用户名"
                  value={form.username}
                  onChange={handleChange}
                />
              </div>

              <div className="auth-form-item">
                <label>密码</label>
                <input
                  type="password"
                  name="password"
                  placeholder="请输入密码"
                  value={form.password}
                  onChange={handleChange}
                />
              </div>
            </>
          ) : (
            <>
              <div className="auth-form-item">
                <label>手机号</label>
                <input
                  type="text"
                  name="phone"
                  placeholder="请输入11位手机号"
                  value={form.phone}
                  onChange={handleChange}
                />
              </div>

              <div className="auth-form-item">
                <label>验证码</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    name="code"
                    placeholder="请输入6位验证码"
                    value={form.code}
                    onChange={handleChange}
                    style={{ flex: 1 }}
                  />
                  <button 
                    type="button" 
                    onClick={handleSendCode} 
                    disabled={countdown > 0}
                    style={{ 
                      borderRadius: '6px', 
                      border: 'none', 
                      backgroundColor: countdown > 0 ? '#ccc' : '#4f46e5',
                      color: 'white',
                      cursor: countdown > 0 ? 'not-allowed' : 'pointer',
                      padding: '0 12px',
                      fontSize: '13px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {countdown > 0 ? `${countdown}秒后重发` : '获取验证码'}
                  </button>
                </div>
              </div>
            </>
          )}

          {errorMsg ? <div className="auth-error">{errorMsg}</div> : null}

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <div className="auth-footer">
          <span>还没有账号？</span>
          <Link to="/register">去注册</Link>
        </div>
      </div>

      <AlertModal
        visible={alertModal.visible}
        title={alertModal.title}
        message={alertModal.message}
        onClose={closeAlert}
      />
    </div>
  );
}