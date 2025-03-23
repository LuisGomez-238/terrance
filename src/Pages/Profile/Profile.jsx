import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db } from '../../firebase';
import { useAuth } from '../../AuthContext';
import './Profile.scss';
import { useLoading } from '../../contexts/LoadingContext';

function Profile() {
  const { currentUser, updateUserProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    monthlyTarget: '',
    notifications: {
      newLenderPrograms: true,
      dailySummary: true,
      monthlyGoal: false,
      aiSuggestions: true
    }
  });
  
  // Performance stats
  const [stats, setStats] = useState({
    ytdAvgProfit: 0,
    ytdProductsPerDeal: 0
  });
  
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        setLoading(true);
        setMessage({ text: '', type: '' });
        
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          console.log("Fetched user profile:", userData);
          
          // Initialize with defaults for any missing fields
          setFormData({
            name: userData.name || currentUser.displayName || '',
            email: userData.email || currentUser.email || '',
            monthlyTarget: userData.monthlyTarget ? userData.monthlyTarget.toString() : '',
            notifications: userData.notifications ? userData.notifications : {
              newLenderPrograms: true,
              dailySummary: true,
              monthlyGoal: false,
              aiSuggestions: true
            }
          });
          
          setStats({
            ytdAvgProfit: userData.ytdAvgProfit || 0,
            ytdProductsPerDeal: userData.ytdProductsPerDeal || 0
          });
        } else {
          // No profile exists yet, use defaults from auth
          setFormData({
            name: currentUser.displayName || '',
            email: currentUser.email || '',
            monthlyTarget: '',
            notifications: {
              newLenderPrograms: true,
              dailySummary: true,
              monthlyGoal: false,
              aiSuggestions: true
            }
          });
          console.log("No existing profile found, using defaults");
        }
      } catch (err) {
        console.error("Error fetching user profile:", err);
        setMessage({
          text: 'Failed to load your profile. Please try again later.',
          type: 'error'
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserProfile();
  }, [currentUser]);
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleNotificationChange = (e) => {
    const { name, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [name]: checked
      }
    }));
  };
  
  const validateForm = () => {
    // Basic validation
    if (!formData.name.trim()) {
      setMessage({ text: 'Name is required', type: 'error' });
      return false;
    }
    
    if (showPasswordFields) {
      if (!formData.currentPassword) {
        setMessage({ text: 'Current password is required', type: 'error' });
        return false;
      }
      
      if (formData.newPassword !== formData.confirmPassword) {
        setMessage({ text: 'New passwords do not match', type: 'error' });
        return false;
      }
      
      if (formData.newPassword && formData.newPassword.length < 6) {
        setMessage({ text: 'Password must be at least 6 characters long', type: 'error' });
        return false;
      }
    }
    
    return true;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setSaving(true);
    setMessage({ text: '', type: '' });
    
    try {
      // Convert monthlyTarget to a number and ensure it's valid
      const monthlyTarget = parseInt(formData.monthlyTarget) || 0;
      
      // Create the profile data object
      const profileData = {
        name: formData.name,
        monthlyTarget: monthlyTarget,
        notifications: formData.notifications,
        updatedAt: new Date()
      };
      
      console.log('Updating profile with data:', profileData);
      
      // Actually update Firestore document
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, profileData);
      
      // Handle password change if requested
      if (showPasswordFields && formData.currentPassword && formData.newPassword) {
        try {
          const credential = EmailAuthProvider.credential(
            currentUser.email,
            formData.currentPassword
          );
          
          // Reauthenticate user
          await reauthenticateWithCredential(currentUser, credential);
          
          // Update password
          await updatePassword(currentUser, formData.newPassword);
          
          console.log('Password updated successfully');
          
          // Clear password fields
          setFormData(prev => ({
            ...prev,
            currentPassword: '',
            newPassword: '',
            confirmPassword: ''
          }));
          
          setShowPasswordFields(false);
        } catch (passwordError) {
          console.error('Error updating password:', passwordError);
          throw new Error(passwordError.message || 'Failed to update password. Please check your current password.');
        }
      }
      
      // Update displayName in Firebase Auth if needed
      if (currentUser.displayName !== formData.name) {
        if (updateUserProfile) {
          await updateUserProfile({ displayName: formData.name });
        }
      }
      
      setMessage({
        text: 'Profile updated successfully',
        type: 'success'
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({
        text: error.message || 'Error updating profile',
        type: 'error'
      });
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) {
    return <div className="loading">Loading profile data...</div>;
  }
  
  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>Profile</h1>
        <button 
          className="save-profile-btn"
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      
      {message.text && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}
      
      <form className="profile-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-section">
            <h2>Personal Information</h2>
            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                disabled
              />
              <p className="form-hint">Email cannot be changed</p>
            </div>
            
            {!showPasswordFields ? (
              <button
                type="button"
                className="show-password-btn"
                onClick={() => setShowPasswordFields(true)}
              >
                Change Password
              </button>
            ) : (
              <>
                <div className="form-group">
                  <label htmlFor="currentPassword">Current Password</label>
                  <input
                    id="currentPassword"
                    name="currentPassword"
                    type="password"
                    value={formData.currentPassword}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="newPassword">New Password</label>
                  <input
                    id="newPassword"
                    name="newPassword"
                    type="password"
                    value={formData.newPassword}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm New Password</label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                  />
                </div>
                <button
                  type="button"
                  className="cancel-password-btn"
                  onClick={() => {
                    setShowPasswordFields(false);
                    setFormData(prev => ({
                      ...prev,
                      currentPassword: '',
                      newPassword: '',
                      confirmPassword: ''
                    }));
                  }}
                >
                  Cancel Password Change
                </button>
              </>
            )}
          </div>
          
          <div className="form-section">
            <h2>Performance</h2>
            <div className="form-group">
              <label htmlFor="monthlyTarget">Monthly Target ($)</label>
              <input
                id="monthlyTarget"
                name="monthlyTarget"
                type="number"
                min="0"
                value={formData.monthlyTarget}
                onChange={handleInputChange}
              />
            </div>
            <div className="stats-group">
              <div className="stat-item">
                <span className="stat-label">YTD Average Profit</span>
                <span className="stat-value">${stats.ytdAvgProfit}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">YTD Products Per Deal</span>
                <span className="stat-value">{stats.ytdProductsPerDeal}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="form-section notifications-section">
          <h2>Notification Settings</h2>
          <div className="notifications-list">
            <div className="notification-item">
              <input
                type="checkbox"
                id="newLenderPrograms"
                name="newLenderPrograms"
                checked={formData.notifications.newLenderPrograms}
                onChange={handleNotificationChange}
              />
              <label htmlFor="newLenderPrograms">Email notifications for new lender programs</label>
            </div>
            <div className="notification-item">
              <input
                type="checkbox"
                id="dailySummary"
                name="dailySummary"
                checked={formData.notifications.dailySummary}
                onChange={handleNotificationChange}
              />
              <label htmlFor="dailySummary">Daily performance summary</label>
            </div>
            <div className="notification-item">
              <input
                type="checkbox"
                id="monthlyGoal"
                name="monthlyGoal"
                checked={formData.notifications.monthlyGoal}
                onChange={handleNotificationChange}
              />
              <label htmlFor="monthlyGoal">Monthly goal reminders</label>
            </div>
            <div className="notification-item">
              <input
                type="checkbox"
                id="aiSuggestions"
                name="aiSuggestions"
                checked={formData.notifications.aiSuggestions}
                onChange={handleNotificationChange}
              />
              <label htmlFor="aiSuggestions">AI suggestions for improving deal profitability</label>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default Profile; 