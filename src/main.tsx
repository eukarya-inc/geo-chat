import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { Provider as JotaiProvider } from 'jotai';
import { store } from './store';
import AppWithRouter from './AppWithRouter.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <JotaiProvider>
            <Provider store={store}>
                <AppWithRouter />
            </Provider>
        </JotaiProvider>
    </StrictMode>
);
