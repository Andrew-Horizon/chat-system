import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerApi, sendCodeApi } from '../api/auth';
import '../styles/auth.css';
import AlertModal from '../components/AlertModal';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '',
    nickname: '',
    password: '',
    confirmPassword: '',
    phone: '',
    code: ''
  });
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!form.username || !form.nickname || !form.password || !form.confirmPassword || !form.phone || !form.code) {
      setErrorMsg('请完整填写注册信息');
      return;
    }

    if (!/^1[3-9]\d{9}$/.test(form.phone)) {
      setErrorMsg('手机号格式不正确');
      return;
    }

    if (form.password.length < 6) {
      setErrorMsg('密码长度不能少于6位');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setErrorMsg('两次输入的密码不一致');
      return;
    }

    try {
      setLoading(true);

      await registerApi({
        username: form.username,
        nickname: form.nickname,
        password: form.password,
        phone: form.phone,
        code: form.code
      });

      showAlert('注册成功，请登录');
    } catch (error) {
      setErrorMsg(error?.response?.data?.message || '注册失败');
    } finally {
      setLoading(false);
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
    const shouldRedirect = alertModal.message === '注册成功，请登录';

    setAlertModal((prev) => ({
      ...prev,
      visible: false
    }));

    if (shouldRedirect) {
      navigate('/login');
    }
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

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🐱</div>
        <h1 className="auth-title">创建账户</h1>
        <p className="auth-subtitle">欢迎注册聊天室系统</p>

        <form className="auth-form" onSubmit={handleSubmit}>
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
            <label>昵称</label>
            <input
              type="text"
              name="nickname"
              placeholder="请输入昵称"
              value={form.nickname}
              onChange={handleChange}
            />
          </div>

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

          <div className="auth-form-item">
            <label>确认密码</label>
            <input
              type="password"
              name="confirmPassword"
              placeholder="请再次输入密码"
              value={form.confirmPassword}
              onChange={handleChange}
            />
          </div>

          {errorMsg ? <div className="auth-error">{errorMsg}</div> : null}

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? '注册中...' : '创建账户'}
          </button>
        </form>

        <div className="auth-footer">
          <span>已有账号？</span>
          <Link to="/login">去登录</Link>
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