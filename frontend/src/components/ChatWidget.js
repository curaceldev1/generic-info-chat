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
  const [isMinimized, setIsMinimized] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

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
    <div className={`chat-widget ${hasMessages ? 'expanded' : ''} ${isMinimized ? 'minimized' : ''}`}>
      {/* Minimized state - floating chat button */}
      {isMinimized && (
        <div className="tooltip-container">
          <div className="chat-minimized" onClick={() => setIsMinimized(false)}>
            <div className="minimized-icon">🤖</div>
            {messages.length > 0 && <div className="message-indicator">{messages.length}</div>}
          </div>
          <div className="tooltip">Click to expand chat</div>
        </div>
      )}

      {/* Chat conversation area */}
      {hasMessages && !isMinimized && !isCollapsed && (
        <div className={`chat-conversation ${hasMessages ? 'visible' : ''}`}>
          <div className="chat-header">
            <h2>AI Assistant</h2>
            <div className="chat-header-actions">
              <div className="tooltip-container">
                <button
                  className="header-button"
                  onClick={() => setIsCollapsed(true)}
                >
                  ⌃
                </button>
                <div className="tooltip">Collapse conversation</div>
              </div>
              <div className="tooltip-container">
                <button
                  className="header-button"
                  onClick={() => setIsMinimized(true)}
                >
                  −
                </button>
                <div className="tooltip">Minimize to floating button</div>
              </div>
              <div className="tooltip-container">
                <button
                  className="header-button"
                  onClick={() => { setShowModal(true); setIngestStatus(null); }}
                >
                  +
                </button>
                <div className="tooltip">Ingest a new URL</div>
              </div>
              <div className="tooltip-container">
                <button
                  className="header-button"
                  onClick={handleRetryIngest}
                  disabled={retryStatus === 'loading'}
                >
                  ⟳
                </button>
                <div className="tooltip">Reingest current site</div>
              </div>
              {retryStatus === 'loading' && <span style={{ color: 'white', marginLeft: 4, fontSize: '1rem' }}>...</span>}
              {retryStatus === 'success' && <span style={{ color: 'lightgreen', marginLeft: 4, fontSize: '1rem' }}>✓</span>}
              {retryStatus === 'error' && <span style={{ color: 'red', marginLeft: 4, fontSize: '1rem' }}>!</span>}
            </div>
          </div>
          
          <div className="chat-messages">
            {/* Welcome message when no messages yet */}
            {messages.length === 0 && !isLoading && (
              <div className="welcome-message">
                <div className="welcome-title">How can AI Assistant help?</div>
                <div className="welcome-subtitle">AI Assistant joined</div>
              </div>
            )}
            
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
            <div className="tooltip-container">
              <button 
                className="send-button"
                onClick={handleSend} 
                disabled={isLoading}
              >
                ↑
              </button>
              <div className="tooltip">Send message</div>
            </div>
          </div>
        </div>
      )}

      {/* Collapsed state - just input bar with expand button */}
      {hasMessages && !isMinimized && isCollapsed && (
        <div className="chat-input-container collapsed">
          <div className="tooltip-container">
            <button
              className="expand-button"
              onClick={() => setIsCollapsed(false)}
            >
              ⌄
            </button>
            <div className="tooltip">Expand conversation</div>
          </div>
          <input
            type="text"
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Message AI Assistant..."
            disabled={isLoading}
          />
          <div className="tooltip-container">
            <button 
              className="send-button"
              onClick={handleSend} 
              disabled={isLoading}
            >
              ↑
            </button>
            <div className="tooltip">Send message</div>
          </div>
        </div>
      )}

      {/* Standalone input when not expanded */}
      {!hasMessages && !isMinimized && (
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
          <div className="tooltip-container">
            <button 
              className="send-button"
              onClick={handleSend} 
              disabled={isLoading}
            >
              ↑
            </button>
            <div className="tooltip">Send message</div>
          </div>
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
              placeholder="Enter URL to ingest (e.g., https://example.com)"
              disabled={ingestStatus === 'loading'}
            />
            <div className="modal-buttons">
              <button
                className="modal-button secondary"
                onClick={() => { setShowModal(false); setIngestUrl(''); setIngestStatus(null); }}
                disabled={ingestStatus === 'loading'}
              >
                Cancel
              </button>
              <button
                className="modal-button primary"
                onClick={handleIngest}
                disabled={ingestStatus === 'loading' || !ingestUrl.trim()}
              >
                {ingestStatus === 'loading' ? 'Ingesting...' : 'Submit'}
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
              <div style={{ color: '#007bff', fontWeight: 'bold', fontSize: '1.1rem' }}>Ingesting...</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatWidget; 