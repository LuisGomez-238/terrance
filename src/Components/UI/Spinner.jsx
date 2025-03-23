import React from 'react';
import './Spinner.scss';

function Spinner({ overlay = false, message = 'Loading...' }) {
  return (
    <div className={`spinner-container ${overlay ? 'overlay' : ''}`}>
      <div className="spinner"></div>
      {message && <p className="spinner-message">{message}</p>}
    </div>
  );
}

export default Spinner; 