const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Storage } = require('@google-cloud/storage');
const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;
const axios = require('axios');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const storage = new Storage();
const firestore = admin.firestore();

// Process new lender documents
exports.processLenderDocument = functions.firestore
  .document('lenderDocuments/{documentId}')
  .onCreate(async (snap, context) => {
    const documentData = snap.data();
    const documentId = context.params.documentId;
    const { fileUrl, lenderId, type, fileName } = documentData;
    
    console.log(`Processing document ${documentId}: ${fileName} for lender ${lenderId}`);
    
    // Update status to processing
    await snap.ref.update({
      processingStatus: 'Processing started'
    });
    
    try {
      // 1. Download the PDF from Firebase Storage
      const fileUrlObj = new URL(fileUrl);
      const pathName = fileUrlObj.pathname;
      const bucket = storage.bucket('terrance-40e13.appspot.com');
      const filePath = pathName.split('/o/')[1]?.split('?')[0];
      
      if (!filePath) {
        throw new Error('Invalid file URL');
      }
      
      const tempFilePath = `/tmp/${fileName}`;
      await bucket.file(decodeURIComponent(filePath)).download({
        destination: tempFilePath
      });
      
      console.log(`Downloaded file to ${tempFilePath}`);
      
      // 2. Process with Document AI
      const documentContent = await processDocumentWithAI(tempFilePath, type);
      
      console.log(`Document AI processing complete for ${documentId}`);
      
      // 3. Extract key points using OpenAI
      const keyPoints = await extractKeyPoints(documentContent, type);
      
      console.log(`Extracted ${keyPoints.length} key points for ${documentId}`);
      
      // 4. Update Firestore with extracted content
      await snap.ref.update({
        processed: true,
        processingStatus: 'Processed successfully',
        processedDate: admin.firestore.FieldValue.serverTimestamp(),
        extractedContent: documentContent,
        keyPoints: keyPoints
      });
      
      // 5. Update the lender record with document data
      await updateLenderWithDocumentData(lenderId, type, keyPoints, documentContent);
      
      console.log(`Document ${documentId} processed successfully`);
      
      return { success: true, documentId };
    } catch (error) {
      console.error(`Error processing document ${documentId}:`, error);
      
      // Update document with error status
      await snap.ref.update({
        processed: false,
        processingStatus: `Processing failed: ${error.message}`,
        processedDate: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return { success: false, error: error.message };
    }
  });

// Process document with Document AI
async function processDocumentWithAI(filePath, type) {
  // Get Document AI client
  const client = new DocumentProcessorServiceClient();
  
  // Read file content
  const fs = require('fs');
  const documentContent = fs.readFileSync(filePath);
  
  // Determine processor based on document type
  const processorId = getProcessorIdForType(type);
  const processorName = `projects/your-project/locations/us-central1/processors/${processorId}`;
  
  // Process document
  const request = {
    name: processorName,
    rawDocument: {
      content: documentContent.toString('base64'),
      mimeType: 'application/pdf'
    }
  };
  
  const [result] = await client.processDocument(request);
  const { document } = result;
  
  // Extract text from document
  const fullText = document.text;
  
  return fullText;
}

// Extract key points using OpenAI
async function extractKeyPoints(documentContent, type) {
  // Use OpenAI to extract key points from the document content
  const openAIRequest = {
    model: "gpt-4", // Use powerful model for extraction
    messages: [
      {
        role: "system",
        content: `You are an expert in automotive finance. Extract the key points from the following ${getDocumentTypeName(type)} document. 
Focus on:
1. Credit score requirements
2. Interest rates for different tiers
3. Special programs or promotions
4. Vehicle restrictions (age, mileage)
5. Maximum loan amounts
6. Documentation requirements
7. Backend profit opportunities

Return only a list of 5-10 concise bullet points with the most important information.`
      },
      {
        role: "user",
        content: documentContent.substring(0, 15000) // Limit content length
      }
    ],
    temperature: 0.3, // Low temperature for factual extraction
    max_tokens: 1000
  };
  
  // Get API key from Firebase config (must be set before deployment)
  const openAIApiKey = functions.config().openai?.apikey || process.env.OPENAI_API_KEY;
  
  if (!openAIApiKey) {
    throw new Error('OpenAI API key not found. Set it with firebase functions:config:set openai.apikey="YOUR_API_KEY"');
  }
  
  const openAIResponse = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    openAIRequest,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAIApiKey}`
      }
    }
  );
  
  const content = openAIResponse.data.choices[0].message.content;
  
  // Parse bullet points
  const bulletPoints = content
    .split('\n')
    .filter(line => line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().match(/^\d+\./))
    .map(line => line.replace(/^[•\-\d+\.]\s*/, '').trim())
    .filter(line => line.length > 0);
  
  return bulletPoints;
}

// Update lender record with document data
async function updateLenderWithDocumentData(lenderId, type, keyPoints, documentContent) {
  const lenderRef = firestore.collection('lenders').doc(lenderId);
  const lenderDoc = await lenderRef.get();
  
  if (!lenderDoc.exists) {
    console.log(`Lender ${lenderId} not found`);
    return;
  }
  
  const lenderData = lenderDoc.data();
  
  // Update lender based on document type
  let updateData = {};
  
  switch (type) {
    case 'guidelines':
      updateData = {
        guidelinesLastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        guidelinesKeyPoints: keyPoints,
        guidelinesSummary: documentContent.substring(0, 1000) // First 1000 chars as summary
      };
      break;
      
    case 'ratesheet':
      updateData = {
        rateSheetLastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        rateSheetKeyPoints: keyPoints,
        rateSheetSummary: documentContent.substring(0, 1000)
      };
      break;
      
    case 'reference':
      updateData = {
        referenceDocLastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        referenceKeyPoints: keyPoints,
        referenceSummary: documentContent.substring(0, 1000)
      };
      break;
  }
  
  // Add document content to notes if notes field exists
  if (lenderData.notes !== undefined) {
    updateData.notes = `${lenderData.notes || ''}\n\nKey points from ${getDocumentTypeName(type)} (auto-extracted):\n${keyPoints.map(point => `- ${point}`).join('\n')}`;
  }
  
  // Update lender with extracted information
  await lenderRef.update(updateData);
  
  console.log(`Updated lender ${lenderId} with ${type} document data`);
}

// Helper function to get processor ID based on document type
function getProcessorIdForType(type) {
  const processors = {
    guidelines: 'f5b3c6426e8989e8',
    ratesheet: 'f5b3c6426e8989e8',
    reference: 'f5b3c6426e8989e8',
    forms: 'f5b3c6426e8989e8'
  };
  
  return processors[type] || processors.guidelines;
}

// Helper function to get document type name
function getDocumentTypeName(type) {
  const types = {
    'guidelines': 'Lending Guidelines',
    'ratesheet': 'Rate Sheet',
    'forms': 'Application Forms',
    'reference': 'Quick Reference'
  };
  
  return types[type] || type;
}
