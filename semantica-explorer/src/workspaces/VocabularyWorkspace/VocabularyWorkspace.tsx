import React, { useState } from 'react';
import { ConceptTree } from './ConceptTree';
import { ImportDropzone } from './ImportDropzone';
import { useVocabularies, useConceptHierarchy } from './queries';
import type { VocabularyScheme, ConceptNode } from './types';

export const VocabularyWorkspace: React.FC = () => {
  const [selectedScheme, setSelectedScheme] = useState<VocabularyScheme | null>(null);
  const [selectedConcept, setSelectedConcept] = useState<ConceptNode | null>(null);

  const { data: schemes = [], isLoading: isLoadingSchemes } = useVocabularies();
  const { data: hierarchy = [], isLoading: isLoadingTree } = useConceptHierarchy(selectedScheme?.uri);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#f9fafb' }}>
      
      <div style={{ width: '250px', borderRight: '1px solid #e5e7eb', padding: '16px', backgroundColor: 'white' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '16px' }}>Vocabularies</h2>
        
        {isLoadingSchemes ? (
          <p style={{ color: '#6b7280', fontSize: '14px' }}>Loading...</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {schemes.map((scheme) => (
              <li 
                key={scheme.uri}
                onClick={() => setSelectedScheme(scheme)}
                style={{ 
                  padding: '8px', 
                  cursor: 'pointer', 
                  backgroundColor: selectedScheme?.uri === scheme.uri ? '#e0f2fe' : 'transparent',
                  borderRadius: '4px'
                }}
              >
                {scheme.label}
              </li>
            ))}
          </ul>
        )}
        
        <ImportDropzone />
      </div>

      <div style={{ flex: 1, borderRight: '1px solid #e5e7eb', padding: '16px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '16px' }}>
          {selectedScheme ? selectedScheme.label : "Select a Vocabulary"}
        </h2>
        
        {selectedScheme ? (
          isLoadingTree ? (
            <p style={{ color: '#6b7280', marginTop: '20px' }}>Loading tree...</p>
          ) : (
            <ConceptTree 
              data={hierarchy} 
              onSelectConcept={setSelectedConcept} 
            />
          )
        ) : (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <p>Select a vocabulary from the left to view its hierarchy.</p>
          </div>
        )}
      </div>

      <div style={{ width: '300px', padding: '16px', backgroundColor: 'white' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '16px' }}>Concept Details</h2>
        
        {selectedConcept ? (
           <div>
             <h3>{selectedConcept.pref_label}</h3>
             <p style={{ fontSize: '14px', color: '#4b5563', marginTop: '8px' }}>URI: {selectedConcept.uri}</p>
             <p style={{ fontSize: '14px', color: '#4b5563', marginTop: '8px' }}>
               Alt Labels: {selectedConcept.alt_labels?.join(', ') || 'None'}
             </p>
           </div>
        ) : (
          <p style={{ color: '#6b7280' }}>Click a node in the tree to view details.</p>
        )}
      </div>

    </div>
  );
};