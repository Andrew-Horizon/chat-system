import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginApi } from '../api/auth';
import AlertModal from '../components/AlertModal';
import '../styles/auth.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '',
    password: ''
  });
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

    if (!form.username || !form.password) {
      setErrorMsg('请输入用户名和密码');
      return;
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
            <label>密码</label>
            <input
              type="password"
              name="password"
              placeholder="请输入密码"
              value={form.password}
              onChange={handleChange}
            />
          </div>

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