import React from 'react';
import './Footer.scss';

function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="app-footer">
      <div className="footer-content">
        <div className="copyright">
          © {currentYear} AWEVO Software Solutions LLC. All rights reserved.
        </div>
        <div className="footer-links">
          <a href="#terms">Terms</a>
          <a href="#privacy">Privacy</a>
          <a href="#support">Support</a>
        </div>
      </div>
    </footer>
  );
}

export default Footer; 