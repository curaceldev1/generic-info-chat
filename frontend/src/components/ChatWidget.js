import React, { useState } from 'react';
import axios from 'axios';
import './ChatWidget.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';

const ChatWidget = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [ingestUrl, setIngestUrl] = useState('');
  const [ingestStatus, setIngestStatus] = useState(null);
  const [retryStatus, setRetryStatus] = useState(null);

  // Loader is active if either ingestion is loading (modal or retry)
  const isIngesting = ingestStatus === 'loading' || retryStatus === 'loading';

  const handleSend = async () => {
    if (input.trim() === '') return;

    const userMessage = { sender: 'user', text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await axios.post(`${BACKEND_URL}/chat`, {
        message: input,
        // baseUrl: window.location.origin,
        baseUrl: 'https://www.curacel.co/',
        appName: 'curacel',
      });

      const botMessage = {
        sender: 'bot',
        text: response.data.answer,
        sources: response.data.sources,
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      const errorMessage = {
        sender: 'bot',
        text: 'Sorry, something went wrong. Please try again.',
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const handleIngest = async () => {
    if (!ingestUrl.trim()) return;
    setIngestStatus('loading');
    try {
      await axios.post(`${BACKEND_URL}/ingestion`, { url: ingestUrl, appName: 'curacel' });
      setIngestStatus('success');
      setIngestUrl('');
    } catch (error) {
      setIngestStatus('error');
    }
  };

  const handleRetryIngest = async () => {
    setRetryStatus('loading');
    try {
      await axios.post(`${BACKEND_URL}/ingestion`, { url: 'https://www.curacel.co/', appName: 'curacel' });
      setRetryStatus('success');
    } catch (error) {
      setRetryStatus('error');
    }
    setTimeout(() => setRetryStatus(null), 2000);
  };

  const hasMessages = messages.length > 0 || isLoading;

  return (
    <div className={`chat-widget ${hasMessages ? 'expanded' : ''}`}>
      {/* Chat conversation area */}
      {hasMessages && (
        <div className={`chat-conversation ${hasMessages ? 'visible' : ''}`}>
          <div className="chat-header">
            <h2>AI Assistant</h2>
            <div className="chat-header-actions">
              <button
                className="header-button"
                onClick={() => { setShowModal(true); setIngestStatus(null); }}
                title="Ingest a new URL"
              >
                +
              </button>
              <button
                className="header-button"
                onClick={handleRetryIngest}
                title="Reingest current site"
                disabled={retryStatus === 'loading'}
              >
                ⟳
              </button>
              {retryStatus === 'loading' && <span style={{ color: 'white', marginLeft: 4, fontSize: '1rem' }}>...</span>}
              {retryStatus === 'success' && <span style={{ color: 'lightgreen', marginLeft: 4, fontSize: '1rem' }}>✓</span>}
              {retryStatus === 'error' && <span style={{ color: 'red', marginLeft: 4, fontSize: '1rem' }}>!</span>}
            </div>
          </div>
          
          <div className="chat-messages">
            {messages.map((msg, index) => (
              <div key={index} className={`message ${msg.sender}`}>
                {msg.sender === 'bot' ? (
                  <div dangerouslySetInnerHTML={{ __html: msg.text }} />
                ) : (
                  <p>{msg.text}</p>
                )}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="sources">
                    <strong>Sources:</strong>
                    <ul>
                      {msg.sources.map((source, i) => (
                        <li key={i}>
                          <a href={source} target="_blank" rel="noopener noreferrer">
                            {source}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="loading-message">
                <span>Thinking</span>
                <div className="loading-dots">
                  <div className="loading-dot"></div>
                  <div className="loading-dot"></div>
                  <div className="loading-dot"></div>
                </div>
              </div>
            )}
          </div>

          {/* Input inside conversation */}
          <div className="chat-input-container">
            <input
              type="text"
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Message AI Assistant..."
              disabled={isLoading}
            />
            <button 
              className="send-button"
              onClick={handleSend} 
              disabled={isLoading}
            >
              ↑
            </button>
          </div>
        </div>
      )}

      {/* Standalone input when not expanded */}
      {!hasMessages && (
        <div className="chat-input-container">
          <input
            type="text"
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me about your data..."
            disabled={isLoading}
          />
          <button 
            className="send-button"
            onClick={handleSend} 
            disabled={isLoading}
          >
            ↑
          </button>
        </div>
      )}

      {/* Ingestion modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Ingest a new URL</h3>
            <input
              type="text"
              className="modal-input"
              value={ingestUrl}
              onChange={e => setIngestUrl(e.target.value)}
              placeholder="Enter URL to ingest"
              disabled={ingestStatus === 'loading'}
            />
            <div className="modal-buttons">
              <button
                className="modal-button primary"
                onClick={handleIngest}
                disabled={ingestStatus === 'loading' || !ingestUrl.trim()}
              >
                {ingestStatus === 'loading' ? 'Ingesting...' : 'Submit'}
              </button>
              <button
                className="modal-button secondary"
                onClick={() => { setShowModal(false); setIngestUrl(''); setIngestStatus(null); }}
                disabled={ingestStatus === 'loading'}
              >
                Cancel
              </button>
            </div>
            {ingestStatus === 'success' && (
              <div className="modal-status success">URL ingested successfully!</div>
            )}
            {ingestStatus === 'error' && (
              <div className="modal-status error">Failed to ingest URL. Please try again.</div>
            )}
          </div>
        </div>
      )}

      {/* Ingestion loader overlay */}
      {isIngesting && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ textAlign: 'center' }}>
              <div className="spinner" />
              <div style={{ color: '#007bff', fontWeight: 'bold' }}>Ingesting...</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatWidget; 