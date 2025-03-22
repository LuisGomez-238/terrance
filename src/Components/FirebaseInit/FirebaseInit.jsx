import React, { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

function FirebaseInit({ children }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    const initializeFirebase = async () => {
      try {
        // Initialize Auth listener
        const auth = getAuth();
        
        // Enable offline persistence if needed
        const db = getFirestore();
        try {
          await enableIndexedDbPersistence(db);
          // Offline persistence enabled successfully
        } catch (err) {
          if (err.code === 'failed-precondition') {
            // Multiple tabs open, persistence can only be enabled in one tab at a time
            console.warn('Firebase persistence could not be enabled: Multiple tabs open');
          } else if (err.code === 'unimplemented') {
            // The current browser does not support all of the features required
            console.warn('Firebase persistence is not available in this browser');
          }
          // Continue without persistence
        }
        
        // Setup auth state change listener
        const unsubscribe = onAuthStateChanged(auth, () => {
          setIsInitialized(true);
        });
        
        // Clean up the listener when component unmounts
        return () => unsubscribe();
      } catch (err) {
        console.error('Firebase initialization error:', err);
        setError(err.message);
        setIsInitialized(true); // Set to true so the app can show an error message
      }
    };
    
    initializeFirebase();
  }, []);
  
  if (error) {
    return (
      <div className="firebase-error">
        <h2>Error Initializing Application</h2>
        <p>Sorry, we encountered a problem connecting to our services.</p>
        <p className="error-message">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="retry-button"
        >
          Retry
        </button>
      </div>
    );
  }
  
  if (!isInitialized) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
        <p>Loading application...</p>
      </div>
    );
  }
  
  return children;
}

export default FirebaseInit;