import axios from 'axios';

const request = axios.create({
  baseURL: 'http://localhost:3000',
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