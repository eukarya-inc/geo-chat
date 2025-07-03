import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store';
import AppWithRedux from './AppWithRedux.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Provider store={store}>
            <HashRouter>
                <AppWithRedux />
            </HashRouter>
        </Provider>
    </StrictMode>
);
