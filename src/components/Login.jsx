import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    const users = {
      'admin': 'admin123',
      'manager': 'manager123',
      'staff': 'staff123'
    };

    if (users[username] && users[username] === password) {
      setError('');
      onLogin(username);
    } else {
      setError('Invalid username or password');
    }
  };

  return (
    <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '100vh', display: 'flex' }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          <ShieldCheck size={48} style={{ color: 'var(--primary)', margin: '0 auto', marginBottom: '1rem' }} />
          <h2>QRCounter Pro Login</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.9rem' }}>Please enter your credentials to access the dashboard</p>
        </div>
        
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', background: '#fee2e2', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem' }}>
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}
          
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
            />
          </div>
          
          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>
          
          <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem', width: '100%', padding: '0.75rem', fontSize: '1rem' }}>
            Login
          </button>
        </form>
        
        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: '1.5' }}>
          Demo accounts:<br/>
          admin / admin123<br/>
          manager / manager123<br/>
          staff / staff123
        </div>
      </div>
    </div>
  );
}
