import { useState } from 'react';

const mockVocabularyItems = [
  { id: "skos:Concept", label: "SKOS Concept", desc: "An idea or notion; a unit of thought." },
  { id: "owl:Class", label: "OWL Class", desc: "A category of entities in the domain." },
  { id: "prov:Activity", label: "PROV Activity", desc: "Something that occurs over a period of time and acts upon or with entities." },
  { id: "foaf:Person", label: "FOAF Person", desc: "A human being." }
];

export function VocabularyWorkspace() {
  const [selectedItem, setSelectedItem] = useState(mockVocabularyItems[0].id);

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', backgroundColor: '#0d1117' }}>
      
      {/* Sidebar: Ontology Tree */}
      <div style={{ width: '320px', borderRight: '1px solid #30363d', backgroundColor: '#010409', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #30363d' }}>
          <h2 style={{ fontSize: '18px', color: '#c9d1d9', margin: 0, fontWeight: 600 }}>Ontology & Vocabulary</h2>
          <p style={{ color: '#8b949e', fontSize: '13px', margin: '8px 0 0 0' }}>Explore SKOS Concepts and OWL Classes</p>
        </div>
        
        <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {mockVocabularyItems.map((item) => (
            <button 
              key={item.id}
              onClick={() => setSelectedItem(item.id)}
              style={{
                textAlign: 'left',
                padding: '12px',
                borderRadius: '6px',
                backgroundColor: selectedItem === item.id ? 'rgba(88,166,255,0.1)' : 'transparent',
                border: '1px solid',
                borderColor: selectedItem === item.id ? 'rgba(88,166,255,0.4)' : 'transparent',
                color: selectedItem === item.id ? '#58a6ff' : '#c9d1d9',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{item.label}</div>
              <div style={{ fontSize: '12px', color: '#8b949e' }}>{item.id}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '48px', alignItems: 'center', justifyContent: 'center' }}>
        
        {selectedItem ? (
          <div style={{ 
            width: '100%', maxWidth: '800px', padding: '48px', 
            background: 'linear-gradient(135deg, rgba(13,17,23,0.75), rgba(22,27,34,0.6))',
            backdropFilter: 'blur(16px)',
            borderRadius: '16px',
            border: '1px solid rgba(88,166,255,0.2)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
          }}>
            <h1 style={{ fontSize: '32px', color: '#fff', margin: '0 0 16px 0' }}>
              {mockVocabularyItems.find(i => i.id === selectedItem)?.label}
            </h1>
            <div style={{ display: 'inline-block', backgroundColor: 'rgba(88,166,255,0.1)', padding: '6px 12px', borderRadius: '4px', color: '#58a6ff', fontSize: '14px', fontFamily: 'monospace', marginBottom: '24px' }}>
              {selectedItem}
            </div>
            
            <p style={{ color: '#c9d1d9', fontSize: '16px', lineHeight: '1.6', margin: '0 0 32px 0' }}>
              {mockVocabularyItems.find(i => i.id === selectedItem)?.desc}
            </p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ color: '#8b949e', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 16px 0' }}>Broader Concepts</h3>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ backgroundColor: '#21262d', padding: '4px 10px', borderRadius: '4px', color: '#c9d1d9', fontSize: '13px' }}>rdf:Resource</span>
                </div>
              </div>
              <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ color: '#8b949e', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 16px 0' }}>Narrower Concepts</h3>
                <p style={{ margin: 0, color: '#8b949e', fontStyle: 'italic', fontSize: '14px' }}>No narrower concepts found.</p>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: '#8b949e', textAlign: 'center' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '16px', opacity: 0.5 }}>
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>
            </svg>
            <h2>Select a vocabulary item</h2>
            <p>Choose an item from the sidebar to view details.</p>
          </div>
        )}
        
      </div>
    </div>
  );
}