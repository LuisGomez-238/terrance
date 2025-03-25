const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;

admin.initializeApp();

// Process lender documents with Document AI
exports.processLenderDocument = functions.firestore
  .document('lenderDocuments/{documentId}')
  .onCreate(async (snap, context) => {
    const documentData = snap.data();
    const { fileUrl, lenderId, type } = documentData;
    
    // Update processing status
    await snap.ref.update({ processingStatus: 'Processing started' });
    
    try {
      // Initialize Document AI client
      const client = new DocumentProcessorServiceClient();
      
      // Get the processor ID based on document type
      const processorId = getProcessorId(type);
      
      // Process the document with Document AI
      const processedDocument = await processDocument(client, processorId, fileUrl);
      
      // Extract structured data
      const extractedData = extractDataFromDocument(processedDocument, type);
      
      // Update lender record with extracted data
      await updateLenderWithExtractedData(lenderId, extractedData, type);
      
      // Update document record with success status
      await snap.ref.update({
        processed: true,
        processingStatus: 'Processed successfully',
        processedDate: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return { status: 'success' };
    } catch (error) {
      console.error('Error processing document:', error);
      
      // Update document with error status
      await snap.ref.update({
        processed: false,
        processingStatus: `Processing failed: ${error.message}`,
        processedDate: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return { status: 'error', message: error.message };
    }
  });

// Helper function to get processor ID based on document type
function getProcessorId(type) {
  switch (type) {
    case 'guidelines':
      return 'guidelines-processor';
    case 'ratesheet':
      return 'ratesheet-processor';
    default:
      return 'general-processor';
  }
}

// Helper function to process document with Document AI
async function processDocument(client, processorId, fileUrl) {
  // Fetch file from storage
  const bucket = admin.storage().bucket();
  const fileBuffer = await bucket.file(fileUrl).download();
  
  // Process with Document AI
  const request = {
    name: `projects/PROJECT_ID/locations/LOCATION/processors/${processorId}`,
    rawDocument: {
      content: fileBuffer[0].toString('base64'),
      mimeType: 'application/pdf',
    }
  };
  
  const [result] = await client.processDocument(request);
  return result.document;
}

// Extract data based on document type
function extractDataFromDocument(document, type) {
  // Implementation depends on your Document AI processor setup
  // This is a simplified example
  const extractedData = {};
  
  switch (type) {
    case 'guidelines':
      // Extract credit tiers, loan terms, etc.
      extractedData.creditTiers = extractCreditTiers(document);
      extractedData.vehicleRestrictions = extractVehicleRestrictions(document);
      break;
    case 'ratesheet':
      // Extract interest rates by tier and term
      extractedData.rates = extractRates(document);
      break;
    // Add other document types as needed
  }
  
  return extractedData;
}

// Update lender record with extracted data
async function updateLenderWithExtractedData(lenderId, extractedData, documentType) {
  const lenderRef = admin.firestore().collection('lenders').doc(lenderId);
  
  // Different update strategy based on document type
  switch (documentType) {
    case 'guidelines':
      await lenderRef.update({
        creditTiers: extractedData.creditTiers || admin.firestore.FieldValue.arrayUnion(),
        vehicleRestrictions: extractedData.vehicleRestrictions || {},
        guidelinesLastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
      break;
    case 'ratesheet':
      // Update rates for each credit tier
      const lenderDoc = await lenderRef.get();
      const lenderData = lenderDoc.data();
      const updatedCreditTiers = updateCreditTiersWithRates(
        lenderData.creditTiers || [], 
        extractedData.rates || {}
      );
      
      await lenderRef.update({
        creditTiers: updatedCreditTiers,
        rateSheetLastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
      break;
    // Add other document types as needed
  }
}
