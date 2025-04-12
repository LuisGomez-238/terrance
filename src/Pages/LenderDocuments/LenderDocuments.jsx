import React, { useState, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { 
  collection, 
  addDoc, 
  getDocs,
  getDoc,
  doc, 
  deleteDoc,
  updateDoc,
  serverTimestamp,
  query,
  where
} from 'firebase/firestore';
import { storage, db } from '../../firebase';
import { useAuth } from '../../AuthContext';
import { useLoading } from '../../contexts/LoadingContext';
import './LenderDocuments.scss';
import { Link } from 'react-router-dom';
import { uploadAndAssociateLenderDocument } from '../../services/vectorStoreService';

// Add this new component for document preview
const DocumentPreview = ({ document }) => {
  if (!document || !document.storageUrl) {
    return (
      <div className="document-preview-placeholder">
        <span className="material-icons">insert_drive_file</span>
        <p>No preview available</p>
      </div>
    );
  }
  
  if (document.fileName.toLowerCase().endsWith('.pdf')) {
    return (
      <div className="document-preview">
        <iframe
          src={`${document.storageUrl}#toolbar=0`}
          width="100%"
          height="500px"
          title={document.fileName}
        />
        <div className="preview-actions">
          <a href={document.storageUrl} target="_blank" rel="noopener noreferrer" className="open-btn">
            <span className="material-icons">open_in_new</span>
            Open in new tab
          </a>
        </div>
      </div>
    );
  } else if (document.fileName.toLowerCase().endsWith('.txt') || document.isNotes) {
    return (
      <div className="document-preview text-preview">
        <div className="text-content">
          {document.content || 'Content not available for preview. Please download the file.'}
        </div>
        <div className="preview-actions">
          <a href={document.storageUrl} target="_blank" rel="noopener noreferrer" className="download-btn">
            <span className="material-icons">download</span>
            Download
          </a>
        </div>
      </div>
    );
  } else {
    // For other document types (docx, etc)
    return (
      <div className="document-preview-placeholder">
        <span className="material-icons">description</span>
        <p>Preview not available for this file type</p>
        <a href={document.storageUrl} target="_blank" rel="noopener noreferrer" className="download-btn">
          <span className="material-icons">download</span>
          Download document
        </a>
      </div>
    );
  }
};

function LenderDocuments() {
  const { currentUser } = useAuth();
  const { showLoading, hideLoading } = useLoading();
  const [documents, setDocuments] = useState([]);
  const [file, setFile] = useState(null);
  const [lenders, setLenders] = useState([]);
  const [selectedLender, setSelectedLender] = useState('');
  const [documentType, setDocumentType] = useState('guidelines');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Document types
  const documentTypes = [
    { id: 'guidelines', name: 'Lending Guidelines' },
    { id: 'ratesheet', name: 'Rate Sheet' },
    { id: 'forms', name: 'Application Forms' },
    { id: 'reference', name: 'Quick Reference' }
  ];

  // Fetch lenders and documents on load
  useEffect(() => {
    const fetchData = async () => {
      try {
        showLoading("Loading lender documents...");
        await fetchLenders();
        await fetchDocuments();
      } catch (err) {
        setError("Failed to load data: " + err.message);
        console.error("Error loading data:", err);
      } finally {
        hideLoading();
      }
    };
    
    fetchData();
  }, [currentUser]);

  // Fetch lenders from Firestore
  const fetchLenders = async () => {
    const lendersRef = collection(db, 'lenders');
    const lendersSnapshot = await getDocs(lendersRef);
    const lendersData = [];
    
    lendersSnapshot.forEach(doc => {
      lendersData.push({
        id: doc.id,
        name: doc.data().name || 'Unknown Lender'
      });
    });
    
    setLenders(lendersData);
  };

  // Fetch documents from Firestore
  const fetchDocuments = async () => {
    try {
      showLoading("Loading lender documents...");
      setError(null);
      
      // First try the main lenderDocuments collection
      const documentsRef = collection(db, 'lenderDocuments');
      const documentsSnapshot = await getDocs(documentsRef);
      const documentsData = [];
      
      for (const docSnapshot of documentsSnapshot.docs) {
        const data = docSnapshot.data();
        
        // Get lender name if not already included
        let lenderName = data.lenderName || 'Unknown';
        if (data.lenderId && !data.lenderName) {
          const lenderDoc = doc(db, 'lenders', data.lenderId);
          try {
            const lenderSnapshot = await getDoc(lenderDoc);
            if (lenderSnapshot.exists()) {
              lenderName = lenderSnapshot.data().name || 'Unknown';
            }
          } catch (err) {
            console.error("Error fetching lender:", err);
          }
        }
        
        documentsData.push({
          id: docSnapshot.id,
          fileName: data.fileName || 'Unknown file',
          type: data.type || 'guidelines',
          lenderId: data.lenderId || '',
          lenderName,
          uploadDate: data.uploadDate ? new Date(data.uploadDate.seconds * 1000) : new Date(),
          fileUrl: data.fileUrl || '',
          processed: data.processed || false,
          processingStatus: data.processingStatus || 'Not processed',
          vectorStoreId: data.vectorStoreId || null,
          openaiFileId: data.openaiFileId || null,
          source: 'main_collection'
        });
      }
      
      // Now, also check the user-specific collection as a fallback
      if (currentUser) {
        const userLenderDocsRef = collection(db, 'userConfig', currentUser.uid, 'lenderDocuments');
        const userDocsSnapshot = await getDocs(userLenderDocsRef);
        
        for (const docSnapshot of userDocsSnapshot.docs) {
          const data = docSnapshot.data();
          
          // Check if this document is already in our list (by openaiFileId)
          const isDuplicate = documentsData.some(
            doc => doc.openaiFileId && doc.openaiFileId === data.openaiFileId
          );
          
          if (!isDuplicate) {
            // Get lender name if not already included
            let lenderName = data.lenderName || 'Unknown';
            if (data.lenderId && !data.lenderName) {
              const lenderDoc = doc(db, 'lenders', data.lenderId);
              try {
                const lenderSnapshot = await getDoc(lenderDoc);
                if (lenderSnapshot.exists()) {
                  lenderName = lenderSnapshot.data().name || 'Unknown';
                }
              } catch (err) {
                console.error("Error fetching lender:", err);
              }
            }
            
            documentsData.push({
              id: docSnapshot.id,
              fileName: data.fileName || 'Unknown file',
              type: data.type || 'guidelines',
              lenderId: data.lenderId || '',
              lenderName,
              uploadDate: data.uploadDate ? new Date(data.uploadDate.seconds * 1000) : new Date(),
              fileUrl: data.fileUrl || '',
              processed: data.processed || Boolean(data.status === 'vector_store_indexed'),
              processingStatus: data.processingStatus || 
                (data.status === 'vector_store_indexed' ? 'Indexed in Terrance Vector Store' : 'Not processed'),
              vectorStoreId: data.vectorStoreId || null,
              openaiFileId: data.openaiFileId || null,
              source: 'user_collection'
            });
          }
        }
      }
      
      // Sort documents by upload date (newest first)
      documentsData.sort((a, b) => b.uploadDate - a.uploadDate);
      
      console.log(`Fetched ${documentsData.length} lender documents`, 
        documentsData.map(d => ({
          name: d.fileName,
          lender: d.lenderName,
          source: d.source,
          id: d.openaiFileId
        }))
      );
      
      setDocuments(documentsData);
      
      // If no documents found, show a helpful message
      if (documentsData.length === 0) {
        setError("No lender documents found. Upload documents to enhance Terrance's knowledge.");
      }
    } catch (err) {
      setError("Failed to load documents: " + err.message);
      console.error("Error loading documents:", err);
    } finally {
      hideLoading();
    }
  };

  // Handle file selection
  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  // Process document with vector store
  const processDocument = async (file, documentId, lenderId, documentType) => {
    try {
      setIsProcessing(true);
      
      // Get the lender name
      let lenderName = "Unknown Lender";
      try {
        const lenderDoc = doc(db, 'lenders', lenderId);
        const lenderSnapshot = await getDoc(lenderDoc);
        if (lenderSnapshot.exists()) {
          lenderName = lenderSnapshot.data().name || 'Unknown Lender';
        }
      } catch (lenderError) {
        console.warn("Could not get lender name:", lenderError);
      }
      
      // Update document status
      const docRef = doc(db, 'lenderDocuments', documentId);
      await updateDoc(docRef, {
        processingStatus: 'Processing document for Terrance...'
      });
      
      // Upload to vector store via our service
      const result = await uploadAndAssociateLenderDocument(lenderId, lenderName, file);
      
      // Update the document with the processing result
      await updateDoc(docRef, {
        processed: true,
        processingStatus: 'Indexed in Terrance Vector Store',
        vectorStoreId: result.vectorStoreId,
        openaiFileId: result.openaiFileId,
        updatedAt: serverTimestamp()
      });
      
      console.log(`Document successfully processed and added to vector store: ${result.vectorStoreId}`);
      return result;
    } catch (error) {
      console.error("Error processing document:", error);
      
      // Update document with error status
      try {
        const docRef = doc(db, 'lenderDocuments', documentId);
        await updateDoc(docRef, {
          processed: false,
          processingStatus: `Processing failed: ${error.message}`,
          updatedAt: serverTimestamp()
        });
      } catch (updateError) {
        console.error("Error updating document status:", updateError);
      }
      
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file || !selectedLender) {
      setError("Please select a file and lender");
      return;
    }
    
    try {
      showLoading("Uploading document...");
      setError(null);
      setSuccess(null);
      setIsUploading(true);
      
      // Get the lender name
      let lenderName = "Unknown Lender";
      const selectedLenderObj = lenders.find(l => l.id === selectedLender);
      if (selectedLenderObj) {
        lenderName = selectedLenderObj.name;
      }
      
      // Option 1: Use the direct uploadAndAssociateLenderDocument method
      // This handles both OpenAI vector store upload and Firebase Storage
      const uploadResult = await uploadAndAssociateLenderDocument(
        selectedLender, 
        lenderName, 
        file
      );
      
      // Clear the form
      setFile(null);
      setSelectedLender('');
      document.getElementById('file-upload').value = '';
      
      setSuccess(`Document uploaded successfully! ${uploadResult.apiSuccess 
        ? 'It has been added to Terrance\'s knowledge base.' 
        : 'It will be processed and added to Terrance\'s knowledge base soon.'}`);
      
      // Refresh document list
      await fetchDocuments();
      
      console.log(`Document uploaded successfully. Document ID: ${uploadResult.documentId}, OpenAI File ID: ${uploadResult.openaiFileId}`);
    } catch (err) {
      setError("Upload failed: " + err.message);
      console.error("Error uploading document:", err);
    } finally {
      hideLoading();
      setIsUploading(false);
    }
  };

  // Delete document
  const handleDelete = async (documentId, fileUrl) => {
    if (!window.confirm("Are you sure you want to delete this document? This will remove it from Terrance's knowledge base.")) {
      return;
    }
    
    try {
      showLoading("Deleting document...");
      
      // Find the document to get the OpenAI file ID if available
      const documentToDelete = documents.find(doc => doc.id === documentId);
      const openaiFileId = documentToDelete?.openaiFileId;
      
      // Delete from Storage if URL exists
      if (fileUrl) {
        try {
          const storageRef = ref(storage, fileUrl);
          await deleteObject(storageRef);
        } catch (storageErr) {
          console.error("Error deleting file from storage:", storageErr);
        }
      }
      
      // Delete from Firestore
      await deleteDoc(doc(db, 'lenderDocuments', documentId));
      
      // TODO: In the future, implement removal from the vector store if needed
      if (openaiFileId) {
        console.log(`Note: The file ${openaiFileId} remains in the vector store but is no longer referenced.`);
      }
      
      setSuccess("Document deleted successfully!");
      
      // Refresh document list
      await fetchDocuments();
    } catch (err) {
      setError("Delete failed: " + err.message);
      console.error("Error deleting document:", err);
    } finally {
      hideLoading();
    }
  };

  // Test document with Terrance
  const testWithTerrance = (lenderId, lenderName) => {
    // Navigate to AI Assistant with context about this lender
    window.location.href = `/ai-assistant?topic=lender&id=${lenderId}&name=${encodeURIComponent(lenderName)}`;
  };

  // Add this function to the LenderDocuments component
  const syncUserDocumentsToMain = async () => {
    if (!currentUser) return;
    
    try {
      showLoading("Syncing documents...");
      setError(null);
      setSuccess(null);
      
      // Get all documents from user collection
      const userLenderDocsRef = collection(db, 'userConfig', currentUser.uid, 'lenderDocuments');
      const userDocsSnapshot = await getDocs(userLenderDocsRef);
      
      if (userDocsSnapshot.empty) {
        setSuccess("No user documents to sync");
        return;
      }
      
      let synced = 0;
      let failed = 0;
      
      for (const docSnapshot of userDocsSnapshot.docs) {
        const data = docSnapshot.data();
        
        // Check if this document already exists in main collection by openaiFileId
        if (data.openaiFileId) {
          const mainDocsRef = collection(db, 'lenderDocuments');
          const queryMain = query(mainDocsRef, where('openaiFileId', '==', data.openaiFileId));
          const mainSnapshot = await getDocs(queryMain);
          
          if (mainSnapshot.empty) {
            // Document doesn't exist in main collection, add it
            try {
              const docData = {
                fileName: data.fileName || 'Unknown file',
                lenderId: data.lenderId || '',
                lenderName: data.lenderName || 'Unknown',
                type: data.fileName?.split('.').pop() === 'pdf' ? 'guidelines' : 'other',
                uploadDate: serverTimestamp(),
                fileUrl: data.fileUrl || '',
                processed: true,
                processingStatus: 'Indexed in Terrance Vector Store',
                openaiFileId: data.openaiFileId,
                vectorStoreId: data.vectorStoreId || TERRANCE_VECTOR_STORE_ID,
                addedBy: currentUser.uid
              };
              
              await addDoc(collection(db, 'lenderDocuments'), docData);
              synced++;
            } catch (err) {
              console.error(`Failed to sync document ${data.fileName}:`, err);
              failed++;
            }
          }
        }
      }
      
      if (synced > 0) {
        setSuccess(`Successfully synced ${synced} documents${failed > 0 ? ` (${failed} failed)` : ''}`);
        // Refresh documents list
        await fetchDocuments();
      } else if (failed > 0) {
        setError(`Failed to sync ${failed} documents`);
      } else {
        setSuccess("All documents are already synced");
      }
    } catch (err) {
      setError("Sync failed: " + err.message);
      console.error("Error syncing documents:", err);
    } finally {
      hideLoading();
    }
  };

  // Add this function to open the preview modal
  const openDocumentPreview = (document) => {
    setSelectedDocument(document);
    setIsPreviewOpen(true);
  };

  // Add this function to close the preview modal
  const closeDocumentPreview = () => {
    setIsPreviewOpen(false);
    setSelectedDocument(null);
  };

  return (
    <div className="lender-documents-container">
      <div className="documents-header">
        <div className="header-title">
          <h1>Lender Documents</h1>
          <p>Upload and manage lender guidelines, rate sheets, and reference documents for Terrance AI</p>
        </div>
        <div className="header-actions">
          <button onClick={syncUserDocumentsToMain} className="sync-btn">
            <span className="material-icons">sync</span>
            Sync Documents
          </button>
        </div>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}
      
      <div className="document-upload-section">
        <h2>Upload New Document</h2>
        <div className="upload-info">
          <span className="material-icons">info</span>
          <p>Documents uploaded here will be added to Terrance's knowledge base for providing accurate lender information.</p>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="lender-select">Lender</label>
            <select 
              id="lender-select"
              value={selectedLender}
              onChange={(e) => setSelectedLender(e.target.value)}
              required
            >
              <option value="">Select Lender</option>
              {lenders.map(lender => (
                <option key={lender.id} value={lender.id}>{lender.name}</option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label htmlFor="document-type">Document Type</label>
            <select 
              id="document-type"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              required
            >
              {documentTypes.map(type => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label htmlFor="file-upload">PDF File</label>
            <input 
              id="file-upload"
              type="file" 
              onChange={handleFileChange}
              accept="application/pdf"
              required
            />
            <p className="file-hint">For best results, upload clear, text-based PDFs (not scanned images).</p>
          </div>
          
          <button 
            type="submit" 
            className="upload-btn"
            disabled={!file || !selectedLender || isProcessing || isUploading}
          >
            {isUploading ? 'Uploading...' : isProcessing ? 'Processing for Terrance...' : 'Upload Document'}
          </button>
        </form>
      </div>
      
      <div className="documents-list-section">
        <h2>Uploaded Documents</h2>
        
        {documents.length === 0 ? (
          <div className="no-documents">
            <p>No documents uploaded yet</p>
          </div>
        ) : (
          <div className="documents-table-container">
            <table className="documents-table">
              <thead>
                <tr>
                  <th>Lender</th>
                  <th>File Name</th>
                  <th>Type</th>
                  <th>Upload Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map(document => (
                  <tr key={document.id} className={document.vectorStoreId ? 'in-vector-store' : ''}>
                    <td>{document.lenderName}</td>
                    <td>{document.fileName}</td>
                    <td>
                      {documentTypes.find(t => t.id === document.type)?.name || document.type}
                    </td>
                    <td>
                      {document.uploadDate.toLocaleDateString()}
                    </td>
                    <td className={`status ${document.processed ? 'processed' : 'pending'}`}>
                      {document.processingStatus}
                      {document.vectorStoreId && 
                        <span className="vector-badge" title="Document is in Terrance's knowledge base">
                          <span className="material-icons">psychology</span>
                        </span>
                      }
                    </td>
                    <td className="actions">
                      {document.storageUrl && (
                        <button
                          onClick={() => openDocumentPreview(document)}
                          className="preview-btn"
                          title="Preview document"
                        >
                          <span className="material-icons">visibility</span>
                        </button>
                      )}
                      <Link 
                        to={`/lender-documents/${document.id}`}
                        className="view-details-btn"
                        title="View document details"
                      >
                        <span className="material-icons">info</span>
                      </Link>
                      <a 
                        href={document.storageUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="view-pdf-btn"
                        title="View PDF"
                      >
                        <span className="material-icons">open_in_new</span>
                      </a>
                      {document.lenderId && (
                        <button
                          onClick={() => testWithTerrance(document.lenderId, document.lenderName)}
                          className="test-terrance-btn"
                          title="Test this lender with Terrance"
                        >
                          <span className="material-icons">smart_toy</span>
                        </button>
                      )}
                      <button 
                        onClick={() => handleDelete(document.id, document.fileUrl)}
                        className="delete-btn"
                        title="Delete document"
                      >
                        <span className="material-icons">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Document Preview Modal */}
      {isPreviewOpen && selectedDocument && (
        <div className="modal-overlay" onClick={closeDocumentPreview}>
          <div className="modal document-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedDocument.fileName}</h2>
              <button className="close-btn" onClick={closeDocumentPreview}>
                <span className="material-icons">close</span>
              </button>
            </div>
            <div className="modal-body">
              <DocumentPreview document={selectedDocument} />
            </div>
            <div className="modal-footer">
              <div className="document-info">
                <p><strong>Lender:</strong> {selectedDocument.lenderName}</p>
                <p><strong>Uploaded:</strong> {selectedDocument.uploadDate.toLocaleDateString()}</p>
                {selectedDocument.vectorStoreId && (
                  <p className="vector-store-status">
                    <span className="material-icons">psychology</span>
                    Available in Terrance's knowledge base
                  </p>
                )}
              </div>
              <button className="close-preview-btn" onClick={closeDocumentPreview}>
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LenderDocuments;
