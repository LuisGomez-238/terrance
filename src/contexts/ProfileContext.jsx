import React, { createContext, useState, useContext, useEffect } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';

// Create the context
const ProfileContext = createContext();

// Custom hook to use the profile context
export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}

// Provider component
export function ProfileProvider({ children }) {
  const { currentUser } = useAuth();
  const [userProfile, setUserProfile] = useState({
    monthlyTarget: 10000, // Default value
    name: '',
    notifications: {
      newLenderPrograms: true,
      dailySummary: true,
      monthlyGoal: false,
      aiSuggestions: true
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    // Set up a real-time listener for the user's profile
    const userDocRef = doc(db, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(
      userDocRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          console.log('Profile data updated:', data);
          setUserProfile({
            ...userProfile,
            ...data,
            // Ensure monthlyTarget is always a number
            monthlyTarget: data.monthlyTarget ? Number(data.monthlyTarget) : 10000
          });
        } else {
          console.log('No profile document found, using defaults');
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching profile:', error);
        setLoading(false);
      }
    );

    // Clean up
    return () => unsubscribe();
  }, [currentUser]);

  const value = {
    userProfile,
    loading
  };

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
} 