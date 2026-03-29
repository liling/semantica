// ConceptTree.tsx
import React from 'react';


import { Tree } from 'react-arborist';
import type { NodeRendererProps } from 'react-arborist';

import { ChevronRight, ChevronDown, Folder, FileText } from 'lucide-react';
import type { ConceptNode } from './types';

interface ConceptTreeProps {
  data: ConceptNode[];
  onSelectConcept: (concept: ConceptNode) => void;
}

export const ConceptTree: React.FC<ConceptTreeProps> = ({ data, onSelectConcept }) => {
  return (
    <div style={{ height: '600px', width: '100%', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      <Tree
        data={data}
        idAccessor="uri"
        width="100%"
        height={600}
        indent={24}
        rowHeight={36}
      >
        {(nodeProps: NodeRendererProps<ConceptNode>) => {
          const { node, style, dragHandle } = nodeProps;
          const isFolder = node.children && node.children.length > 0;

          return (
            <div 
              ref={dragHandle} 
              onClick={() => {
                node.toggle(); 
                onSelectConcept(node.data); 
              }}
        
              style={{
                ...style,
                display: 'flex',
                alignItems: 'center',
                padding: '0 8px',
                cursor: 'pointer',
                backgroundColor: node.isSelected ? '#e0f2fe' : 'transparent',
                userSelect: 'none',
                borderBottom: '1px solid #f3f4f6'
              }}
            >
              <span style={{ width: '20px', display: 'flex', justifyContent: 'center' }}>
                {isFolder ? (
                  node.isOpen ? <ChevronDown size={16} color="#6b7280" /> : <ChevronRight size={16} color="#6b7280" />
                ) : null}
              </span>
              
              <span style={{ marginRight: '8px', display: 'flex', alignItems: 'center' }}>
                {isFolder ? <Folder size={16} color="#3b82f6" /> : <FileText size={16} color="#9ca3af" />}
              </span>
              
              <span style={{ fontSize: '14px', color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {node.data.pref_label}
              </span>
            </div>
          );
        }}
      </Tree>
    </div>
  );
};