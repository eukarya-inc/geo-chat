import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import './index.css';

// No jotai <Provider> on purpose: the app relies on jotai's default store so
// that non-React tool code (defaultToolContext() via getDefaultStore()) and the
// UI read/write the SAME atoms. Wrapping <App/> in a Provider without a `store`
// prop creates an isolated store the tools never touch, which silently breaks
// agent-driven UI updates (map/chart tabs never open). See toolContext.ts.
createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
