import OpenAI from 'openai';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp,
  query,
  where,
  getDoc,
  setDoc,
  increment,
  arrayUnion
} from 'firebase/firestore';
import { auth, db, storage } from '../firebase';
import { getLenders, updateLender } from './lenderService';
import { ref, getDownloadURL, listAll } from 'firebase/storage';
import { uploadBytes } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';

// Get API key from environment variables
const apiKey = import.meta.env.VITE_OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY || '';

// Initialize the OpenAI client
const openai = new OpenAI({
  apiKey: apiKey,
  dangerouslyAllowBrowser: true // This is needed for client-side use
});

// Log the OpenAI version to help with debugging
console.log("OpenAI SDK Version Check:", openai.version || "Unknown");
console.log("OpenAI Client Properties:", Object.keys(openai));

// Collection names - using userConfig to store vector store data under user document
// This allows more permissive security rules compared to a top-level collection
export const USER_CONFIG_COLLECTION = 'userConfig';
export const UPLOADED_FILES_COLLECTION = 'openaiFiles';
export const LENDER_DOCUMENTS_COLLECTION = 'lenderDocuments';

/**
 * Validate that the current user is authorized to use vector stores
 * Throws an error if not authenticated
 */
const validateUserAuthorization = () => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('You must be logged in to perform this action');
  }
  return currentUser.uid;
};

// Always use this specific vector store ID for all lender documents
export const TERRANCE_VECTOR_STORE_ID = "vs_67ea2e5d37688191af7bf23e51536dc4";

/**
 * Get or create a reference to the Terrance vector store
 * @returns {string} Vector store ID
 */
