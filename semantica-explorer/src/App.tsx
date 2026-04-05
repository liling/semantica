/**
 * src/App.tsx
 */
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VocabularyWorkspace } from './workspaces/VocabularyWorkspace/VocabularyWorkspace';
import { GraphWorkspace } from './workspaces/GraphWorkspace/GraphWorkspace';
import { DecisionWorkspace } from './workspaces/DecisionWorkspace/DecisionWorkspace';
import { SparqlWorkspace } from './workspaces/SparqlWorkspace/SparqlWorkspace';
import { LineageDiagram } from './workspaces/LineageWorkspace/LineageDiagram';
import { DiffMergeWorkspace } from './workspaces/DiffMergeWorkspace/DiffMergeWorkspace';
import { ImportExportWorkspace } from './workspaces/ImportExportWorkspace/ImportExportWorkspace'; // <-- IMPORT ADDED

const queryClient = new QueryClient();

export default function App() {

  const [activeWorkspace, setActiveWorkspace] = useState<'vocabulary' | 'graph' | 'decisions' | 'sparql' | 'lineage' | 'merge' | 'import'>('graph');

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

          <div style={{ width: '32px', height: '32px', backgroundColor: '#238636', borderRadius: '8px', marginBottom: '24px' }} title="Semantica" />

          {/* Graph Icon Button */}
          <button
            onClick={() => setActiveWorkspace('graph')}
            title="Graph Explorer"
            style={navItemStyle(activeWorkspace === 'graph')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
          </button>

          {/* Vocabulary Icon Button */}
          <button
            onClick={() => setActiveWorkspace('vocabulary')}
            title="Vocabulary & Ontology"
            style={navItemStyle(activeWorkspace === 'vocabulary')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path></svg>
          </button>

          {/* Decisions */}
          <button
            onClick={() => setActiveWorkspace('decisions')}
            title="Decision Tree"
            style={navItemStyle(activeWorkspace === 'decisions')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg>
          </button>

          {/* SPARQL */}
          <button
            onClick={() => setActiveWorkspace('sparql')}
            title="SPARQL Engine"
            style={navItemStyle(activeWorkspace === 'sparql')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
          </button>

          {/* Lineage */}
          <button
            onClick={() => setActiveWorkspace('lineage')}
            title="PROV-O Lineage"
            style={navItemStyle(activeWorkspace === 'lineage')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          </button>

          {/* Merge */}
          <button
            onClick={() => setActiveWorkspace('merge')}
            title="Diff / Merge"
            style={navItemStyle(activeWorkspace === 'merge')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v4a1 1 0 0 0 1 1h3"></path><path d="M12 2v20"></path><path d="M21 7v4a1 1 0 0 1-1 1h-3"></path><circle cx="3" cy="4" r="3"></circle><circle cx="21" cy="4" r="3"></circle><circle cx="12" cy="19" r="3"></circle></svg>
          </button>

          {/* IMPORT / EXPORT BUTTON */}
          <button
            onClick={() => setActiveWorkspace('import')}
            title="Data Import / Export"
            style={navItemStyle(activeWorkspace === 'import')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          </button>

        </nav>


        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {activeWorkspace === 'graph' && <GraphWorkspace />}
          {activeWorkspace === 'vocabulary' && <VocabularyWorkspace />}
          {activeWorkspace === 'decisions' && <DecisionWorkspace />}
          {activeWorkspace === 'sparql' && <SparqlWorkspace />}
          {activeWorkspace === 'lineage' && <LineageDiagram />}
          {activeWorkspace === 'merge' && <DiffMergeWorkspace />}
          {activeWorkspace === 'import' && <ImportExportWorkspace />}
        </div>
      </div>
    </QueryClientProvider>
  );
}

function navItemStyle(active: boolean): React.CSSProperties {
  return {
    width: '40px', height: '40px', borderRadius: '8px', cursor: 'pointer',
    border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: active ? '#1f6feb' : 'transparent',
    color: active ? '#fff' : '#8b949e',
    transition: 'all 0.2s'
  };
}