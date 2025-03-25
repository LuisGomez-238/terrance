import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { useAuth } from '../../AuthContext';
import { useLoading } from '../../contexts/LoadingContext';
import './DocumentViewer.scss';

function DocumentViewer() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showLoading, hideLoading } = useLoading();
  
  const [document, setDocument] = useState(null);
  const [lender, setLender] = useState(null);
  const [error, setError] = useState(null);
  const [keyPoints, setKeyPoints] = useState([]);
  const [editingKeyPoint, setEditingKeyPoint] = useState(null);
  const [editingKeyPointIndex, setEditingKeyPointIndex] = useState(null);
  const [newKeyPoint, setNewKeyPoint] = useState('');
  
  // Document type mapping
  const documentTypes = {
    'guidelines': 'Lending Guidelines',
    'ratesheet': 'Rate Sheet',
    'forms': 'Application Forms',
    'reference': 'Quick Reference'
  };
  
  // Fetch document data
  useEffect(() => {
    const fetchDocument = async () => {
      if (!documentId) return;
      
      try {
        showLoading("Loading document details...");
        
        const docRef = doc(db, 'lenderDocuments', documentId);
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) {
          setError("Document not found");
          hideLoading();
          return;
        }
        
        const documentData = docSnap.data();
        setDocument(documentData);
        
        // Fetch lender details
        if (documentData.lenderId) {
          const lenderRef = doc(db, 'lenders', documentData.lenderId);
          const lenderSnap = await getDoc(lenderRef);
          
          if (lenderSnap.exists()) {
            setLender(lenderSnap.data());
          }
        }
        
        // Set key points
        if (documentData.keyPoints && Array.isArray(documentData.keyPoints)) {
          setKeyPoints(documentData.keyPoints);
        }
        
        hideLoading();
      } catch (err) {
        console.error("Error fetching document:", err);
        setError("Failed to load document details");
        hideLoading();
      }
    };
    
    fetchDocument();
  }, [documentId]);
  
  // Delete document
  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this document?")) {
      return;
    }
    
    try {
      showLoading("Deleting document...");
      
      // Delete from Storage if URL exists
      if (document.fileUrl) {
        try {
          const fileUrlObj = new URL(document.fileUrl);
          const pathName = fileUrlObj.pathname;
          const filePath = pathName.split('/o/')[1]?.split('?')[0];
          
          if (filePath) {
            const storageRef = ref(storage, decodeURIComponent(filePath));
            await deleteObject(storageRef);
          }
        } catch (storageErr) {
          console.error("Error deleting file from storage:", storageErr);
        }
      }
      
      // Delete from Firestore
      await deleteDoc(doc(db, 'lenderDocuments', documentId));
      
      hideLoading();
      navigate('/lender-documents');
    } catch (err) {
      setError("Failed to delete document: " + err.message);
      hideLoading();
    }
  };
  
  // Add new key point
  const handleAddKeyPoint = async () => {
    if (!newKeyPoint.trim()) return;
    
    try {
      const updatedKeyPoints = [...keyPoints, newKeyPoint.trim()];
      
      // Update in Firestore
      await updateDoc(doc(db, 'lenderDocuments', documentId), {
        keyPoints: updatedKeyPoints
      });
      
      setKeyPoints(updatedKeyPoints);
      setNewKeyPoint('');
    } catch (err) {
      console.error("Error adding key point:", err);
      setError("Failed to add key point");
    }
  };
  
  // Edit key point
  const handleStartEditKeyPoint = (index, point) => {
    setEditingKeyPointIndex(index);
    setEditingKeyPoint(point);
  };
  
  // Save edited key point
  const handleSaveKeyPoint = async () => {
    if (!editingKeyPoint.trim() || editingKeyPointIndex === null) return;
    
    try {
      const updatedKeyPoints = [...keyPoints];
      updatedKeyPoints[editingKeyPointIndex] = editingKeyPoint.trim();
      
      // Update in Firestore
      await updateDoc(doc(db, 'lenderDocuments', documentId), {
        keyPoints: updatedKeyPoints
      });
      
      setKeyPoints(updatedKeyPoints);
      setEditingKeyPointIndex(null);
      setEditingKeyPoint(null);
    } catch (err) {
      console.error("Error updating key point:", err);
      setError("Failed to update key point");
    }
  };
  
  // Delete key point
  const handleDeleteKeyPoint = async (index) => {
    if (!window.confirm("Are you sure you want to delete this key point?")) {
      return;
    }
    
    try {
      const updatedKeyPoints = keyPoints.filter((_, i) => i !== index);
      
      // Update in Firestore
      await updateDoc(doc(db, 'lenderDocuments', documentId), {
        keyPoints: updatedKeyPoints
      });
      
      setKeyPoints(updatedKeyPoints);
    } catch (err) {
      console.error("Error deleting key point:", err);
      setError("Failed to delete key point");
    }
  };
  
  if (error) {
    return (
      <div className="document-viewer error">
        <h2>Error</h2>
        <p>{error}</p>
        <Link to="/lender-documents" className="btn-back">Return to Documents</Link>
      </div>
    );
  }
  
  if (!document) {
    return <div className="document-viewer loading">Loading document...</div>;
  }
  
  return (
    <div className="document-viewer">
      <div className="document-header">
        <div className="header-left">
          <Link to="/lender-documents" className="btn-back">
            <span className="material-icons">arrow_back</span>
            Back to Documents
          </Link>
          <h1>
            {document.fileName}
            <span className="document-type">
              {documentTypes[document.type] || document.type}
            </span>
          </h1>
        </div>
        
        <div className="header-actions">
          <a 
            href={document.fileUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="btn-view"
          >
            <span className="material-icons">visibility</span>
            View PDF
          </a>
          <button 
            className="btn-delete"
            onClick={handleDelete}
          >
            <span className="material-icons">delete</span>
            Delete
          </button>
        </div>
      </div>
      
      <div className="document-details">
        <div className="details-section">
          <h2>Document Details</h2>
          <div className="detail-item">
            <span className="detail-label">Lender:</span>
            <span className="detail-value">{lender ? lender.name : 'Unknown'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Type:</span>
            <span className="detail-value">{documentTypes[document.type] || document.type}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Uploaded:</span>
            <span className="detail-value">
              {document.uploadDate ? new Date(document.uploadDate.seconds * 1000).toLocaleString() : 'Unknown'}
            </span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Processing Status:</span>
            <span className={`detail-value status ${document.processed ? 'processed' : 'pending'}`}>
              {document.processingStatus || 'Unknown'}
            </span>
          </div>
        </div>
        
        <div className="key-points-section">
          <h2>Key Points</h2>
          <p className="section-description">
            These key points are extracted from the document and used by Terrance in AI responses.
          </p>
          
          <div className="key-points-list">
            {keyPoints.length === 0 ? (
              <div className="no-key-points">No key points extracted yet.</div>
            ) : (
              keyPoints.map((point, index) => (
                <div className="key-point-item" key={index}>
                  {editingKeyPointIndex === index ? (
                    <div className="key-point-edit">
                      <textarea
                        value={editingKeyPoint}
                        onChange={(e) => setEditingKeyPoint(e.target.value)}
                        rows={3}
                      />
                      <div className="edit-actions">
                        <button 
                          className="btn-save"
                          onClick={handleSaveKeyPoint}
                        >
                          Save
                        </button>
                        <button 
                          className="btn-cancel"
                          onClick={() => {
                            setEditingKeyPointIndex(null);
                            setEditingKeyPoint(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="key-point-content">
                        <span className="bullet">•</span>
                        {point}
                      </div>
                      <div className="key-point-actions">
                        <button 
                          onClick={() => handleStartEditKeyPoint(index, point)}
                          className="btn-edit"
                        >
                          <span className="material-icons">edit</span>
                        </button>
                        <button 
                          onClick={() => handleDeleteKeyPoint(index)}
                          className="btn-delete"
                        >
                          <span className="material-icons">delete</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
          
          <div className="add-key-point">
            <textarea
              placeholder="Add a new key point..."
              value={newKeyPoint}
              onChange={(e) => setNewKeyPoint(e.target.value)}
              rows={2}
            />
            <button 
              onClick={handleAddKeyPoint}
              disabled={!newKeyPoint.trim()}
              className="btn-add"
            >
              Add Key Point
            </button>
          </div>
        </div>
      </div>
      
      {document.extractedContent && (
        <div className="extracted-content-section">
          <h2>Extracted Content</h2>
          <p className="section-description">
            This is the raw text extracted from the document using Document AI.
          </p>
          <div className="extracted-content">
            {document.extractedContent}
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentViewer;