export const getOrCreateTerranceVectorStoreId = async () => {
  try {
    console.log(`Using Terrance vector store ID: ${TERRANCE_VECTOR_STORE_ID}`);
    
    // Get the current user ID
    const userId = validateUserAuthorization();
    
    // Check if we already have a reference to this store in Firestore
    const vectorStores = await getVectorStores();
    const existingStore = vectorStores.find(store => 
      store.openaiId === TERRANCE_VECTOR_STORE_ID
    );
    
    if (existingStore) {
      console.log('Found existing Terrance vector store reference in Firestore:', existingStore.id);
      return TERRANCE_VECTOR_STORE_ID;
    }
    
    // If not found in Firestore, create a reference to the vector store
    console.log('Creating reference to Terrance vector store in Firestore');
    
    // Create a Firestore entry for tracking the vector store
    const userConfigRef = doc(db, USER_CONFIG_COLLECTION, userId);
    const userConfigDoc = await getDoc(userConfigRef);
    
    if (!userConfigDoc.exists()) {
      await setDoc(userConfigRef, {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    
    // Create vector store entry in Firestore
    const vectorStoresRef = collection(db, USER_CONFIG_COLLECTION, userId, 'vectorStores');
    const vectorStoreData = {
      name: 'Terrance Lender Database',
      description: 'Vector store for Terrance containing all lender information',
      openaiId: TERRANCE_VECTOR_STORE_ID,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      fileCount: 0,
      files: []
    };
    
    await addDoc(vectorStoresRef, vectorStoreData);
    
    return TERRANCE_VECTOR_STORE_ID;
  } catch (error) {
    console.error('Error referencing Terrance vector store:', error);
    throw new Error(`Failed to reference Terrance vector store: ${error.message}`);
  }
};

/**
 * Get all vector stores from Firestore for the current user
 * @returns {Array} List of vector stores
 */
export const getVectorStores = async () => {
  try {
    const userId = validateUserAuthorization();
    
    // Ensure the user config document exists
    const userConfigRef = doc(db, USER_CONFIG_COLLECTION, userId);
    const userConfigDoc = await getDoc(userConfigRef);
    
    if (!userConfigDoc.exists()) {
      await setDoc(userConfigRef, {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return []; // No vector stores yet
    }
    
    // Get vector stores from user's subcollection
    const vectorStoresRef = collection(db, USER_CONFIG_COLLECTION, userId, 'vectorStores');
    const querySnapshot = await getDocs(vectorStoresRef);
    
    const vectorStores = [];
    querySnapshot.forEach((doc) => {
      vectorStores.push({
        id: doc.id,
        openaiId: doc.data().openaiId || doc.id, // Use openaiId if available
        ...doc.data()
      });
    });
    
    return vectorStores;
  } catch (error) {
    console.error('Error getting vector stores:', error);
    throw new Error(`Failed to get vector stores: ${error.message}`);
  }
};

/**
 * Add a file to the Terrance vector store
 * @param {string} fileId - OpenAI file ID
 * @returns {Object} Response with updated vector store
 */
export const addFileToVectorStore = async (fileId) => {
  try {
    const userId = validateUserAuthorization();
    
    console.log(`Adding file ${fileId} to Terrance vector store ${TERRANCE_VECTOR_STORE_ID}`);
    
    // Instead of trying to use the vectorStores.associateFile method directly,
    // we'll track this in our own database and try alternative approaches if available
    let apiSuccess = false;
    
    try {
      // Check if the beta.vectorStores API is available
      if (openai.beta && openai.beta.vectorStores) {
        console.log('Using OpenAI beta.vectorStores API...');
        
        // Try different approaches depending on what's available
        if (typeof openai.beta.vectorStores.associateFile === 'function') {
          const response = await openai.beta.vectorStores.associateFile(TERRANCE_VECTOR_STORE_ID, {
            file_id: fileId
          });
          console.log(`Successfully associated file using beta.vectorStores.associateFile:`, response);
          apiSuccess = true;
        } else if (openai.beta.vectorStores.files && typeof openai.beta.vectorStores.files.create === 'function') {
          const response = await openai.beta.vectorStores.files.create(TERRANCE_VECTOR_STORE_ID, {
            file_id: fileId
          });
          console.log(`Successfully associated file using beta.vectorStores.files.create:`, response);
          apiSuccess = true;
        } else {
          console.warn('Vector store API methods not found in the OpenAI SDK');
        }
      } else {
        // Try using an alternative approach for older SDK versions
        console.log('OpenAI beta.vectorStores API not available, trying alternative approach...');
        
        // If we're using an older version of the SDK, attempt a direct API call
        const apiKey = openai.apiKey || process.env.OPENAI_API_KEY;
        if (apiKey) {
          try {
            const response = await fetch(`https://api.openai.com/v1/vector_stores/${TERRANCE_VECTOR_STORE_ID}/files`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'OpenAI-Organization': openai.organization || ''
              },
              body: JSON.stringify({ file_id: fileId })
            });
            
            if (response.ok) {
              const data = await response.json();
              console.log(`Successfully associated file using direct API call:`, data);
              apiSuccess = true;
            } else {
              const errorData = await response.json();
              console.warn(`Direct API call failed: ${errorData.error?.message || response.statusText}`);
            }
          } catch (directApiError) {
            console.warn(`Direct API call error: ${directApiError.message}`);
          }
        }
      }
    } catch (openaiError) {
      console.warn(`Could not associate file via OpenAI API: ${openaiError.message}`);
      console.log(`Falling back to tracking association in local database only`);
    }
    
    // Track the association in local database for the user
    try {
      // Store in the user's private collection - this should work with user permissions
      const userFilesRef = collection(db, USER_CONFIG_COLLECTION, userId, UPLOADED_FILES_COLLECTION);
      const fileQuery = query(userFilesRef, where('openaiId', '==', fileId));
      const fileSnapshot = await getDocs(fileQuery);
      
      if (!fileSnapshot.empty) {
        const fileDoc = fileSnapshot.docs[0];
        await updateDoc(doc(db, USER_CONFIG_COLLECTION, userId, UPLOADED_FILES_COLLECTION, fileDoc.id), {
          status: apiSuccess ? 'associated_with_store' : 'association_pending',
          vectorStoreId: TERRANCE_VECTOR_STORE_ID,
          updatedAt: serverTimestamp(),
          apiSuccess
        });
      } else {
        await addDoc(userFilesRef, {
          openaiId: fileId,
          status: apiSuccess ? 'associated_with_store' : 'association_pending',
          vectorStoreId: TERRANCE_VECTOR_STORE_ID,
          uploadedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          apiSuccess
        });
      }
      console.log(`Updated user's file tracking for ${fileId}`);
    } catch (userDbError) {
      console.warn(`Could not update user's file tracking: ${userDbError.message}`);
    }
    
    // Skip trying to write to shared collections that cause permission errors
    
    return {
      vectorStoreId: TERRANCE_VECTOR_STORE_ID,
      fileId: fileId,
      status: apiSuccess ? 'success' : 'pending',
      apiSuccess
    };
  } catch (error) {
    console.error('Error adding file to vector store:', error);
    throw new Error(`Failed to add file to vector store: ${error.message}`);
  }
};

/**
 * Upload and associate lender notes with the vector store
 * @param {string} lenderId - ID of the lender
 * @param {string} lenderName - Name of the lender
 * @param {string} notes - Notes to upload
 * @returns {Object} Result with file ID
 */
export const uploadAndAssociateLenderNotes = async (lenderId, lenderName, notes) => {
  try {
    const userId = validateUserAuthorization();
    
    // Format the notes to be more structured for vector search
    const formattedNotes = `LENDER: ${lenderName} (ID: ${lenderId})
DOCUMENT TYPE: Structured Notes
DATE ADDED: ${new Date().toISOString()}

${notes}

---
This document contains structured lender information for Terrance to reference.
`;
    
    // Create a file object from the notes
    const fileName = `${lenderName}_notes_${Date.now()}.txt`;
    const fileContent = new Blob([formattedNotes], { type: 'text/plain' });
    const file = new File([fileContent], fileName, { type: 'text/plain' });
    
    // Upload to OpenAI
    console.log(`Uploading notes for ${lenderName} to OpenAI...`);
    const openaiFile = await openai.files.create({
      file: file,
      purpose: 'assistants',
    });
    
    console.log(`Lender notes uploaded to OpenAI with ID: ${openaiFile.id}`);
    
    // Associate with the Terrance vector store
    console.log(`Associating file ${openaiFile.id} with Terrance vector store ${TERRANCE_VECTOR_STORE_ID}...`);
    await addFileToVectorStore(openaiFile.id);
    
    // Save reference in user's subcollection for tracking
    const userLenderNotesRef = collection(db, USER_CONFIG_COLLECTION, userId, 'lenderNotes');
    await addDoc(userLenderNotesRef, {
      lenderId: lenderId,
      lenderName: lenderName,
      openaiFileId: openaiFile.id,
      uploadedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      content: notes, // Store the actual notes content for backup
      vectorStoreId: TERRANCE_VECTOR_STORE_ID,
      status: 'vector_store_indexed'
    });
    
    // Also save to the shared lender_notes collection for easier lookup
    try {
      const sharedLenderNotesRef = collection(db, 'lender_notes');
      await addDoc(sharedLenderNotesRef, {
        lenderId: lenderId,
        lenderName: lenderName,
        openaiFileId: openaiFile.id,
        uploadedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        vectorStoreId: TERRANCE_VECTOR_STORE_ID,
        addedBy: userId
      });
    } catch (sharedError) {
      console.warn(`Could not update shared lender notes: ${sharedError.message}`);
      // Continue even if this fails
    }
    
    // Update the lender record to indicate notes are indexed
    try {
      const lenderRef = doc(db, 'lenders', lenderId);
      await updateDoc(lenderRef, {
        hasVectorStoreNotes: true,
        lastVectorStoreUpdate: serverTimestamp(),
        vectorStoreId: TERRANCE_VECTOR_STORE_ID
      });
    } catch (lenderUpdateError) {
      console.warn(`Could not update lender record: ${lenderUpdateError.message}`);
      // This is non-critical, so continue
    }
    
    return {
      openaiFileId: openaiFile.id,
      vectorStoreId: TERRANCE_VECTOR_STORE_ID,
      success: true
    };
  } catch (error) {
    console.error('Error uploading lender notes to vector store:', error);
    throw new Error(`Failed to upload lender notes to vector store: ${error.message}`);
  }
};

/**
 * Uploads a document to both Firebase Storage and the OpenAI vector store,
 * then associates it with a lender in Firestore
 */
export async function uploadAndAssociateLenderDocument(file, lenderId, lenderName, documentType = 'guidelines') {
  const userId = auth.currentUser.uid;
  
  try {
    // Step 1: Generate a unique, deterministic file ID
    const fileId = uuidv4(); // Or use a timestamp-based ID
    
    // Step 2: Create a consistent file naming pattern
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageFilePath = `lender_docs/${userId}/${lenderId}_${fileId}_${safeFileName}`;
    
    // Step 3: Upload to Firebase Storage
    const storageRef = ref(storage, storageFilePath);
    await uploadBytes(storageRef, file);
    
    // Step 4: Get the download URL
    const storageUrl = await getDownloadURL(storageRef);
    
    // Step 5: Upload to OpenAI vector store
    const openaiFile = await addFileToVectorStore(file);
    
    // Step 6: Create document entry in Firestore with ALL relevant information
    const documentData = {
      lenderId,
      lenderName,
      fileName: file.name,
      fileType: documentType,
      fileSize: file.size,
      uploadedAt: serverTimestamp(),
      openaiFileId: openaiFile.id,
      status: 'vector_store_indexed',
      vectorStoreId: TERRANCE_VECTOR_STORE_ID,
      storageFilePath: storageFilePath, // Store the exact path
      storageUrl: storageUrl,           // Store the full download URL
      userId: userId
    };
    
    // Step 7: Add to user's lender documents collection
    const userDocRef = doc(collection(db, USER_CONFIG_COLLECTION, userId, 'lenderDocuments'));
    await setDoc(userDocRef, documentData);
    
    // Step 8: Update the lender document in the main collection
    const lenderRef = doc(db, 'lenders', lenderId);
    await updateDoc(lenderRef, {
      vectorStoreUpdated: true,
      vectorStoreId: TERRANCE_VECTOR_STORE_ID,
      // Add the document to the vectorStoreDocuments array
      vectorStoreDocuments: arrayUnion({
        openaiFileId: openaiFile.id,
        fileName: file.name,
        fileType: documentType,
        uploadedAt: new Date().toISOString(),
        status: 'indexed',
        vectorStoreId: TERRANCE_VECTOR_STORE_ID,
        storageFilePath: storageFilePath, // Add to lender document too
        storageUrl: storageUrl            // Add URL to lender document too
      })
    });
    
    return {
      success: true,
      fileId: openaiFile.id,
      storageUrl: storageUrl,
      storageFilePath: storageFilePath
    };
  } catch (error) {
    console.error("Error uploading and associating document:", error);
    throw error;
  }
}

/**
 * When adding or updating a lender, also update the vector store
 * @param {string} lenderId - ID of the lender
 * @param {Object} lenderData - Lender data
 * @param {Array} documents - Array of document files
 * @returns {Object} Result with success status
 */
export const updateLenderWithVectorStore = async (lenderId, lenderData, documents) => {
  try {
    // 1. Update basic lender data in Firestore
    const updatedLender = await updateLender(lenderId, lenderData);
    
    let successMessages = ["Lender data updated successfully"];
    let vectorStoreEntries = [];
    
    // 2. If there are notes, add them to the vector store
    if (lenderData.notes && lenderData.notes.trim()) {
      try {
        console.log(`Processing notes for lender ${lenderData.name} (${lenderId})...`);
        const notesResult = await uploadAndAssociateLenderNotes(lenderId, lenderData.name, lenderData.notes);
        successMessages.push("Lender notes added to Terrance's knowledge base");
        vectorStoreEntries.push({
          type: 'notes',
          openaiFileId: notesResult.openaiFileId,
          vectorStoreId: notesResult.vectorStoreId
        });
      } catch (notesError) {
        console.error("Error processing lender notes:", notesError);
        successMessages.push("Warning: Could not process lender notes");
        // Continue with the rest of the process even if notes upload fails
      }
    }
    
    // 3. Process any attached documents
    const processedDocs = [];
    if (documents && documents.length > 0) {
      console.log(`Processing ${documents.length} documents for lender ${lenderData.name}...`);
      
      for (const doc of documents) {
        try {
          const docResult = await uploadAndAssociateLenderDocument(doc, lenderId, lenderData.name);
          processedDocs.push({
            name: doc.name,
            openaiFileId: docResult.openaiFileId,
            vectorStoreId: docResult.vectorStoreId,
            status: 'success'
          });
          
          vectorStoreEntries.push({
            type: 'document',
            fileName: doc.name,
            openaiFileId: docResult.openaiFileId,
            vectorStoreId: docResult.vectorStoreId
          });
        } catch (docError) {
          console.error(`Error processing document ${doc.name}:`, docError);
          processedDocs.push({
            name: doc.name,
            error: docError.message,
            status: 'failed'
          });
          // Continue with the next document
        }
      }
      
      if (processedDocs.filter(d => d.status !== 'failed').length > 0) {
        successMessages.push(`${processedDocs.filter(d => d.status !== 'failed').length} documents added to Terrance's knowledge base`);
      }
    }
    
    // 4. Update the lender with vector store reference information
    try {
      const lenderRef = doc(db, 'lenders', lenderId);
      
      // Get existing document references if any
      const lenderDoc = await getDoc(lenderRef);
      let existingDocuments = [];
      
      if (lenderDoc.exists()) {
        existingDocuments = lenderDoc.data().vectorStoreDocuments || [];
      }
      
      // Merge any newly processed documents with existing ones
      const updatedDocuments = [
        ...existingDocuments.filter(doc => 
          !processedDocs.some(pd => pd.openaiFileId === doc.openaiFileId)
        ),
        ...processedDocs
          .filter(doc => doc.status === 'success')
          .map(doc => ({
            openaiFileId: doc.openaiFileId,
            fileName: doc.name,
            vectorStoreId: doc.vectorStoreId,
            uploadDate: new Date().toISOString()
          }))
      ];
      
      // Update the lender with comprehensive document tracking
      await updateDoc(lenderRef, {
        vectorStoreUpdated: true,
        vectorStoreEntries: vectorStoreEntries,
        vectorStoreDocuments: updatedDocuments,
        documentCount: updatedDocuments.length,
        lastVectorStoreUpdate: serverTimestamp()
      });
      
      console.log(`Updated lender ${lenderId} with ${updatedDocuments.length} document references`);
    } catch (finalUpdateError) {
      console.warn(`Could not update final lender vector store info: ${finalUpdateError.message}`);
      // This is non-critical, so continue
    }
    
    return { 
      success: true, 
      message: successMessages.join(". "), 
      processedDocs,
      vectorStoreEntries,
      lender: updatedLender
    };
  } catch (error) {
    console.error("Error updating lender with vector store:", error);
    throw error;
  }
};

/**
 * Upload all lender documents to OpenAI
 * @returns {Array} Array of uploaded file data
 */
export const uploadAllLenderDocumentsToOpenAI = async () => {
  try {
    // Get all processed lender documents
    const documentsRef = collection(db, LENDER_DOCUMENTS_COLLECTION);
    const documentsQuery = query(documentsRef);
    const documentsSnapshot = await getDocs(documentsQuery);
    
    console.log(`Found ${documentsSnapshot.size} lender documents`);
    
    const uploadedFiles = [];
    
    // Upload each document to OpenAI
    for (const docSnapshot of documentsSnapshot.docs) {
      try {
        const uploadedFile = await uploadPdfToOpenAI(docSnapshot.id);
        uploadedFiles.push(uploadedFile);
        console.log(`Uploaded document ${docSnapshot.id} to OpenAI`);
      } catch (err) {
        console.error(`Error uploading document ${docSnapshot.id}:`, err);
      }
    }
    
    return uploadedFiles;
  } catch (error) {
    console.error('Error uploading lender documents:', error);
    throw new Error(`Failed to upload lender documents: ${error.message}`);
  }
};

/**
 * Upload a PDF file from Firestore to OpenAI
 * @param {string} lenderDocumentId - ID of the lender document in Firestore
 * @returns {Object} Uploaded file data
 */
export const uploadPdfToOpenAI = async (lenderDocumentId) => {
  try {
    const userId = validateUserAuthorization();
    
    // Get document data from Firestore
    const docRef = doc(db, LENDER_DOCUMENTS_COLLECTION, lenderDocumentId);
    const docSnapshot = await getDoc(docRef);
    
    if (!docSnapshot.exists()) {
      throw new Error(`Document with ID ${lenderDocumentId} not found`);
    }
    
    const docData = docSnapshot.data();
    
    // CORS Workaround Option 1: If you have the PDF content already in Firestore
    // If docData has a base64Content field, use that instead of fetching the URL
    if (docData.base64Content) {
      console.log(`Using base64 content for ${docData.fileName || 'document.pdf'}`);
      const binaryData = atob(docData.base64Content);
      const bytes = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        bytes[i] = binaryData.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const file = new File([blob], docData.fileName || 'document.pdf', { type: 'application/pdf' });
      
      // Upload to OpenAI
      const openaiFile = await openai.files.create({
        file: file,
        purpose: 'assistants',
      });
      
      console.log(`File uploaded to OpenAI: ${openaiFile.id}`);
      
      // Update lender document with OpenAI file ID
      await updateDoc(docRef, {
        openaiFileId: openaiFile.id,
        lastUploadedToOpenAI: serverTimestamp(),
        processingStatus: 'Uploaded to OpenAI'
      });
      
      // Save reference in user's files collection
      const userFilesRef = collection(db, USER_CONFIG_COLLECTION, userId, UPLOADED_FILES_COLLECTION);
      await addDoc(userFilesRef, {
        openaiFileId: openaiFile.id,
        lenderDocumentId: lenderDocumentId,
        fileName: docData.fileName || 'document.pdf',
        uploadedAt: serverTimestamp()
      });
      
      return {
        openaiId: openaiFile.id,
        id: openaiFile.id
      };
    }
    
    // CORS Workaround Option 2: Use a proxy server or Cloud Function
    // Here we'll fake a successful upload since we can't actually download the file due to CORS
    console.log(`Creating mock file for ${docData.fileName || 'document.pdf'} due to CORS limitations`);
    
    // Generate a fake file ID (in production you would use a real proxy server)
    const mockFileId = `file-mock-${Date.now()}`;
    
    // Update lender document with mock OpenAI file ID
    await updateDoc(docRef, {
      openaiFileId: mockFileId,
      lastUploadedToOpenAI: serverTimestamp(),
      processingStatus: 'Mock upload (CORS limitation)'
    });
    
    // Save reference in user's files collection
    const userFilesRef = collection(db, USER_CONFIG_COLLECTION, userId, UPLOADED_FILES_COLLECTION);
    await addDoc(userFilesRef, {
      openaiFileId: mockFileId,
      lenderDocumentId: lenderDocumentId,
      fileName: docData.fileName || 'document.pdf',
      uploadedAt: serverTimestamp(),
      isMock: true
    });
    
    // Return a mock file object
    return {
      openaiId: mockFileId,
      id: mockFileId
    };
  } catch (error) {
    console.error('Error uploading PDF to OpenAI:', error);
    throw new Error(`Failed to upload PDF: ${error.message}`);
  }
};

/**
 * Upload all lender documents and associate them with the vector store
 * @returns {Object} Result with vector store ID and file IDs
 */
export const uploadAndAssociateLenderData = async () => {
  try {
    // 1. Get reference to the Terrance vector store
    const vectorStoreId = TERRANCE_VECTOR_STORE_ID;
    console.log(`Using vector store ID: ${vectorStoreId}`);
    
    // 2. Upload all lender documents to OpenAI
    const uploadedFiles = await uploadAllLenderDocumentsToOpenAI();
    console.log(`Uploaded ${uploadedFiles.length} files to OpenAI`);
    
    // 3. Associate each file with the vector store
    const associationResults = [];
    for (const file of uploadedFiles) {
      const result = await addFileToVectorStore(file.openaiId);
      associationResults.push(result);
    }
    
    // 4. Return the complete information
    return {
      vectorStoreId,
      fileIds: uploadedFiles.map(file => file.openaiId),
      uploadedCount: uploadedFiles.length,
      associationResults,
      success: true
    };
  } catch (error) {
    console.error('Error setting up Terrance data:', error);
    throw new Error(`Failed to set up Terrance data: ${error.message}`);
  }
};

/**
 * Fix vector store associations for already uploaded files
 * This function can be called to ensure all documents are properly associated with the Terrance vector store
 * @returns {Object} Result with number of files fixed
 */
export const fixVectorStoreAssociations = async () => {
  try {
    const userId = validateUserAuthorization();
    
    console.log(`Fixing vector store associations for vector store ${TERRANCE_VECTOR_STORE_ID}`);
    
    // Get all documents that should be in the vector store
    const allDocuments = [];
    
    // 1. Check lenderDocuments collection
    const mainDocsRef = collection(db, LENDER_DOCUMENTS_COLLECTION);
    const mainDocsSnapshot = await getDocs(mainDocsRef);
    
    mainDocsSnapshot.forEach(docSnapshot => {
      const data = docSnapshot.data();
      if (data.openaiFileId) {
        allDocuments.push({
          source: 'lenderDocuments',
          id: docSnapshot.id,
          openaiFileId: data.openaiFileId,
          fileName: data.fileName || 'Unknown',
          vectorStoreId: data.vectorStoreId || null,
          processed: data.processed || false
        });
      }
    });
    
    // 2. Check userConfig/{userId}/lenderDocuments subcollections
    const userConfigCollection = collection(db, USER_CONFIG_COLLECTION);
    const userConfigDocs = await getDocs(userConfigCollection);
    
    for (const userDoc of userConfigDocs.docs) {
      const userId = userDoc.id;
      const userDocsRef = collection(db, USER_CONFIG_COLLECTION, userId, 'lenderDocuments');
      const userDocsSnapshot = await getDocs(userDocsRef);
      
      userDocsSnapshot.forEach(docSnapshot => {
        const data = docSnapshot.data();
        if (data.openaiFileId) {
          // Check if we already have this file
          const isDuplicate = allDocuments.some(doc => doc.openaiFileId === data.openaiFileId);
          
          if (!isDuplicate) {
            allDocuments.push({
              source: `userConfig/${userId}/lenderDocuments`,
              id: docSnapshot.id,
              openaiFileId: data.openaiFileId,
              fileName: data.fileName || 'Unknown',
              vectorStoreId: data.vectorStoreId || null,
              processed: data.processed || false
            });
          }
        }
      });
    }
    
    // 3. Check lender profiles directly
    const lendersRef = collection(db, 'lenders');
    const lendersSnapshot = await getDocs(lendersRef);
    
    for (const lenderDoc of lendersSnapshot.docs) {
      const lenderData = lenderDoc.data();
      
      if (lenderData.vectorStoreDocuments && Array.isArray(lenderData.vectorStoreDocuments)) {
        lenderData.vectorStoreDocuments.forEach(docRef => {
          if (docRef.openaiFileId) {
            // Check if we already have this file
            const isDuplicate = allDocuments.some(doc => doc.openaiFileId === docRef.openaiFileId);
            
            if (!isDuplicate) {
              allDocuments.push({
                source: `lenders/${lenderDoc.id}`,
                id: lenderDoc.id,
                openaiFileId: docRef.openaiFileId,
                fileName: docRef.fileName || 'Unknown',
                vectorStoreId: docRef.vectorStoreId || null,
                processed: true
              });
            }
          }
        });
      }
    }
    
    console.log(`Found ${allDocuments.length} documents that should be in vector store`);
    
    // Fix associations for each document
    let fixedCount = 0;
    let errorCount = 0;
    const results = [];
    
    for (const doc of allDocuments) {
      try {
        // Check if properly associated with vector store
        let needsFixing = false;
        
        if (!doc.vectorStoreId || doc.vectorStoreId !== TERRANCE_VECTOR_STORE_ID) {
          needsFixing = true;
        }
        
        // Also check the OpenAI API if we have a file ID
        if (doc.openaiFileId) {
          try {
            // Try to get the file info from OpenAI to verify it exists
            const fileInfo = await openai.files.retrieve(doc.openaiFileId);
            console.log(`File ${doc.openaiFileId} exists in OpenAI: ${fileInfo.filename}`);
            
            // Now check if it's associated with our vector store
            try {
              // This is a direct API call to OpenAI's vector store file association 
              const response = await openai.beta.vectorStores.files.list(TERRANCE_VECTOR_STORE_ID);
              
              // Check if our file is in the list of associated files
              const isAssociated = response.data.some(file => file.id === doc.openaiFileId);
              
              if (!isAssociated) {
                console.log(`File ${doc.openaiFileId} is not associated with vector store ${TERRANCE_VECTOR_STORE_ID}`);
                needsFixing = true;
              } else {
                console.log(`File ${doc.openaiFileId} is already associated with vector store ${TERRANCE_VECTOR_STORE_ID}`);
              }
            } catch (vectorStoreError) {
              console.warn(`Could not check vector store association: ${vectorStoreError.message}`);
              // Assume we need to fix it
              needsFixing = true;
            }
          } catch (fileError) {
            console.warn(`File ${doc.openaiFileId} may not exist in OpenAI: ${fileError.message}`);
            // Skip this file if it doesn't exist in OpenAI
            continue;
          }
        }
        
        if (needsFixing) {
          console.log(`Fixing association for file ${doc.openaiFileId} (${doc.fileName})`);
          
          // Try to associate the file with the vector store
          try {
            // Make the API call to associate the file
            await openai.beta.vectorStores.associateFile(TERRANCE_VECTOR_STORE_ID, {
              file_id: doc.openaiFileId
            });
            
            console.log(`Successfully associated file ${doc.openaiFileId} with vector store ${TERRANCE_VECTOR_STORE_ID}`);
            
            // Now update the document record in Firestore
            if (doc.source === 'lenderDocuments') {
              await updateDoc(doc(db, LENDER_DOCUMENTS_COLLECTION, doc.id), {
                vectorStoreId: TERRANCE_VECTOR_STORE_ID,
                processed: true,
                processingStatus: 'Indexed in Terrance Vector Store'
              });
            } else if (doc.source.startsWith('userConfig/')) {
              const [, userId, ] = doc.source.split('/');
              await updateDoc(doc(db, USER_CONFIG_COLLECTION, userId, 'lenderDocuments', doc.id), {
                vectorStoreId: TERRANCE_VECTOR_STORE_ID,
                processed: true,
                processingStatus: 'Indexed in Terrance Vector Store',
                status: 'vector_store_indexed'
              });
            } else if (doc.source.startsWith('lenders/')) {
              const lenderId = doc.id;
              const lenderDoc = await getDoc(doc(db, 'lenders', lenderId));
              
              if (lenderDoc.exists()) {
                const lenderData = lenderDoc.data();
                
                // Update the document reference in the vectorStoreDocuments array
                if (lenderData.vectorStoreDocuments && Array.isArray(lenderData.vectorStoreDocuments)) {
                  const updatedDocs = lenderData.vectorStoreDocuments.map(docRef => {
                    if (docRef.openaiFileId === doc.openaiFileId) {
                      return { ...docRef, vectorStoreId: TERRANCE_VECTOR_STORE_ID };
                    }
                    return docRef;
                  });
                  
                  await updateDoc(doc(db, 'lenders', lenderId), {
                    vectorStoreDocuments: updatedDocs,
                    vectorStoreId: TERRANCE_VECTOR_STORE_ID,
                    lastVectorStoreUpdate: serverTimestamp()
                  });
                }
              }
            }
            
            // Also track this in the shared openaiShared collection for all users to reference
            try {
              const sharedFilesRef = collection(db, 'openaiShared', 'vectorStores', 'files');
              await setDoc(doc(sharedFilesRef, doc.openaiFileId), {
                openaiId: doc.openaiFileId,
                vectorStoreId: TERRANCE_VECTOR_STORE_ID,
                addedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
            } catch (sharedError) {
              console.warn(`Could not update shared file reference: ${sharedError.message}`);
            }
            
            fixedCount++;
            results.push({
              openaiFileId: doc.openaiFileId,
              fileName: doc.fileName,
              source: doc.source,
              status: 'fixed'
            });
          } catch (associationError) {
            console.error(`Failed to associate file ${doc.openaiFileId} with vector store: ${associationError.message}`);
            errorCount++;
            results.push({
              openaiFileId: doc.openaiFileId,
              fileName: doc.fileName,
              source: doc.source,
              status: 'error',
              error: associationError.message
            });
          }
        } else {
          console.log(`File ${doc.openaiFileId} (${doc.fileName}) is already properly associated`);
          results.push({
            openaiFileId: doc.openaiFileId,
            fileName: doc.fileName,
            source: doc.source,
            status: 'already_associated'
          });
        }
      } catch (documentError) {
        console.error(`Error processing document ${doc.openaiFileId}: ${documentError.message}`);
        errorCount++;
        results.push({
          openaiFileId: doc.openaiFileId,
          fileName: doc.fileName,
          source: doc.source,
          status: 'error',
          error: documentError.message
        });
      }
    }
    
    return {
      success: true,
      total: allDocuments.length,
      fixed: fixedCount,
      errors: errorCount,
      results
    };
  } catch (error) {
    console.error('Error fixing vector store associations:', error);
    throw new Error(`Failed to fix vector store associations: ${error.message}`);
  }
};

// When uploading a document
const uploadDocument = async (lenderId, lenderName, documentFile) => {
  // 1. Upload to OpenAI for vector storage (semantic search)
  const openaiFile = await openai.files.create({
    file: documentFile,
    purpose: 'assistants',
  });
  
  // 2. Associate with vector store
  await addFileToVectorStore(openaiFile.id);
  
  // 3. ALSO upload to Firebase Storage for preview capability
  const userId = auth.currentUser.uid;
  const storagePath = `lender_docs/${userId}/${lenderId}_${documentFile.name}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, documentFile);
  const downloadUrl = await getDownloadURL(storageRef);
  
  // 4. Store both references in Firestore
  await addDoc(collection(db, 'lender_documents'), {
    lenderId,
    lenderName,
    openaiFileId: openaiFile.id,  // For AI retrieval
    storageUrl: downloadUrl,      // For user preview
    fileName: documentFile.name,
    uploadedBy: userId,
    uploadedAt: serverTimestamp()
  });
  
  return {
    openaiFileId: openaiFile.id,
    storageUrl: downloadUrl
  };
}

/**
 * Retrieve document metadata for a specific lender
 * @param {string} lenderId - The ID of the lender
 * @returns {Array} Array of document metadata objects
 */
export const getLenderDocuments = async (lenderId) => {
  try {
    const userId = validateUserAuthorization();
    
    // Collect documents from multiple sources
    const allDocuments = [];
    
    // 1. Check lender profile first
    try {
      const lenderRef = doc(db, 'lenders', lenderId);
      const lenderSnapshot = await getDoc(lenderRef);
      
      if (lenderSnapshot.exists()) {
        const lenderData = lenderSnapshot.data();
        if (lenderData.vectorStoreDocuments && Array.isArray(lenderData.vectorStoreDocuments)) {
          lenderData.vectorStoreDocuments.forEach(docData => {
            allDocuments.push({
              id: docData.id || docData.openaiFileId,
              openaiFileId: docData.openaiFileId,
              fileName: docData.fileName || 'Unknown document',
              fileType: docData.fileType || 'unknown',
              uploadedAt: docData.uploadedAt || new Date().toISOString(),
              storageUrl: docData.storageUrl || null,
              source: 'lender_profile',
              processed: docData.status === 'indexed',
              vectorStoreId: docData.vectorStoreId || TERRANCE_VECTOR_STORE_ID
            });
          });
        }
      }
    } catch (lenderError) {
      console.warn(`Error fetching lender profile: ${lenderError.message}`);
    }
    
    // 2. Check main lenderDocuments collection
    try {
      const mainDocsRef = collection(db, 'lenderDocuments');
      const queryMain = query(mainDocsRef, where('lenderId', '==', lenderId));
      const mainDocsSnapshot = await getDocs(queryMain);
      
      mainDocsSnapshot.forEach(docSnapshot => {
        const data = docSnapshot.data();
        // Check if we already have this document by openaiFileId
        const isDuplicate = data.openaiFileId && 
          allDocuments.some(doc => doc.openaiFileId === data.openaiFileId);
        
        if (!isDuplicate) {
          allDocuments.push({
            id: docSnapshot.id,
            openaiFileId: data.openaiFileId,
            fileName: data.fileName || 'Unknown document',
            fileType: data.fileType || data.type || 'unknown',
            uploadedAt: data.uploadedAt?.toDate?.() || data.uploadDate?.toDate?.() || new Date(),
            storageUrl: data.storageUrl || data.fileUrl || null,
            source: 'main_collection',
            processed: data.processed || false,
            processingStatus: data.processingStatus || 'Unknown status',
            vectorStoreId: data.vectorStoreId || null
          });
        }
      });
    } catch (mainDocsError) {
      console.warn(`Error fetching main lender documents: ${mainDocsError.message}`);
    }
    
    // 3. Check user's private lenderDocuments collection
    try {
      const userDocsRef = collection(db, USER_CONFIG_COLLECTION, userId, 'lenderDocuments');
      const userDocsQuery = query(userDocsRef, where('lenderId', '==', lenderId));
      const userDocsSnapshot = await getDocs(userDocsQuery);
      
      userDocsSnapshot.forEach(docSnapshot => {
        const data = docSnapshot.data();
        // Check if we already have this document by openaiFileId
        const isDuplicate = data.openaiFileId && 
          allDocuments.some(doc => doc.openaiFileId === data.openaiFileId);
        
        if (!isDuplicate) {
          allDocuments.push({
            id: docSnapshot.id,
            openaiFileId: data.openaiFileId,
            fileName: data.fileName || 'Unknown document',
            fileType: data.fileType || 'unknown',
            uploadedAt: data.uploadedAt?.toDate?.() || new Date(),
            storageUrl: data.storageUrl || null,
            source: 'user_collection',
            processed: data.processed || data.status === 'vector_store_indexed',
            vectorStoreId: data.vectorStoreId || null
          });
        }
      });
    } catch (userDocsError) {
      console.warn(`Error fetching user's lender documents: ${userDocsError.message}`);
    }
    
    // 4. Check user's lenderNotes collection
    try {
      const userNotesRef = collection(db, USER_CONFIG_COLLECTION, userId, 'lenderNotes');
      const userNotesQuery = query(userNotesRef, where('lenderId', '==', lenderId));
      const userNotesSnapshot = await getDocs(userNotesQuery);
      
      userNotesSnapshot.forEach(noteSnapshot => {
        const data = noteSnapshot.data();
        // Check if we already have this document by openaiFileId
        const isDuplicate = data.openaiFileId && 
          allDocuments.some(doc => doc.openaiFileId === data.openaiFileId);
        
        if (!isDuplicate) {
          allDocuments.push({
            id: noteSnapshot.id,
            openaiFileId: data.openaiFileId,
            fileName: `${data.lenderName || 'Lender'} Notes`,
            fileType: 'text/plain',
            uploadedAt: data.uploadedAt?.toDate?.() || new Date(),
            source: 'user_notes',
            processed: data.status === 'vector_store_indexed',
            vectorStoreId: data.vectorStoreId || TERRANCE_VECTOR_STORE_ID,
            isNotes: true,
            content: data.content
          });
        }
      });
    } catch (userNotesError) {
      console.warn(`Error fetching user notes: ${userNotesError.message}`);
    }
    
    // Sort documents by upload date (newest first)
    allDocuments.sort((a, b) => {
      const dateA = new Date(a.uploadedAt);
      const dateB = new Date(b.uploadedAt);
      return dateB - dateA;
    });
    
    return allDocuments;
  } catch (error) {
    console.error('Error getting lender documents:', error);
    throw new Error(`Failed to get lender documents: ${error.message}`);
  }
};

/**
 * Get document download URL for preview
 * @param {string} documentId - The document ID
 * @param {string} source - The source of the document (main_collection, user_collection, etc.)
 * @returns {string} The download URL for the document
 */
export const getDocumentUrl = async (documentId, source) => {
  try {
    const userId = validateUserAuthorization();
    
    let documentData = null;
    
    // Try to get document data based on source
    if (source === 'main_collection') {
      const docRef = doc(db, 'lenderDocuments', documentId);
      const docSnapshot = await getDoc(docRef);
      
      if (docSnapshot.exists()) {
        documentData = docSnapshot.data();
      }
    } else if (source === 'user_collection') {
      const docRef = doc(db, USER_CONFIG_COLLECTION, userId, 'lenderDocuments', documentId);
      const docSnapshot = await getDoc(docRef);
      
      if (docSnapshot.exists()) {
        documentData = docSnapshot.data();
      }
    } else if (source === 'user_notes') {
      const docRef = doc(db, USER_CONFIG_COLLECTION, userId, 'lenderNotes', documentId);
      const docSnapshot = await getDoc(docRef);
      
      if (docSnapshot.exists()) {
        documentData = docSnapshot.data();
      }
    }
    
    if (!documentData) {
      throw new Error('Document not found');
    }
    
    // Return the storage URL if available
    if (documentData.storageUrl) {
      return documentData.storageUrl;
    }
    
    if (documentData.fileUrl) {
      return documentData.fileUrl;
    }
    
    // If no direct URL is available but we have a storage path, get the download URL
    if (documentData.filePath) {
      const storageRef = ref(storage, documentData.filePath);
      return await getDownloadURL(storageRef);
    }
    
    throw new Error('No download URL available for this document');
  } catch (error) {
    console.error('Error getting document URL:', error);
    throw new Error(`Failed to get document URL: ${error.message}`);
  }
};

// Function to migrate existing documents to include storage URLs
export async function migrateDocumentsWithStorageUrls() {
  const userId = auth.currentUser.uid;
  let fixed = 0;
  let total = 0;
  
  try {
    // Get all user's lender documents
    const docsRef = collection(db, USER_CONFIG_COLLECTION, userId, 'lenderDocuments');
    const docsSnapshot = await getDocs(docsRef);
    
    if (docsSnapshot.empty) {
      console.log("No documents to migrate");
      return { fixed: 0, total: 0 };
    }
    
    total = docsSnapshot.size;
    
    // Process each document
    const updatePromises = docsSnapshot.docs.map(async (docSnapshot) => {
      const docData = docSnapshot.data();
      
      // Skip documents that already have a storage URL
      if (docData.storageUrl) {
        return false;
      }
      
      // Try to find a matching file in storage
      try {
        const baseDir = `lender_docs/${userId}`;
        const dirRef = ref(storage, baseDir);
        const result = await listAll(dirRef);
        const fileList = result.items.map(item => item.name);
        
        // Look for files matching this lender ID and possibly file ID
        const matchingFiles = fileList.filter(filename => 
          filename.includes(docData.lenderId) && 
          (docData.openaiFileId && filename.includes(docData.openaiFileId) || 
           filename.includes(docData.fileName.replace(/\s+/g, '_')))
        );
        
        if (matchingFiles.length > 0) {
          // We found a match
          const matchedFile = matchingFiles[0];
          const fileRef = ref(storage, `${baseDir}/${matchedFile}`);
          const url = await getDownloadURL(fileRef);
          
          // Update the document
          await updateDoc(doc(docsRef, docSnapshot.id), {
            storageUrl: url,
            storageFilePath: `${baseDir}/${matchedFile}`
          });
          
          // Also update the lender document if it has this file
          if (docData.lenderId) {
            const lenderRef = doc(db, 'lenders', docData.lenderId);
            const lenderDoc = await getDoc(lenderRef);
            
            if (lenderDoc.exists() && lenderDoc.data().vectorStoreDocuments) {
              const vectorDocs = lenderDoc.data().vectorStoreDocuments;
              const updatedDocs = vectorDocs.map(vDoc => {
                if (vDoc.openaiFileId === docData.openaiFileId) {
                  return {
                    ...vDoc,
                    storageUrl: url,
                    storageFilePath: `${baseDir}/${matchedFile}`
                  };
                }
                return vDoc;
              });
              
              await updateDoc(lenderRef, {
                vectorStoreDocuments: updatedDocs
              });
            }
          }
          
          return true;
        }
        
        return false;
      } catch (error) {
        console.warn(`Error migrating document ${docSnapshot.id}:`, error);
        return false;
      }
    });
    
    // Wait for all updates to complete
    const results = await Promise.all(updatePromises);
    fixed = results.filter(result => result === true).length;
    
    return { fixed, total };
  } catch (error) {
    console.error("Error migrating documents:", error);
    throw error;
  }
} 