import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export const authApi = {
  register: async (username: string, email: string, password: string, display_name?: string) => {
    const { data } = await api.post<{ user: User }>('/auth/register', {
      username,
      email,
      password,
      display_name,
    });
    return data;
  },

  login: async (username: string, password: string) => {
    const { data } = await api.post<LoginResponse>('/auth/login', {
      username,
      password,
    });
    // Store token and user
    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
    }
  },

  getCurrentUser: async () => {
    const { data } = await api.get<{ user: User }>('/auth/me');
    return data.user;
  },

  updateProfile: async (updates: { display_name?: string; email?: string }) => {
    const { data } = await api.put<{ user: User }>('/auth/profile', updates);
    // Update stored user
    localStorage.setItem('user', JSON.stringify(data.user));
    return data.user;
  },

  changePassword: async (old_password: string, new_password: string) => {
    const { data } = await api.put<{ message: string }>('/auth/password', {
      old_password,
      new_password,
    });
    return data;
  },
};

export const getStoredUser = (): User | null => {
  const stored = localStorage.getItem('user');
  return stored ? JSON.parse(stored) : null;
};

export const getStoredToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

export const isAuthenticated = (): boolean => {
  return !!getStoredToken();
};

export default api;
