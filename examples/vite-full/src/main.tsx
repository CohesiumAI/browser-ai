// Polyfill crypto.randomUUID for non-secure contexts (HTTP on mobile)
if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
  (crypto as any).randomUUID = function(): string {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: string) =>
      (parseInt(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (parseInt(c) / 4)))).toString(16)
    );
  };
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
