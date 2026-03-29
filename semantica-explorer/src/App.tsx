import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VocabularyWorkspace } from './workspaces/VocabularyWorkspace/VocabularyWorkspace';


const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div style={{ margin: 0, padding: 0, width: '100vw', height: '100vh' }}>
        <VocabularyWorkspace />
      </div>
    </QueryClientProvider>
  );
}

export default App;