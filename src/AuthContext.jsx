import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userProfile, setUserProfile] = useState(null);
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [selectedRole, setSelectedRole] = useState('finance_manager');

  // Sign up
  async function signup(email, password, name, role = 'finance_manager') {
    console.log("Signup called with role:", role);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Update profile
      await updateProfile(userCredential.user, {
        displayName: name
      });
      
      // Log before creating the user document
      console.log("Creating user document with role:", role);
      
      // Create user document in Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        name,
        email,
        role: role,
        createdAt: serverTimestamp(),
        monthlyTarget: 0,
        ytdAvgProfit: 0,
        ytdProductsPerDeal: 0
      });
      
      return userCredential;
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }

  // Login
  async function login(email, password) {
    try {
      return await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }

  // Logout
  async function logout() {
    try {
      await signOut(auth);
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }

  // Update user profile
  async function updateUserProfile(data) {
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, data, { merge: true });
      
      if (data.displayName) {
        await updateProfile(auth.currentUser, {
          displayName: data.displayName
        });
      }
      setUserProfile(data);
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }

  function resetPassword(email) {
    return sendPasswordResetEmail(auth, email);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        // Fetch user document to get role information
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userSnapshot = await getDoc(userDocRef);
          
          if (userSnapshot.exists()) {
            const userData = userSnapshot.data();
            setUserRole(userData.role || 'finance_manager'); // Default to finance_manager if no role
            setUserProfile(userData);
          } else {
            // User document doesn't exist
            setUserRole('finance_manager'); // Default role
            setUserProfile({ role: 'finance_manager' });
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
          setUserRole('finance_manager'); // Default on error
          setUserProfile({ role: 'finance_manager' });
        }
      } else {
        setUserRole(null);
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Helper methods for role checking
  const isSalesManager = () => {
    return currentUser && userProfile && userProfile.role === 'sales_manager';
  };

  const isFinanceManager = () => {
    return currentUser && (!userProfile || !userProfile.role || userProfile.role === 'finance_manager');
  };

  const checkForSecretCode = (value) => {
    console.log("Checking email:", value);
    // Check if the email contains a secret pattern for admin/sales manager creation
    if (value.endsWith('+admin') || value.endsWith('+sm')) {
      console.log("Secret code detected! Showing role selector");
      setShowRoleSelector(true);
    } else {
      console.log("No secret code detected");
      setShowRoleSelector(false);
      // Reset role to default if secret code is removed
      setSelectedRole('finance_manager');
    }
  };

  const value = {
    currentUser,
    userRole,
    isSalesManager,
    isFinanceManager,
    loading,
    signup,
    login,
    logout,
    updateUserProfile,
    error,
    resetPassword
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}