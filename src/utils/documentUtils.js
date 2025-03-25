/**
 * Converts a document type code to a human-readable name
 * @param {string} type - Document type code
 * @returns {string} Human-readable document type name
 */
export function getDocumentTypeName(type) {
  const types = {
    'guidelines': 'Lending Guidelines',
    'ratesheet': 'Rate Sheet',
    'forms': 'Application Forms',
    'reference': 'Quick Reference'
  };
  
  return types[type] || type;
}
