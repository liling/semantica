// types.ts

export interface VocabularyScheme {
  uri: string;
  label: string;
}

export interface ConceptNode {
  uri: string;
  pref_label: string;
  alt_labels: string[];
  children?: ConceptNode[];
}

// Mock data, will del once backend apis are finished

export const MOCK_SCHEMES: VocabularyScheme[] = [
  { uri: "http://example.org/medical", label: "Medical Taxonomy" },
  { uri: "http://example.org/finance", label: "Financial Glossary" }
];

export const MOCK_HIERARCHY: ConceptNode[] = [
  {
    uri: "http://example.org/medical/diseases",
    pref_label: "Diseases",
    alt_labels: ["Illnesses", "Conditions"],
    children: [
      {
        uri: "http://example.org/medical/infectious",
        pref_label: "Infectious Diseases",
        alt_labels: ["Communicable Diseases"],
        children: []
      },
      {
        uri: "http://example.org/medical/genetic",
        pref_label: "Genetic Disorders",
        alt_labels: ["Hereditary Diseases"],
        children: []
      }
    ]
  }
];