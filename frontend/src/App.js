import './App.css';
import ChatWidget from './components/ChatWidget';

function App() {
  return (
    <div className="App">
      <div style={{ maxWidth: '800px', margin: '0 auto', marginBottom: '100px' }}>
        <h1>Test App</h1>
        <p>This is a test page for the chat widget. The widget should appear as a bottom bar at the bottom of the page.</p>
        <p>Try clicking on the input field or typing a message to see the chat modal expand.</p>
        
        <h2>About Salesforce</h2>
        <p>Salesforce is the #1 AI CRM platform that brings together all your data, from any source, so you can act on it with trusted AI and automation, all on one integrated platform. It makes it easy to find more prospects, close more deals, and connect with customers in a whole new way.</p>
        
        <h3>Key Features:</h3>
        <ul>
          <li><strong>Agentforce:</strong> Create a digital labor force that works alongside your human workforce</li>
          <li><strong>Sales Cloud:</strong> Boost pipeline, win rate, and revenue with Sales Cloud</li>
          <li><strong>Service Cloud:</strong> Cut service costs with humans & AI agents on one platform</li>
          <li><strong>Marketing Cloud:</strong> Personalize every moment of engagement across the customer lifecycle</li>
          <li><strong>Data Cloud:</strong> Bring together, understand, and act on all your data, from any source</li>
        </ul>
        
        <p>Salesforce was named the world's #1 CRM for 11 years running, trusted by companies around the globe to work smarter, drive automation, and grow revenue.</p>
      </div>
      <ChatWidget />
    </div>
  );
}

export default App;
