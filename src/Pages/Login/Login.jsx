import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import './Login.scss';

function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  
  // Add animation effect when component loads
  useEffect(() => {
    document.querySelector('.login-card').classList.add('animate-in');
  }, []);
  
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signup(email, password, displayName);
      }
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to authenticate');
    } finally {
      setLoading(false);
    }
  }
  
  function toggleForm() {
    // Reset form fields when switching
    setError('');
    setEmail('');
    setPassword('');
    setDisplayName('');
    
    // Apply transition effect
    const loginCard = document.querySelector('.login-card');
    loginCard.classList.add('flip');
    
    setTimeout(() => {
      setIsLogin(!isLogin);
      loginCard.classList.remove('flip');
    }, 200);
  }
  
  return (
    <div className="login-container">
      <div className="login-background">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
      </div>
      
      <div className="login-card">
        <div className="brand-logo">
          <span className="logo-text">F<span>&</span>I</span>
          <div className="logo-subtext">Finance Manager Assistant</div>
        </div>
        
        <div className="login-header">
          <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
          <p className="header-subtitle">
            {isLogin 
              ? 'Enter your credentials to access your account' 
              : 'Fill out the form below to create your account'}
          </p>
        </div>
        
        {error && (
          <div className="alert alert-error">
            <span className="material-icons">error_outline</span>
            <span>{error}</span>
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="form-group">
              <label htmlFor="displayName">Full Name</label>
              <div className="input-wrapper">
                <span className="material-icons input-icon">person</span>
                <input
                  type="text"
                  id="displayName"
                  placeholder="Enter your full name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <div className="input-wrapper">
              <span className="material-icons input-icon">email</span>
              <input
                type="email"
                id="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <span className="material-icons input-icon">lock</span>
              <input
                type={passwordVisible ? "text" : "password"}
                id="password"
                placeholder={isLogin ? "Enter your password" : "Create a password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength="6"
              />
              <button 
                type="button"
                className="password-toggle"
                onClick={() => setPasswordVisible(!passwordVisible)}
              >
                <span className="material-icons">
                  {passwordVisible ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
          </div>
          
          {isLogin && (
            <div className="form-options">
              <div className="remember-me">
                <input type="checkbox" id="remember" />
                <label htmlFor="remember">Remember me</label>
              </div>
              <a href="#" className="forgot-password">Forgot password?</a>
            </div>
          )}
          
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? (
              <div className="loading-spinner">
                <div className="spinner"></div>
                <span>Processing...</span>
              </div>
            ) : (
              isLogin ? 'Sign In' : 'Create Account'
            )}
          </button>
        </form>
        
        <div className="login-footer">
          <p>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button 
              type="button"
              className="btn-link"
              onClick={toggleForm}
            >
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;