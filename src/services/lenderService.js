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
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';

const LENDERS_COLLECTION = 'lenders';

/**
 * Sanitizes lender data before saving to Firestore
 * - Ensures all required fields are present
 * - Formats numbers correctly
 * - Structures nested objects properly
 */
function sanitizeLenderData(lenderData) {
  // Create a deep copy to avoid modifying the original
  const sanitized = JSON.parse(JSON.stringify(lenderData));
  
  // Ensure backendGuidelines object has all required fields
  if (!sanitized.backendGuidelines) {
    sanitized.backendGuidelines = {};
  }
  
  // Convert string numbers to actual numbers
  if (sanitized.backendGuidelines.maxWarrantyAmount) {
    sanitized.backendGuidelines.maxWarrantyAmount = Number(sanitized.backendGuidelines.maxWarrantyAmount);
  }
  
  if (sanitized.backendGuidelines.maxGapAmount) {
    sanitized.backendGuidelines.maxGapAmount = Number(sanitized.backendGuidelines.maxGapAmount);
  }
  
  if (sanitized.backendGuidelines.maxTotalBackend) {
    sanitized.backendGuidelines.maxTotalBackend = Number(sanitized.backendGuidelines.maxTotalBackend);
  }
  
  if (sanitized.backendGuidelines.maxBackendPercent) {
    sanitized.backendGuidelines.maxBackendPercent = Number(sanitized.backendGuidelines.maxBackendPercent);
  }
  
  // Ensure vehicle restrictions object has all required fields
  if (!sanitized.vehicleRestrictions) {
    sanitized.vehicleRestrictions = {};
  }
  
  // Convert string numbers to actual numbers for vehicle restrictions
  if (sanitized.vehicleRestrictions.maxMileage) {
    sanitized.vehicleRestrictions.maxMileage = Number(sanitized.vehicleRestrictions.maxMileage);
  }
  
  if (sanitized.vehicleRestrictions.oldestYear) {
    sanitized.vehicleRestrictions.oldestYear = Number(sanitized.vehicleRestrictions.oldestYear);
  }
  
  if (sanitized.vehicleRestrictions.maxAgeYears) {
    sanitized.vehicleRestrictions.maxAgeYears = Number(sanitized.vehicleRestrictions.maxAgeYears);
  }
  
  if (sanitized.vehicleRestrictions.maxLoanTerm) {
    sanitized.vehicleRestrictions.maxLoanTerm = Number(sanitized.vehicleRestrictions.maxLoanTerm);
  }
  
  // Ensure credit tiers are properly formatted
  if (sanitized.creditTiers && Array.isArray(sanitized.creditTiers)) {
    sanitized.creditTiers = sanitized.creditTiers.map(tier => {
      // Process the tier basic information
      const sanitizedTier = {
        name: tier.name || '',
        minScore: Number(tier.minScore || 0),
        maxLTV: Number(tier.maxLTV || 0)
      };
      
      // Add the old single rate field for backward compatibility
      if (tier.rate !== undefined) {
        sanitizedTier.rate = tier.rate === 'N/A' ? 'N/A' : Number(tier.rate || 0);
      }
      
      // Process the rates object if it exists
      if (tier.rates && typeof tier.rates === 'object') {
        sanitizedTier.rates = {};
        
        // Process each term rate (60, 72, 84 months)
        for (const [term, rate] of Object.entries(tier.rates)) {
          // Special handling for 'N/A' values
          if (rate === 'N/A') {
            sanitizedTier.rates[term] = 'N/A';
          } else if (rate !== '' && rate !== null && rate !== undefined) {
            // Convert numeric strings to actual numbers
            sanitizedTier.rates[term] = Number(rate);
          }
        }
      }
      
      return sanitizedTier;
    });
  }
  
  return sanitized;
}

/**
 * Format lender data when retrieved from Firestore
 * - Handles timestamp conversion
 * - Ensures consistent structure
 */
function formatLenderData(lender) {
  // Handle timestamps if they exist
  const formatted = {
    ...lender,
    // Add default backendGuidelines if missing
    backendGuidelines: lender.backendGuidelines || {
      maxWarrantyAmount: '',
      maxGapAmount: '',
      maxTotalBackend: '',
      maxBackendPercent: '',
      backendOnTopOfLTV: false,
      backendIncludedInLTV: true,
      requiresIncome: false,
      requiresProofOfIncome: false
    }
  };
  
  // Ensure creditTiers have proper structure
  if (formatted.creditTiers && Array.isArray(formatted.creditTiers)) {
    formatted.creditTiers = formatted.creditTiers.map(tier => {
      // Ensure the rates object exists
      if (!tier.rates) {
        tier.rates = {};
        
        // If we have an old-style single rate, convert it to the rates object format
        if (tier.rate !== undefined && tier.rate !== 'N/A') {
          // Set the same rate for all terms if we only have a single rate
          tier.rates = {
            '60': tier.rate,
            '72': tier.rate,
            '84': tier.rate
          };
        }
      }
      
      return tier;
    });
  }
  
  return formatted;
}

// Create a new lender
export async function createLender(lenderData) {
  try {
    const sanitized = sanitizeLenderData(lenderData);
    
    const lenderWithTimestamp = {
      ...sanitized,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // We don't store a userId field to make this accessible to all users
      // If you need to track who added it:
      // createdBy: auth.currentUser.uid,
    };
    
    const docRef = await addDoc(collection(db, LENDERS_COLLECTION), lenderWithTimestamp);
    return { id: docRef.id, ...lenderWithTimestamp };
  } catch (error) {
    console.error("Error creating lender:", error);
    throw error;
  }
}

