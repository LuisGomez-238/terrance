import React, { useState, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { 
  collection, 
  addDoc, 
  getDocs,
  getDoc,
  doc, 
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { storage, db } from '../../firebase';
import { useAuth } from '../../AuthContext';
import { useLoading } from '../../contexts/LoadingContext';
import './LenderDocuments.scss';
import { Link } from 'react-router-dom';
import { processDocument } from '../../utils/pdfProcessor';

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
    const documentsRef = collection(db, 'lenderDocuments');
    const documentsSnapshot = await getDocs(documentsRef);
    const documentsData = [];
    
    for (const docSnapshot of documentsSnapshot.docs) {
      const data = docSnapshot.data();
      
      // Get lender name
      let lenderName = 'Unknown';
      if (data.lenderId) {
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
        processingStatus: data.processingStatus || 'Not processed'
      });
    }
    
    setDocuments(documentsData);
  };

  // Handle file selection
  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
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
      
      // Create a reference to the file in Firebase Storage
      const timestamp = Date.now();
      const fileExtension = file.name.split('.').pop();
      const storageFileName = `lender_docs/${selectedLender}_${documentType}_${timestamp}.${fileExtension}`;
      const storageRef = ref(storage, storageFileName);
      
      // When uploading the file
      const metadata = {
        contentType: 'application/pdf',
        customMetadata: {
          'lenderId': selectedLender,
          'documentType': documentType,
          'userId': currentUser.uid
        }
      };
      
      // Upload the file
      await uploadBytes(storageRef, file, metadata);
      
      // Get the download URL
      const downloadURL = await getDownloadURL(storageRef);
      
      // Add document to Firestore
      const docData = {
        fileName: file.name,
        type: documentType,
        lenderId: selectedLender,
        uploadDate: serverTimestamp(),
        fileUrl: downloadURL,
        processed: false,
        processingStatus: 'Uploading document'
      };
      
      const docRef = await addDoc(collection(db, 'lenderDocuments'), docData);
      const documentId = docRef.id;
      
      // Process the document using our simplified approach
      showLoading("Finalizing upload...");
      await processDocument(file, documentId, selectedLender, documentType);
      
      // Clear the form
      setFile(null);
      setSelectedLender('');
      document.getElementById('file-upload').value = '';
      
      setSuccess("Document uploaded successfully! Terrance will use your lender notes to provide advice.");
      
      // Refresh document list
      await fetchDocuments();
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
    if (!window.confirm("Are you sure you want to delete this document?")) {
      return;
    }
    
    try {
      showLoading("Deleting document...");
      
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

  return (
    <div className="lender-documents-container">
      <div className="documents-header">
        <h1>Lender Documents</h1>
        <p>Upload and manage lender guidelines, rate sheets, and reference documents</p>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}
      
      <div className="document-upload-section">
        <h2>Upload New Document</h2>
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
          </div>
          
          <button 
            type="submit" 
            className="upload-btn"
            disabled={!file || !selectedLender || isProcessing || isUploading}
          >
            {isUploading ? 'Uploading...' : isProcessing ? 'Processing...' : 'Upload Document'}
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
                  <tr key={document.id}>
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
                    </td>
                    <td className="actions">
                      <Link 
                        to={`/lender-documents/${document.id}`}
                        className="view-details-btn"
                      >
                        <span className="material-icons">info</span>
                      </Link>
                      <a 
                        href={document.fileUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="view-pdf-btn"
                      >
                        <span className="material-icons">visibility</span>
                      </a>
                      <button 
                        onClick={() => handleDelete(document.id, document.fileUrl)}
                        className="delete-btn"
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
    </div>
  );
}

export default LenderDocuments;
