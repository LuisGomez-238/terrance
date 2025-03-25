/**
 * A simplified document processor that doesn't actually extract text from PDFs
 * Instead, it relies on manual notes entered by users in the lender profiles
 * 
 * @param {File} file - The PDF file (used for storage reference only)
 * @param {string} documentId - The Firestore document ID
 * @param {string} lenderId - The lender ID
 * @param {string} documentType - The type of document
 * @returns {Promise<void>}
 */
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export async function processDocument(file, documentId, lenderId, documentType) {
  try {
    // Get the lender document to access the notes
    const lenderDoc = await getDoc(doc(db, 'lenders', lenderId));
    
    if (!lenderDoc.exists()) {
      throw new Error('Lender not found');
    }
    
    // Update the document status
    await updateDoc(doc(db, 'lenderDocuments', documentId), {
      processed: true,
      processingStatus: 'Document uploaded successfully',
      processedAt: new Date(),
      keyPoints: [],
      // Reference that Terrance uses lender notes
      notesReference: 'Terrance uses lender profile notes for AI assistance'
    });
    
    console.log(`Document uploaded. Terrance will use lender notes for AI context.`);
    
    return {
      success: true,
      message: "Document uploaded successfully. Terrance will use information from lender notes."
    };
  } catch (error) {
    console.error("Error in simplified document processing:", error);
    
    // Update the document with an error status
    await updateDoc(doc(db, 'lenderDocuments', documentId), {
      processed: false,
      processingStatus: `Processing error: ${error.message}`
    });
    
    throw error;
  }
} 