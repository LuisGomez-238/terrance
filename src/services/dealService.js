import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  getDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  startAfter,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';

const DEALS_COLLECTION = 'deals';

// Create a new deal
export async function createDeal(dealData) {
  try {
    // Format data for Firestore
    // Remove any undefined values as Firestore doesn't accept them
    const cleanData = Object.entries(dealData).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {});
    
    // Add timestamps and ensure we have a userId
    const dealWithTimestamp = {
      ...cleanData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    // Convert JavaScript numbers to Firestore numbers
    // Convert JavaScript dates to Firestore timestamps if needed
    Object.keys(dealWithTimestamp).forEach(key => {
      if (dealWithTimestamp[key] instanceof Date) {
        dealWithTimestamp[key] = Timestamp.fromDate(dealWithTimestamp[key]);
      }
    });
    
    console.log('Creating deal with data:', dealWithTimestamp);
    
    const docRef = await addDoc(collection(db, DEALS_COLLECTION), dealWithTimestamp);
    console.log('Deal created with ID:', docRef.id);
    
    return { id: docRef.id, ...dealWithTimestamp };
  } catch (error) {
    console.error("Error creating deal:", error);
    throw error;
  }
}

// Get a specific deal by ID
export async function getDealById(dealId) {
  try {
    const docRef = doc(db, DEALS_COLLECTION, dealId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      throw new Error("Deal not found");
    }
  } catch (error) {
    console.error("Error fetching deal:", error);
    throw error;
  }
}

// Update an existing deal
export async function updateDeal(dealId, dealData) {
  try {
    const dealRef = doc(db, DEALS_COLLECTION, dealId);
    
    await updateDoc(dealRef, {
      ...dealData,
      updatedAt: serverTimestamp()
    });
    
    return { id: dealId, ...dealData };
  } catch (error) {
    console.error("Error updating deal:", error);
    throw error;
  }
}

// Delete a deal
export async function deleteDeal(dealId) {
  try {
    await deleteDoc(doc(db, DEALS_COLLECTION, dealId));
    return true;
  } catch (error) {
    console.error("Error deleting deal:", error);
    throw error;
  }
}

// Get all deals with optional filtering and pagination
export async function getDeals(filters = {}, pageSize = 10, lastDoc = null) {
  try {
    let dealsQuery = collection(db, DEALS_COLLECTION);
    const queryConstraints = [];
    
    // Apply filters
    if (filters.userId) {
      queryConstraints.push(where('userId', '==', filters.userId));
    }
    
    if (filters.startDate && filters.endDate) {
      queryConstraints.push(where('date', '>=', filters.startDate));
      queryConstraints.push(where('date', '<=', filters.endDate));
    }
    
    // Apply sorting
    queryConstraints.push(orderBy('createdAt', 'desc'));
    
    // Apply pagination
    if (lastDoc) {
      queryConstraints.push(startAfter(lastDoc));
    }
    
    queryConstraints.push(limit(pageSize));
    
    // Execute query
    const q = query(dealsQuery, ...queryConstraints);
    const querySnapshot = await getDocs(q);
    
    // Transform results
    const deals = [];
    querySnapshot.forEach((doc) => {
      deals.push({ id: doc.id, ...doc.data() });
    });
    
    return {
      deals,
      lastDoc: querySnapshot.docs[querySnapshot.docs.length - 1] || null
    };
  } catch (error) {
    console.error("Error fetching deals:", error);
    throw error;
  }
}
