import axios from 'axios';

/**
 * Axios instance for frontend API calls
 * Configured with baseURL, interceptors for auth, and common settings.
 */
const api = axios.create({
    baseURL: "http://localhost:3002/api/v1",
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor for API calls
api.interceptors.request.use(
    async (config) => {
        // Retrieve token from localStorage (client-side only)
        if (typeof window !== 'undefined') {
            const token = localStorage.getItem('token');
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor for API calls
api.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        const originalRequest = error.config;

        // Handle 404 Not Found errors
        if (error.response?.status === 404) {
            console.error(`❌ 404 NOT FOUND: ${error.config?.method?.toUpperCase()} ${error.config?.baseURL}${error.config?.url}`);
            console.error('Response data:', error.response?.data);
        }

        // Handle 401 Unauthorized errors (session expiration, etc.)
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            console.error('Session expired or unauthorized. Please log in again.');

            // Optionally clear token and redirect to login
            /*
            if (typeof window !== 'undefined') {
              localStorage.removeItem('token');
              window.location.href = '/login';
            }
            */
        }

        return Promise.reject(error);
    }
);

export default api;
