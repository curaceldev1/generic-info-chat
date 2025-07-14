import React, { useState } from 'react';
import axios from 'axios';
import './ChatWidget.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const ChatWidget = ({ baseUrl, appName }) => {
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
        baseUrl: baseUrl,
        appName: appName,
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
      await axios.post(`${BACKEND_URL}/ingestion`, { url: ingestUrl, appName: appName });
      setIngestStatus('success');
      setIngestUrl('');
    } catch (error) {
      setIngestStatus('error');
    }
  };

  const handleRetryIngest = async () => {
    setRetryStatus('loading');
    try {
      await axios.post(`${BACKEND_URL}/ingestion`, { url: baseUrl, appName: appName });
      setRetryStatus('success');
    } catch (error) {
      setRetryStatus('error');
    }
    setTimeout(() => setRetryStatus(null), 2000);
  };

  return (
    <div className="chat-widget">
      {/* Loader overlay */}
      {isIngesting && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(255,255,255,0.7)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{
              border: '4px solid #f3f3f3',
              borderTop: '4px solid #007bff',
              borderRadius: '50%',
              width: 40,
              height: 40,
              animation: 'spin 1s linear infinite',
              margin: '0 auto 10px auto'
            }} />
            <div style={{ color: '#007bff', fontWeight: 'bold' }}>Ingesting...</div>
          </div>
        </div>
      )}
      <div className="chat-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>AI Assistant</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            style={{ fontSize: '1.5rem', background: 'none', border: 'none', color: 'white', cursor: 'pointer', marginLeft: '10px' }}
            onClick={() => { setShowModal(true); setIngestStatus(null); }}
            title="Ingest a new URL"
          >
            +
          </button>
          <button
            style={{ fontSize: '1.3rem', background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
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
        {isLoading && <div className="message bot">Thinking...</div>}
      </div>
      <div className="chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask a question..."
          disabled={isLoading}
        />
        <button onClick={handleSend} disabled={isLoading}>
          Send
        </button>
      </div>
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{ background: 'white', padding: 30, borderRadius: 10, minWidth: 320, boxShadow: '0 2px 12px rgba(0,0,0,0.2)' }}>
            <h3>Ingest a new URL</h3>
            <input
              type="text"
              value={ingestUrl}
              onChange={e => setIngestUrl(e.target.value)}
              placeholder="Enter URL to ingest"
              style={{ width: '100%', padding: 8, marginBottom: 10, borderRadius: 4, border: '1px solid #ccc' }}
              disabled={ingestStatus === 'loading'}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleIngest}
                disabled={ingestStatus === 'loading' || !ingestUrl.trim()}
                style={{ padding: '8px 16px', borderRadius: 4, border: 'none', background: '#007bff', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {ingestStatus === 'loading' ? 'Ingesting...' : 'Submit'}
              </button>
              <button
                onClick={() => { setShowModal(false); setIngestUrl(''); setIngestStatus(null); }}
                style={{ padding: '8px 16px', borderRadius: 4, border: 'none', background: '#ccc', color: '#333', fontWeight: 'bold', cursor: 'pointer' }}
                disabled={ingestStatus === 'loading'}
              >
                Cancel
              </button>
            </div>
            {ingestStatus === 'success' && <div style={{ color: 'green', marginTop: 10 }}>URL ingested successfully!</div>}
            {ingestStatus === 'error' && <div style={{ color: 'red', marginTop: 10 }}>Failed to ingest URL. Please try again.</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatWidget; 