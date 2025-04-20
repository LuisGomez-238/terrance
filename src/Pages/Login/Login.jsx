import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import './Login.scss';
import Footer from '../../Components/Footer/Footer';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { useLoading } from '../../contexts/LoadingContext';
import { 
  sendPasswordResetEmail 
} from 'firebase/auth';

function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedRole, setSelectedRole] = useState('finance_manager'); // Default role
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false); // New state for advanced options
  
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const { showLoading, hideLoading } = useLoading();
  
  // Add animation effect when component loads
  useEffect(() => {
    document.querySelector('.login-card').classList.add('animate-in');
  }, []);
  
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      showLoading("Logging in...");
      
      // Attempt to sign in
      await signInWithEmailAndPassword(auth, email, password);
      
      // If successful, check user role
      if (auth.currentUser) {
        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          
          if (userData.role === 'sales_manager') {
            navigate('/sales-dashboard');
          } else {
            // Default for finance managers
            navigate('/deals');
          }
        } else {
          // No user document exists, create one with default role
          console.log("User document doesn't exist, redirecting to default path");
          navigate('/deals');
        }
      }
    } catch (error) {
      console.error("Login error:", error);
      
      // Provide more specific error messages based on the error code
      if (error.code === 'auth/invalid-credential') {
        setError('Invalid email or password. Please check your credentials.');
      } else if (error.code === 'auth/user-not-found') {
        setError('No account found with this email address.');
      } else if (error.code === 'auth/wrong-password') {
        setError('Incorrect password. Please try again.');
      } else if (error.code === 'auth/too-many-requests') {
        setError('Too many failed login attempts. Please try again later.');
      } else {
        setError('Failed to log in. Please try again later.');
      }
    } finally {
      hideLoading();
    }
  };
  
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      if (isLogin) {
        // When logging in, we need to check the user's role after authentication
        const userCredential = await login(email, password);
        
        // After successful login, check user role and redirect accordingly
        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          
          if (userData.role === 'sales_manager') {
            navigate('/sales-dashboard');
          } else {
            // Default for finance managers
            navigate('/deals');
          }
        } else {
          // No user document exists, create one with default role
          console.log("User document doesn't exist, redirecting to default path");
          navigate('/deals');
        }
      } else {
        // Creating a new account
        console.log("Creating new account with role:", selectedRole);
        
        await signup(email, password, displayName, selectedRole);
        
        // Navigate based on role
        if (selectedRole === 'sales_manager') {
          navigate('/sales-dashboard');
        } else {
          navigate('/deals');
        }
      }
    } catch (err) {
      console.error("Signup/Login error:", err);
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
    setSelectedRole('finance_manager');
    setShowAdvancedOptions(false);
    
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
          
          {/* Advanced options toggle - only shown when creating account */}
          {!isLogin && (
            <div className="advanced-options-toggle">
              <button
                type="button"
                className="btn-link advanced-toggle"
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: '#4a90e2',
                  background: 'none',
                  border: 'none',
                  padding: '8px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                {showAdvancedOptions ? 'Hide Advanced Options' : 'Show Advanced Options'}
                <span className="material-icons" style={{ marginLeft: '4px', fontSize: '18px' }}>
                  {showAdvancedOptions ? 'expand_less' : 'expand_more'}
                </span>
              </button>
            </div>
          )}
          
          {/* Role selection dropdown - only shown when creating account and advanced options are shown */}
          {!isLogin && showAdvancedOptions && (
            <div className="form-group role-selector-container">
              <label htmlFor="role">Account Type</label>
              <div className="input-wrapper">
                <span className="material-icons input-icon">badge</span>
                <select
                  id="role"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="role-select"
                  style={{
                    borderColor: '#4a90e2',
                    background: '#f0f8ff',
                    fontWeight: 'bold'
                  }}
                >
                  <option value="finance_manager">Finance Manager</option>
                  <option value="sales_manager">Sales Manager</option>
                </select>
              </div>
              <div className="role-selection-info" style={{ marginTop: '4px', color: '#666' }}>
                <small>Select the appropriate account type for this user.</small>
              </div>
            </div>
          )}
          
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
      
      <Footer />
    </div>
  );
}

export default Login;