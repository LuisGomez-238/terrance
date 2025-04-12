import React, { useState, useEffect } from 'react';
import { getLenders, createLender, updateLender, deleteLender } from '../../services/lenderService';
import './Lenders.scss';
import { useLoading } from '../../contexts/LoadingContext';
import { Link } from 'react-router-dom';
import { 
  updateLenderWithVectorStore, 
  fixVectorStoreAssociations,
  USER_CONFIG_COLLECTION,
  TERRANCE_VECTOR_STORE_ID,
  LENDER_DOCUMENTS_COLLECTION,
  UPLOADED_FILES_COLLECTION
} from '../../services/vectorStoreService';
import { collection, getDocs, query, where, getDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { auth } from '../../firebase';
import { getStorage, ref, getDownloadURL, listAll } from 'firebase/storage';
import { migrateDocumentsWithStorageUrls } from '../../services/vectorStoreService';

function Lenders() {
  const [lenders, setLenders] = useState([]);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState(window.innerWidth <= 768 ? 'card' : 'table');
  const [dataLoaded, setDataLoaded] = useState(false);
  
  // Form state for adding/editing lenders
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentLender, setCurrentLender] = useState(null);
  const [formData, setFormData] = useState({
    // Basic info only
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    notes: '',
    type: 'bank' // Default type
  });
  
  // Document modal state
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [currentLenderDocs, setCurrentLenderDocs] = useState([]);
  const [currentLenderForDocs, setCurrentLenderForDocs] = useState(null);
  const [documentModalLoading, setDocumentModalLoading] = useState(false);
  const [documentModalError, setDocumentModalError] = useState(null);
  
  const { showLoading, hideLoading } = useLoading();

  // Add file upload state
  const [selectedFiles, setSelectedFiles] = useState([]);

  // Add state for success message
  const [success, setSuccess] = useState(null);

  // Add state for the selected document in the Lenders component
  const [selectedDocument, setSelectedDocument] = useState(null);

  const storage = getStorage();

  useEffect(() => {
    loadLenders();
    
    // Add resize listener for responsive layout
    const handleResize = () => {
      setViewMode(window.innerWidth <= 768 ? 'card' : 'table');
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadLenders = async () => {
    try {
      showLoading("Loading lenders...");
      setError(null);
      
      const data = await getLenders();
      setLenders(data);
      setDataLoaded(true);
      
    } catch (err) {
      console.error('Error loading lenders:', err);
      setError('Failed to load lenders. Please try again.');
    } finally {
      hideLoading();
    }
  };

  // New function to fetch documents for a lender
  const fetchLenderDocuments = async (lenderId) => {
    try {
      setCurrentLenderDocs([]);
      setDocumentModalLoading(true);
      setDocumentModalError(null);
      
      // Get the lender info first to ensure we have it for the modal
      const lenderRef = doc(db, 'lenders', lenderId);
      const lenderSnapshot = await getDoc(lenderRef);
      
      if (lenderSnapshot.exists()) {
        const lenderData = lenderSnapshot.data();
        setCurrentLenderForDocs({
          id: lenderId,
          ...lenderData
        });
      }
      
      let allDocuments = [];
      
      // First, try to get documents from the lender profile
      try {
        const lenderRef = doc(db, 'lenders', lenderId);
        const lenderSnapshot = await getDoc(lenderRef);
        
        if (lenderSnapshot.exists()) {
          const lenderData = lenderSnapshot.data();
          
          if (lenderData.vectorStoreDocuments && Array.isArray(lenderData.vectorStoreDocuments)) {
            console.log(`Found ${lenderData.vectorStoreDocuments.length} documents in lender profile`);
            
            lenderData.vectorStoreDocuments.forEach(docData => {
              allDocuments.push({
                id: docData.openaiFileId,
                openaiFileId: docData.openaiFileId,
                fileName: docData.fileName || 'Unknown document',
                fileType: docData.fileType || 'unknown',
                uploadedAt: docData.uploadedAt || new Date().toISOString(),
                source: 'lender_profile',
                processed: docData.status === 'indexed',
                vectorStoreId: docData.vectorStoreId || TERRANCE_VECTOR_STORE_ID,
                storageUrl: docData.storageUrl || docData.url || null
              });
            });
          } else {
            console.log('No documents found in lender profile');
          }
        }
      } catch (lenderError) {
        console.warn(`Error fetching lender profile: ${lenderError.message}`);
      }
      
      // Then try to get documents from user's private collection
      try {
        const userId = auth.currentUser.uid;
        const userDocsRef = collection(db, USER_CONFIG_COLLECTION, userId, 'lenderDocuments');
        const userDocsQuery = query(userDocsRef, where('lenderId', '==', lenderId));
        const userDocsSnapshot = await getDocs(userDocsQuery);
        
        if (!userDocsSnapshot.empty) {
          console.log(`Found ${userDocsSnapshot.size} documents in user's collection`);
          
          userDocsSnapshot.forEach(docSnapshot => {
            const docData = docSnapshot.data();
            
            // Check if we already have this document
            const isDuplicate = allDocuments.some(doc => doc.openaiFileId === docData.openaiFileId);
            
            if (!isDuplicate) {
              allDocuments.push({
                id: docSnapshot.id,
                openaiFileId: docData.openaiFileId,
                fileName: docData.fileName || 'Unknown document',
                fileType: docData.fileType || 'unknown',
                uploadedAt: docData.uploadedAt?.toDate?.() || new Date(),
                source: 'user_collection',
                processed: docData.status === 'vector_store_indexed',
                vectorStoreId: docData.vectorStoreId || TERRANCE_VECTOR_STORE_ID,
                storageUrl: docData.storageUrl || docData.url || null
              });
            }
          });
        }
      } catch (userDocsError) {
        console.warn(`Error fetching user docs: ${userDocsError.message}`);
      }
      
      // Also try to get notes from user's private collection
      try {
        const userId = auth.currentUser.uid;
        const userNotesRef = collection(db, USER_CONFIG_COLLECTION, userId, 'lenderNotes');
        const userNotesQuery = query(userNotesRef, where('lenderId', '==', lenderId));
        const userNotesSnapshot = await getDocs(userNotesQuery);
        
        if (!userNotesSnapshot.empty) {
          console.log(`Found ${userNotesSnapshot.size} notes in user's collection`);
          
          userNotesSnapshot.forEach(noteSnapshot => {
            const noteData = noteSnapshot.data();
            
            // Check if we already have this document
            const isDuplicate = allDocuments.some(doc => doc.openaiFileId === noteData.openaiFileId);
            
            if (!isDuplicate) {
              allDocuments.push({
                id: noteSnapshot.id,
                openaiFileId: noteData.openaiFileId,
                fileName: `${noteData.lenderName || 'Lender'} Notes`,
                fileType: 'text/plain',
                uploadedAt: noteData.uploadedAt?.toDate?.() || new Date(),
                source: 'user_notes',
                processed: noteData.status === 'vector_store_indexed',
                vectorStoreId: noteData.vectorStoreId || TERRANCE_VECTOR_STORE_ID,
                isNotes: true,
                content: noteData.content,
                storageUrl: noteData.storageUrl || noteData.url || null
              });
            }
          });
        }
      } catch (userNotesError) {
        console.warn(`Error fetching user notes: ${userNotesError.message}`);
      }
      
      // After collecting all documents, try to get Firebase Storage URLs for any that don't have them
      const documentsWithUrls = await Promise.all(
        allDocuments.map(async (document) => {
          // If document already has a storage URL, return it as is
          if (document.storageUrl) {
            return document;
          }
          
          try {
            // For PDFs stored in Firebase, construct the path based on document metadata
            if (document.fileName.toLowerCase().endsWith('.pdf')) {
              const userId = auth.currentUser.uid;
              
              // Try a variety of possible paths
              const possiblePaths = [
                // Main lender docs path with standardized naming
                `lender_docs/${userId}/${lenderId}_${document.openaiFileId}.pdf`,
                // Alternative format with timestamp
                `lender_docs/${userId}/${lenderId}_${new Date(document.uploadedAt).getTime()}.pdf`,
                // Try with just the document ID
                `lender_docs/${userId}/${document.id}.pdf`,
                // Try a path pattern that doesn't include the lender ID
                `lender_docs/${userId}/${document.openaiFileId}.pdf`,
                // Try without user ID
                `lender_docs/${lenderId}_${document.openaiFileId}.pdf`,
                // Try with document name
                `lender_docs/${userId}/${document.fileName}`,
                // Try a more generic timestamp pattern
                `lender_docs/${userId}/${lenderId}_*.pdf`
              ];
              
              // If we have a specific document ID that's not the openAI ID
              if (document.id && document.id !== document.openaiFileId) {
                possiblePaths.push(`lender_docs/${userId}/${lenderId}_${document.id}.pdf`);
              }
              
              // Try each path until we find one that works
              for (const path of possiblePaths) {
                try {
                  const storageRef = ref(storage, path);
                  const url = await getDownloadURL(storageRef);
                  return { ...document, storageUrl: url };
                } catch (e) {
                  // This path didn't work, try the next one
                  console.log(`Path ${path} not found, trying next...`);
                }
              }
              
              // If we get here, we couldn't find the file in any of the expected paths
              console.log(`Could not find Firebase Storage URL for document: ${document.fileName}`);
            }
          } catch (err) {
            console.warn(`Error fetching storage URL for ${document.fileName}: ${err.message}`);
          }
          
          return document;
        })
      );

      // Sort documents by upload date (newest first)
      documentsWithUrls.sort((a, b) => {
        const dateA = new Date(a.uploadedAt);
        const dateB = new Date(b.uploadedAt);
        return dateB - dateA;
      });
      
      setCurrentLenderDocs(documentsWithUrls);
      
      // Open the modal
      setIsDocModalOpen(true);
      
    } catch (err) {
      console.error("Error fetching lender documents:", err);
      setDocumentModalError("Failed to fetch lender documents");
    } finally {
      setDocumentModalLoading(false);
      hideLoading();
    }
  };

  const handleShowDocuments = (lender) => {
    setCurrentLenderForDocs(lender);
    fetchLenderDocuments(lender.id);
  };

  const handleCloseDocModal = () => {
    setIsDocModalOpen(false);
    setCurrentLenderDocs([]);
    setCurrentLenderForDocs(null);
  };

  const handleOpenModal = (lender = null) => {
    if (lender) {
      setCurrentLender(lender);
      setFormData({
        name: lender.name || '',
        contactPerson: lender.contactPerson || '',
        email: lender.email || '',
        phone: lender.phone || '',
        notes: lender.notes || '',
        type: lender.type || 'bank'
      });
    } else {
      // Reset to defaults for new lender
      setCurrentLender(null);
      setFormData({
        name: '',
        contactPerson: '',
        email: '',
        phone: '',
        notes: '',
        type: 'bank'
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentLender(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      showLoading("Saving lender...");
      
      const lenderData = {
        ...formData
      };
      
      if (currentLender) {
        // Update existing lender
        await updateLenderWithVectorStore(currentLender.id, lenderData, selectedFiles);
      } else {
        // Create new lender
        const newLender = await createLender(lenderData);
        
        // If there are files or notes, update with vector store
        if (selectedFiles.length > 0 || lenderData.notes.trim()) {
          await updateLenderWithVectorStore(newLender.id, lenderData, selectedFiles);
        }
      }
      
      // Refresh lenders list
      await loadLenders();
      handleCloseModal();
      
    } catch (err) {
      console.error('Error saving lender:', err);
      setError('Failed to save lender. Please try again.');
    } finally {
      hideLoading();
    }
  };

  const handleDeleteLender = async (id) => {
    if (window.confirm('Are you sure you want to delete this lender?')) {
      try {
        showLoading("Deleting lender...");
        await deleteLender(id);
        await loadLenders();
      } catch (err) {
        console.error('Error deleting lender:', err);
        setError('Failed to delete lender. Please try again.');
      } finally {
        hideLoading();
      }
    }
  };

  const filteredLenders = lenders.filter(lender => 
    lender.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (lender.contactPerson && lender.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const toggleViewMode = () => {
    setViewMode(viewMode === 'table' ? 'card' : 'table');
  };

  // Handle ESC key to close the modal
  const handleModalKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsModalOpen(false);
      setIsDocModalOpen(false);
    }
  };

  // Function to get document type label
  const getDocumentTypeLabel = (type) => {
    const documentTypes = {
      'guidelines': 'Lending Guidelines',
      'ratesheet': 'Rate Sheet',
      'forms': 'Application Forms',
      'reference': 'Quick Reference',
    };
    return documentTypes[type] || type;
  };

  // Prevent scrolling of the main page when modal is open
  useEffect(() => {
    if (isModalOpen || isDocModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isModalOpen, isDocModalOpen]);

  // Add file selection handler
  const handleFileSelect = (e) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  // Add function to clear files
  const clearFiles = () => {
    setSelectedFiles([]);
    if (document.getElementById('document-upload')) {
      document.getElementById('document-upload').value = '';
    }
  };

  // Navigate to AI assistant with lender context
  const testWithTerrance = (lenderId, lenderName) => {
    window.location.href = `/ai-assistant?topic=lender&id=${lenderId}&name=${encodeURIComponent(lenderName)}`;
  };

  // Add this function to the Lenders component
  const fixVectorStoreDocuments = async () => {
    try {
      showLoading("Fixing vector store associations...");
      setError(null);
      
      const result = await fixVectorStoreAssociations();
      
      if (result.fixed > 0) {
        setSuccess(`Fixed ${result.fixed} document associations with vector store`);
      } else if (result.total > 0) {
        setSuccess(`All ${result.total} documents are properly associated with the vector store`);
      } else {
        setError("No documents found to associate with vector store");
      }
      
      console.log("Fix vector store results:", result);
      
    } catch (err) {
      console.error("Error fixing vector store associations:", err);
      setError(`Failed to fix vector store associations: ${err.message}`);
    } finally {
      hideLoading();
    }
  };

  // Add a function to handle document selection for preview
  const handleDocumentSelect = (document) => {
    setSelectedDocument(document);
  };

  const DocumentPreview = ({ document }) => {
    const [isLoadingFallback, setIsLoadingFallback] = useState(false);
    const [fallbackUrl, setFallbackUrl] = useState(null);
    const [attemptedPaths, setAttemptedPaths] = useState([]);
    
    // Add a debug log to help identify document information
    useEffect(() => {
      console.log("Document to preview:", {
        id: document.id,
        openaiFileId: document.openaiFileId,
        fileName: document.fileName,
        uploadedAt: document.uploadedAt,
        source: document.source,
        hasStorageUrl: !!document.storageUrl
      });
    }, [document]);
    
    // Try to fetch a fallback URL if the document has an openaiFileId but no storageUrl
    useEffect(() => {
      if (!document.storageUrl && document.fileName.toLowerCase().endsWith('.pdf')) {
        const fetchFallbackUrl = async () => {
          setIsLoadingFallback(true);
          try {
            const userId = auth.currentUser.uid;
            const lenderId = currentLenderForDocs?.id;
            
            console.log("User ID:", userId);
            console.log("Lender ID:", lenderId);
            console.log("Document details:", {
              id: document.id,
              openaiFileId: document.openaiFileId,
              fileName: document.fileName,
              uploadedAt: document.uploadedAt,
              source: document.source
            });
            
            // Base directory where files are stored
            const baseDir = `lender_docs/${userId}`;
            console.log("Base directory:", baseDir);
            
            try {
              // List all files in the directory to find matches
              const dirRef = ref(storage, baseDir);
              const result = await listAll(dirRef);
              const fileList = result.items.map(item => item.name);
              console.log("Available files in directory:", fileList);
              
              // Look for files that match the lender ID
              const lenderFiles = fileList.filter(filename => 
                filename.startsWith(lenderId + '_')
              );
              
              console.log("Files matching lender ID:", lenderFiles);
              
              if (lenderFiles.length > 0) {
                // Use the most recent file (or first one if there's no clear way to determine)
                const mostRecentFile = lenderFiles[0]; // You could sort by timestamp if needed
                const fileRef = ref(storage, `${baseDir}/${mostRecentFile}`);
                const url = await getDownloadURL(fileRef);
                
                console.log(`Found matching file: ${mostRecentFile}`);
                setFallbackUrl(url);
              } else {
                console.log("No files found matching lender ID");
              }
            } catch (listError) {
              console.warn("Could not list files in directory:", listError);
            }
          } catch (err) {
            console.warn(`Error finding fallback URL: ${err.message}`);
          } finally {
            setIsLoadingFallback(false);
          }
        };
        
        fetchFallbackUrl();
      }
    }, [document, currentLenderForDocs, storage]);
    
    // If it's notes or a text file with content, show the content
    if (document.isNotes || (document.content && document.fileType === 'text/plain')) {
      return (
        <div className="document-preview text-preview">
          <div className="text-content">
            {document.content || 'Content not available for preview.'}
          </div>
        </div>
      );
    }
    
    // For PDFs with a storage URL
    const pdfUrl = document.storageUrl || fallbackUrl;
    if (document.fileName.toLowerCase().endsWith('.pdf') && pdfUrl) {
      return (
        <div className="document-preview">
          <iframe
            src={`${pdfUrl}#toolbar=0`}
            width="100%"
            height="500px"
            title={document.fileName}
          />
          <div className="preview-actions">
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="open-btn">
              <span className="material-icons">open_in_new</span>
              Open in new tab
            </a>
          </div>
        </div>
      );
    }
    
    // For PDFs without a storage URL
    if (document.fileName.toLowerCase().endsWith('.pdf') && !pdfUrl) {
      return (
        <div className="document-preview-placeholder">
          <span className="material-icons">picture_as_pdf</span>
          <p>This PDF is indexed in Terrance's knowledge base but cannot be previewed directly</p>
          <div className="preview-help">
            <p>The system cannot locate this PDF in Firebase Storage.</p>
            <p><strong>Known storage location:</strong> gs://terrance-40e13.firebasestorage.app/lender_docs/{auth.currentUser.uid}</p>
            <p><strong>Available files:</strong></p>
            <ul style={{fontSize: "12px", marginLeft: "10px"}}>
              {attemptedPaths.map((path, i) => (
                <li key={i}>{path}</li>
              ))}
            </ul>
            <p>Possible reasons:</p>
            <ul>
              <li>The document was added to the vector store but not uploaded to Firebase Storage</li>
              <li>The file exists in Firebase Storage with a naming pattern like: <code>{currentLenderForDocs?.id}_timestamp.pdf</code></li>
              <li>The file was uploaded with incorrect permissions</li>
            </ul>
            <div style={{fontSize: "12px", backgroundColor: "#f5f5f5", padding: "8px", borderRadius: "4px", marginTop: "10px"}}>
              <p><strong>Document Details:</strong></p>
              <p>File name: {document.fileName}</p>
              <p>OpenAI File ID: {document.openaiFileId}</p>
              <p>Uploaded: {new Date(document.uploadedAt).toLocaleString()}</p>
              <p>Source: {document.source}</p>
              <p>Lender ID: {currentLenderForDocs?.id}</p>
            </div>
          </div>
          <div className="action-buttons" style={{marginTop: "20px"}}>
            <Link 
              to={`/lender-documents?lender=${currentLenderForDocs?.id}`} 
              className="btn-primary"
            >
              Re-Upload Document
            </Link>
          </div>
        </div>
      );
    }
    
    // For all other file types
    return (
      <div className="document-preview-placeholder">
        <span className="material-icons">description</span>
        <p>Preview not available for this file type</p>
        {(document.storageUrl || fallbackUrl) && (
          <a href={document.storageUrl || fallbackUrl} target="_blank" rel="noopener noreferrer" className="download-btn">
            <span className="material-icons">download</span>
            Download document
          </a>
        )}
      </div>
    );
  };

  useEffect(() => {
    console.log("Document modal loading state:", documentModalLoading);
    console.log("Document modal is open:", isDocModalOpen);
    console.log("Current lender for docs:", currentLenderForDocs);
    console.log("Current documents:", currentLenderDocs.map(doc => ({
      fileName: doc.fileName,
      hasUrl: !!doc.storageUrl,
      url: doc.storageUrl
    })));
  }, [documentModalLoading, isDocModalOpen, currentLenderForDocs, currentLenderDocs]);

  // Add this function to the Lenders component
  const migrateDocumentStorageUrls = async () => {
    try {
      showLoading("Migrating document storage URLs...");
      setError(null);
      
      const result = await migrateDocumentsWithStorageUrls();
      
      if (result.fixed > 0) {
        setSuccess(`Updated storage URLs for ${result.fixed} of ${result.total} documents`);
      } else if (result.total > 0) {
        setSuccess(`All ${result.total} documents already have storage URLs`);
      } else {
        setError("No documents found to migrate");
      }
      
      console.log("Migration results:", result);
      
    } catch (err) {
      console.error("Error migrating document storage URLs:", err);
      setError(`Failed to migrate document storage URLs: ${err.message}`);
    } finally {
      hideLoading();
    }
  };

  if (!dataLoaded && !error) {
    return null;
  }

  return (
    <div className="lenders-container">
      <div className="lenders-header">
        <h1>Lenders</h1>
        <div className="actions">
          <div className="search-wrapper">
            <span className="material-icons">search</span>
            <input
              type="text"
              placeholder="Search lenders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {window.innerWidth > 768 && (
            <button className="view-toggle" onClick={toggleViewMode}>
              <span className="material-icons">
                {viewMode === 'table' ? 'view_module' : 'view_list'}
              </span>
            </button>
          )}
          
          <Link to="/lender-documents" className="btn-documents">
            <span className="material-icons">description</span>
            Lender Docs
          </Link>
          
          <button className="btn-add" onClick={() => handleOpenModal()}>
            <span className="material-icons">add</span>
            Add Lender
          </button>
          
          {/* <button className="vector-fix-btn" onClick={fixVectorStoreDocuments} title="Fix vector store associations">
            <span className="material-icons">build</span>
            Fix Vector Store
          </button>
          
          <button className="btn-secondary" onClick={migrateDocumentStorageUrls} title="Fix document storage URLs">
            <span className="material-icons">link</span>
            Fix Storage URLs
          </button> */}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {dataLoaded && filteredLenders.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons">account_balance</span>
          <h3>No lenders found</h3>
          <p>Start by adding your first lender to streamline your financing process</p>
          <button className="btn-primary" onClick={() => handleOpenModal()}>Add Lender</button>
        </div>
      ) : viewMode === 'table' ? (
        <div className="lenders-table-container">
          <table className="lenders-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact Person</th>
                <th>Email / Phone</th>
                <th>Documents</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLenders.map(lender => (
                <tr key={lender.id}>
                  <td>
                    <div className="lender-name">{lender.name}</div>
                    <div className="lender-type">{lender.type || 'Bank'}</div>
                  </td>
                  <td>{lender.contactPerson || '-'}</td>
                  <td>
                    <div>{lender.email || '-'}</div>
                    <div className="text-muted">{lender.phone || '-'}</div>
                  </td>
                  <td>
                    <button 
                      onClick={() => handleShowDocuments(lender)}
                      className="documents-btn"
                      title="View lender documents"
                    >
                      <span className="material-icons">folder</span>
                      View Documents
                    </button>
                  </td>
                  <td className="actions-cell">
                    <button 
                      className="edit-btn" 
                      onClick={() => handleOpenModal(lender)}
                      title="Edit lender"
                    >
                      <span className="material-icons">edit</span>
                    </button>
                    <button 
                      className="delete-btn" 
                      onClick={() => handleDeleteLender(lender.id)}
                      title="Delete lender"
                    >
                      <span className="material-icons">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="lenders-card-view">
          {filteredLenders.map(lender => (
            <div className="lender-card" key={lender.id}>
              <div className="lender-name">{lender.name}</div>
              <div className="lender-type">{lender.type || 'Bank'}</div>
              <div className="lender-details">
                <div className="detail-item">
                  <div className="label">Contact:</div>
                  <div className="value">{lender.contactPerson || '-'}</div>
                </div>
                <div className="detail-item">
                  <div className="label">Phone:</div>
                  <div className="value">{lender.phone || '-'}</div>
                </div>
                <div className="detail-item">
                  <div className="label">Email:</div>
                  <div className="value">{lender.email || '-'}</div>
                </div>
              </div>
              <div className="card-actions">
                <button 
                  onClick={() => handleShowDocuments(lender)}
                  className="documents-btn"
                  title="View lender documents"
                >
                  <span className="material-icons">folder</span>
                </button>
                <button 
                  className="edit-btn" 
                  onClick={() => handleOpenModal(lender)}
                  title="Edit lender"
                >
                  <span className="material-icons">edit</span>
                </button>
                <button 
                  className="delete-btn" 
                  onClick={() => handleDeleteLender(lender.id)}
                  title="Delete lender"
                >
                  <span className="material-icons">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Simplified Add/Edit Lender Modal */}
      {isModalOpen && (
        <div 
          className="modal-overlay" 
          onClick={handleCloseModal}
          onKeyDown={handleModalKeyDown}
          tabIndex="-1"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{currentLender ? 'Edit Lender' : 'Add New Lender'}</h2>
              <button className="close-btn" onClick={handleCloseModal}>
                <span className="material-icons">close</span>
              </button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="name">Lender Name*</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    placeholder="Enter lender name"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="type">Lender Type</label>
                  <select
                    id="type"
                    name="type"
                    value={formData.type}
                    onChange={handleInputChange}
                  >
                    <option value="bank">Bank</option>
                    <option value="credit_union">Credit Union</option>
                    <option value="finance_company">Finance Company</option>
                    <option value="captive">Captive Finance</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label htmlFor="contactPerson">Contact Person</label>
                  <input
                    type="text"
                    id="contactPerson"
                    name="contactPerson"
                    value={formData.contactPerson}
                    onChange={handleInputChange}
                    placeholder="Enter contact person's name"
                  />
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="example@email.com"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="phone">Phone</label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="(123) 456-7890"
                    />
                  </div>
                </div>
                
                <div className="form-group">
                  <label>Lender Notes (Primary Source for Terrance AI)</label>
                  <div className="notes-header">
                    <p>Terrance uses this information to provide personalized lender recommendations. Be as detailed as possible.</p>
                  </div>
                  <textarea 
                    className="notes-textarea"
                    placeholder={`Enter detailed information in a structured format:

CREDIT TIERS:
- Tier 1: 740+ score, 120% LTV, rates from 3.99% (60m) to 4.49% (72m)
- Tier 2: 700-739 score, 115% LTV, rates from 4.49% (60m) to 4.99% (72m)
- Tier 3: 660-699 score, 110% LTV, rates from 5.49% (60m) to 5.99% (72m)
- Tier 4: 600-659 score, 105% LTV, rates from 7.99% (60m) to 9.99% (72m)
- Tier 5: Below 600, case by case approvals

DOCUMENTATION REQUIREMENTS:
- Proof of income required for all applicants
- 3 months residence history required
- 6 months employment minimum
- Bank statements for self-employed

PRODUCT GUIDELINES:
- VSC maximum: $3,000 or 15% of amount financed
- GAP allowed up to $895
- Maximum back-end: 20% of amount financed
- Maximum advance: $7,500 over NADA clean retail

VEHICLE RESTRICTIONS:
- Maximum age: 8 years
- Maximum mileage: 100,000
- No salvage titles
- No commercial vehicles
- No exotic or specialty vehicles

SPECIAL PROGRAMS:
- First-time buyer program with 10% down payment
- Electric vehicle rate discount of 0.25%
- College graduate program
- Military discount program`}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={15}
                  />
                  <p className="form-hint">
                    <strong>Important:</strong> This information will be saved to our vector store and used by Terrance AI to provide accurate lender recommendations. The more detail you provide, the better Terrance can assist you.
                  </p>
                </div>

                <div className="form-group">
                  <label htmlFor="document-upload">Upload Lender Documents (Optional)</label>
                  <input
                    id="document-upload"
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    accept=".pdf,.docx,.doc,.txt"
                  />
                  {selectedFiles.length > 0 && (
                    <div className="selected-files">
                      <h4>Selected Files ({selectedFiles.length})</h4>
                      <ul>
                        {selectedFiles.map((file, index) => (
                          <li key={index}>{file.name}</li>
                        ))}
                      </ul>
                      <button 
                        type="button" 
                        className="btn-secondary btn-sm"
                        onClick={clearFiles}
                      >
                        Clear Files
                      </button>
                    </div>
                  )}
                  <p className="form-hint">
                    <strong>Important:</strong> Upload lender documents such as guidelines, rate sheets, 
                    or application forms to provide Terrance with comprehensive information.
                  </p>
                </div>
              </div>
              
              <div className="modal-footer">
                <div className="form-info">
                  <span className="info-text">
                    <span className="material-icons">info</span>
                    Lender information is now automatically added to Terrance's knowledge base
                  </span>
                </div>
                
                <div className="action-buttons">
                  <button 
                    type="button" 
                    className="btn-secondary"
                    onClick={handleCloseModal}
                  >
                    Cancel
                  </button>
                  
                  <button 
                    type="submit" 
                    className="btn-primary"
                  >
                    {currentLender ? 'Update Lender' : 'Add Lender'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Documents Modal */}
      {isDocModalOpen && (
        <div 
          className="modal-overlay" 
          onClick={handleCloseDocModal}
          onKeyDown={handleModalKeyDown}
          tabIndex="-1"
        >
          <div className="modal documents-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {currentLenderForDocs ? `${currentLenderForDocs.name} Documents` : 'Lender Documents'}
              </h2>
              <button className="close-btn" onClick={handleCloseDocModal}>
                <span className="material-icons">close</span>
              </button>
            </div>
            
            <div className="modal-body">
              {documentModalLoading ? (
                <div className="modal-loading">
                  <span className="material-icons loading-icon">sync</span>
                  <p>Loading documents...</p>
                </div>
              ) : documentModalError ? (
                <div className="error-message">{documentModalError}</div>
              ) : currentLenderDocs.length === 0 ? (
                <div className="no-documents">
                  <span className="material-icons">folder_off</span>
                  <h3>No documents found</h3>
                  <p>This lender doesn't have any documents yet</p>
                  <Link to="/lender-documents" className="btn-primary">
                    Upload Documents
                  </Link>
                </div>
              ) : (
                <div className="documents-list-container">
                  <div className="documents-list">
                    <p className="documents-count">
                      Found {currentLenderDocs.length} document{currentLenderDocs.length !== 1 ? 's' : ''}
                    </p>
                    <div className="documents-grid">
                      {currentLenderDocs.map(doc => (
                        <div 
                          className={`document-card ${selectedDocument && selectedDocument.id === doc.id ? 'selected' : ''}`} 
                          key={doc.id}
                          onClick={() => handleDocumentSelect(doc)}
                        >
                          <div className="document-icon">
                            <span className="material-icons">
                              {doc.fileName.endsWith('.pdf') ? 'picture_as_pdf' : 
                               doc.fileName.endsWith('.docx') || doc.fileName.endsWith('.doc') ? 'article' : 
                               'description'}
                            </span>
                          </div>
                          <div className="document-info">
                            <h4 className="document-name">{doc.fileName}</h4>
                            <div className="document-meta">
                              <span className="document-type">{getDocumentTypeLabel(doc.fileType)}</span>
                              <span className="document-date">
                                {new Date(doc.uploadedAt).toLocaleDateString()}
                              </span>
                              {doc.source === 'lender_profile' && (
                                <span className="document-source" title="Stored directly in lender profile">
                                  <span className="material-icons">verified</span>
                                </span>
                              )}
                            </div>
                            <div className={`document-status ${doc.processed ? 'processed' : 'pending'}`}>
                              {doc.processed ? 'Indexed' : 'Pending Indexing'}
                              {doc.vectorStoreId && 
                                <span className="vector-badge" title="Document is in Terrance's knowledge base">
                                  <span className="material-icons">psychology</span>
                                </span>
                              }
                            </div>
                          </div>
                          <div className="document-actions">
                            {doc.storageUrl && (
                              <button 
                                className="view-btn"
                                title="View document"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDocumentSelect(doc);
                                }}
                              >
                                <span className="material-icons">visibility</span>
                              </button>
                            )}
                            {currentLenderForDocs && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  testWithTerrance(currentLenderForDocs.id, currentLenderForDocs.name);
                                }}
                                className="test-terrance-btn"
                                title="Test with Terrance"
                              >
                                <span className="material-icons">smart_toy</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="document-preview-section">
                    {selectedDocument ? (
                      <DocumentPreview document={selectedDocument} />
                    ) : (
                      <div className="select-document-prompt">
                        <span className="material-icons">touch_app</span>
                        <p>Select a document to preview</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <div className="action-buttons">
                <Link 
                  to={currentLenderForDocs ? `/lender-documents?lender=${currentLenderForDocs.id}` : '/lender-documents'} 
                  className="btn-secondary"
                >
                  Manage All Documents
                </Link>
                <button 
                  type="button" 
                  className="btn-primary"
                  onClick={handleCloseDocModal}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Lenders; 

