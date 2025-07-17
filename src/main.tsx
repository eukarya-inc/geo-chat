import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store';
import AppWithRouter from './AppWithRouter.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Provider store={store}>
            <AppWithRouter />
        </Provider>
    </StrictMode>
);
