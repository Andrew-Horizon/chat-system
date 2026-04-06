import axios from 'axios';

const request = axios.create({
  // 自动识别环境：如果是本地开发连 3000，如果是生产环境连当前域名
  baseURL: window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin,
  timeout: 5000
});

export const registerApi = (data) => {
  return request.post('/api/auth/register', data);
};

export const loginApi = (data) => {
  return request.post('/api/auth/login', data);
};

export const sendCodeApi = (data) => {
  return request.post('/api/auth/send-code', data);
};

export const logoutApi = () => {
  const token = localStorage.getItem('token');
  return request.post('/api/auth/logout', {}, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
};