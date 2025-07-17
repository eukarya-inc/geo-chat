import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import AppWithRedux from './AppWithRedux';
import ModelingPage from './pages/ModelingPage';

function NavigationBar() {
    const location = useLocation();
    
    const getLinkStyle = (path: string) => ({
        textDecoration: 'none',
        color: location.pathname === path ? '#0056b3' : '#007bff',
        fontSize: '16px',
        fontWeight: location.pathname === path ? '600' : '500',
        borderBottom: location.pathname === path ? '2px solid #0056b3' : 'none',
        paddingBottom: '2px'
    });
    
    return (
        <nav style={{
            height: '50px',
            minHeight: '50px',
            backgroundColor: '#f8f9fa',
            borderBottom: '1px solid #ddd',
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            gap: '20px',
            flexShrink: 0
        }}>
            <Link to="/" style={getLinkStyle('/')}>
                Home
            </Link>
            <Link to="/modeling" style={getLinkStyle('/modeling')}>
                Modeling
            </Link>
        </nav>
    );
}

function AppWithRouter() {
    // Get base path from Vite config
    const basename = import.meta.env.BASE_URL;
    
    return (
        <Router basename={basename}>
            <div style={{ 
                height: '100vh', 
                width: '100vw', 
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Navigation Bar */}
                <NavigationBar />
                
                {/* Page Content */}
                <div style={{ 
                    flex: 1,
                    overflow: 'hidden',
                    position: 'relative'
                }}>
                    <Routes>
                        <Route path="/" element={<AppWithRedux />} />
                        <Route path="/modeling" element={<ModelingPage />} />
                    </Routes>
                </div>
            </div>
        </Router>
    );
}

export default AppWithRouter;