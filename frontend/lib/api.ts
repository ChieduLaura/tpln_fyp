import axios from "axios";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

if (process.env.NEXT_PUBLIC_API_URL === undefined && typeof window !== "undefined") {
  console.warn(
    `NEXT_PUBLIC_API_URL is not set. Falling back to ${apiBaseUrl}. Set it in frontend/.env.local for production.`
  );
}

const api = axios.create({ baseURL: apiBaseUrl });

// Request interceptor: attach Bearer token from localStorage
api.interceptors.request.use(
  (config) => {
    try {
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("token");
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    } catch {
      // ignore in SSR
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: redirect to /login on 401
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
