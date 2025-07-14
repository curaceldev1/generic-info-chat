import React from 'react';
import ReactDOM from 'react-dom/client';
import ChatWidget from './ChatWidget';

function init(options) {
  const { containerId, ...props } = options;
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container with id #${containerId} not found.`);
    return;
  }

  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <ChatWidget {...props} />
    </React.StrictMode>
  );
}

export default {
  init,
}; 