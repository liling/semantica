/**
 * src/App.tsx
 */
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VocabularyWorkspace } from './workspaces/VocabularyWorkspace/VocabularyWorkspace';
import { GraphWorkspace } from './workspaces/GraphWorkspace/GraphWorkspace';

const queryClient = new QueryClient();

export default function App() {
  const [activeWorkspace, setActiveWorkspace] = useState<'vocabulary' | 'graph'>('graph');

  return (
    <QueryClientProvider client={queryClient}>
      <div style={{ display: 'flex', width: '100vw', height: '100vh', margin: 0, padding: 0, backgroundColor: '#0d1117', fontFamily: "system-ui, -apple-system, sans-serif" }}>
        
    
        <nav style={{ 
          width: '64px', 
          backgroundColor: '#010409', 
          borderRight: '1px solid #30363d',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: '16px',
          gap: '16px'
        }}>
          {/* Logo / Brand */}
          <div style={{ width: '32px', height: '32px', backgroundColor: '#238636', borderRadius: '8px', marginBottom: '24px' }} title="Semantica" />

          {/* Graph Icon Button */}
          <button 
            onClick={() => setActiveWorkspace('graph')}
            title="Graph Explorer"
            style={{
              width: '40px', height: '40px', borderRadius: '8px', cursor: 'pointer',
              border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: activeWorkspace === 'graph' ? '#1f6feb' : 'transparent',
              color: activeWorkspace === 'graph' ? '#fff' : '#8b949e',
              transition: 'all 0.2s'
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
          </button>

          {/* Vocabulary Icon Button */}
          <button 
            onClick={() => setActiveWorkspace('vocabulary')}
            title="Vocabulary & Ontology"
            style={{
              width: '40px', height: '40px', borderRadius: '8px', cursor: 'pointer',
              border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: activeWorkspace === 'vocabulary' ? '#1f6feb' : 'transparent',
              color: activeWorkspace === 'vocabulary' ? '#fff' : '#8b949e',
              transition: 'all 0.2s'
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path></svg>
          </button>
        </nav>

        {/* ── Active Workspace Area ────────────────────────────────────── */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {activeWorkspace === 'graph' && <GraphWorkspace />}
          {activeWorkspace === 'vocabulary' && <VocabularyWorkspace />}
        </div>
      </div>
    </QueryClientProvider>
  );
}