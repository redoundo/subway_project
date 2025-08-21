import React, { useState } from 'react';
import axios from 'axios';
import '../css/Login.css';
import { useParams, useNavigate } from 'react-router-dom';

/**
 * AdminLogin component
 * Handles the login process for administrators.
 */
export const AdminLogin = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async () => {
        setError('');

        try {
            // The API endpoint for admin login is assumed to be '/api/admin/login'.
            // This should be confirmed with the backend specification.
            const response = await axios.post('/api/admin/login', {
                email: email,
                pwd: password,
            });

            // The documentation mentions storing a JWT token in a cookie.
            // Typically, the server would set an HttpOnly cookie via a Set-Cookie header.
            // If the token is returned in the response body, it should be stored securely.
            localStorage.setItem('jwt_token', response.data.token);

            console.log('Admin login successful:', response.data);

            // After a successful login, redirect to the admin dashboard.
            navigate('/admin/dashboard');
        } catch (err) {
            console.error('Admin login failed:', err);
            setError('Login failed. Please check your credentials and try again.');
        }
    };

    return (
        <div className="login-container">
            <div className="login-form">
                <h2>Admin Login</h2>
                {error && <p className="error-message">{error}</p>}
                <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                <button type="submit" onClick={handleSubmit}>Login</button>
            </div>
        </div>
    );
};

/**
 * UserLogin component
 * Handles the login process for examinees and proctors via an invitation URL.
 */
export const UserLogin = () => {
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    
    // In a real application, the invitation token would be extracted from the URL.
    // For example, if the URL is /invite/join_exam/<token>, you'd use:
    const { token } = useParams(); // from react-router-dom
    const navigate = useNavigate();

    const handleSubmit = async () => {
        setError('');

        try {
            // The API endpoint for user/proctor login is assumed to be '/api/invite/login'.
            // It would likely require the invitation token from the URL and the password.
            const response = await axios.post(`/api/auth/login`, {
                invitationToken: token,
                pwd: password, email: email,
            });

            localStorage.setItem('jwt_token', response.data.token);
            // Similar to admin login, the server should handle session/token management.
            console.log('User login successful:', response.data);

            // After login, the user should be redirected to their respective dashboard
            // (e.g., examinee pre-check page or proctor monitoring dashboard).
            // The redirect path might be provided in the login response.
            const { role } = response.data;
            if (role === "examinee") navigate("/examinee/dashboard");
            else if (role === "supervisor") navigate("/supervisor/dashboard");
            else navigate("/");

        } catch (err) {
            console.error('User login failed:', err);
            setError('Login failed. Please check your password and try again.');
        }
    };

    return (
        <div className="login-container">
            <div className="login-form">
                <h2>User Login</h2>
                {error && <p className="error-message">{error}</p>}
                <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                <button type="submit" onClick={handleSubmit}>Login</button>
            </div>
        </div>
    );
};