// Get a specific lender by ID
export async function getLenderById(lenderId) {
  try {
    const docRef = doc(db, LENDERS_COLLECTION, lenderId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const lenderData = docSnap.data();
      return formatLenderData({ id: docSnap.id, ...lenderData });
    } else {
      throw new Error("Lender not found");
    }
  } catch (error) {
    console.error("Error fetching lender:", error);
    throw error;
  }
}

// Update an existing lender
export async function updateLender(lenderId, lenderData) {
  try {
    const sanitized = sanitizeLenderData(lenderData);
    const lenderRef = doc(db, LENDERS_COLLECTION, lenderId);
    
    await updateDoc(lenderRef, {
      ...sanitized,
      updatedAt: serverTimestamp()
    });
    
    return { id: lenderId, ...sanitized };
  } catch (error) {
    console.error("Error updating lender:", error);
    throw error;
  }
}

// Delete a lender
export async function deleteLender(lenderId) {
  try {
    await deleteDoc(doc(db, LENDERS_COLLECTION, lenderId));
    return true;
  } catch (error) {
    console.error("Error deleting lender:", error);
    throw error;
  }
}

// Get all lenders
export async function getLenders() {
  try {
    const q = query(
      collection(db, LENDERS_COLLECTION),
      orderBy('name', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    
    const lenders = [];
    querySnapshot.forEach((doc) => {
      const lenderData = doc.data();
      lenders.push(formatLenderData({ id: doc.id, ...lenderData }));
    });
    
    return lenders;
  } catch (error) {
    console.error("Error fetching lenders:", error);
    throw error;
  }
}

// Get lenders by criteria (for filtering)
export async function getLendersByCriteria(criteria) {
  try {
    let q = collection(db, LENDERS_COLLECTION);
    
    // Add filters based on criteria
    if (criteria) {
      if (criteria.name) {
        q = query(q, where('name', '==', criteria.name));
      }
      
      // Add more filter options as needed
    }
    
    // Always sort by name
    q = query(q, orderBy('name', 'asc'));
    
    const querySnapshot = await getDocs(q);
    
    const lenders = [];
    querySnapshot.forEach((doc) => {
      const lenderData = doc.data();
      lenders.push(formatLenderData({ id: doc.id, ...lenderData }));
    });
    
    return lenders;
  } catch (error) {
    console.error("Error fetching lenders by criteria:", error);
    throw error;
  }
}

// Find lenders that match specific credit and vehicle criteria
export async function findMatchingLenders(creditScore, vehicleDetails) {
  try {
    // Get all lenders first, then filter in-memory
    // (Firestore doesn't support complex nested array filtering)
    const allLenders = await getLenders();
    
    return allLenders.filter(lender => {
      // Find matching credit tier for this credit score
      const matchingTier = lender.creditTiers?.find(tier => 
        creditScore >= tier.minScore
      );
      
      if (!matchingTier) return false;
      
      // Check vehicle restrictions
      const vehicleRestrictions = lender.vehicleRestrictions || {};
      
      // Only apply restrictions that are set
      if (vehicleRestrictions.maxMileage && 
          vehicleDetails.mileage > vehicleRestrictions.maxMileage) {
        return false;
      }
      
      if (vehicleRestrictions.oldestYear && 
          vehicleDetails.year < vehicleRestrictions.oldestYear) {
        return false;
      }
      
      // Match found if we passed all criteria
      return true;
    });
  } catch (error) {
    console.error("Error finding matching lenders:", error);
    throw error;
  }
}

/**
 * Get lenders by creditScore and vehicle details for all users
 * This function provides a shared lender database for all users
 * 
 * @param {Object} options - Filter options
 * @param {number} options.minCreditScore - Minimum credit score to filter by
 * @param {Object} options.vehicleDetails - Vehicle details to match against
 * @returns {Promise<Array>} Array of matching lenders
 */
export async function getAllLendersWithFilterOptions(options = {}) {
  try {
    // Get all lenders regardless of who added them
    const q = query(
      collection(db, LENDERS_COLLECTION),
      orderBy('name', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    
    let lenders = [];
    querySnapshot.forEach((doc) => {
      const lenderData = doc.data();
      lenders.push(formatLenderData({ id: doc.id, ...lenderData }));
    });
    
    // Apply filters if provided
    if (options.minCreditScore) {
      lenders = lenders.filter(lender => {
        // Find tiers that match the credit score
        return lender.creditTiers?.some(tier => options.minCreditScore >= tier.minScore);
      });
    }
    
    if (options.vehicleDetails) {
      lenders = lenders.filter(lender => {
        const restrictions = lender.vehicleRestrictions || {};
        
        // Check mileage if provided
        if (restrictions.maxMileage && options.vehicleDetails.mileage > restrictions.maxMileage) {
          return false;
        }
        
        // Check year if provided
        if (restrictions.oldestYear && options.vehicleDetails.year < restrictions.oldestYear) {
          return false;
        }
        
        // Additional vehicle restrictions can be checked here
        return true;
      });
    }
    
    return lenders;
  } catch (error) {
    console.error("Error fetching all lenders with filters:", error);
    throw error;
  }
}
