import { HashRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import AppWithRedux from './AppWithRedux';
import ModelingPage from './pages/ModelingPage';

function NavigationBar() {
    const location = useLocation();

    const getLinkClasses = (path: string) => {
        const isActive = location.pathname === path;
        return `text-base no-underline transition-colors ${
            isActive
                ? 'text-blue-700 font-semibold border-b-2 border-blue-700 pb-0.5'
                : 'text-blue-500 font-medium hover:text-blue-600'
        }`;
    };

    return (
        <nav className="h-12 min-h-12 bg-gray-50 border-b border-gray-300 flex items-center px-5 gap-5 flex-shrink-0">
            <Link to="/" className={getLinkClasses('/')}>
                Visualization
            </Link>
            <Link to="/modeling" className={getLinkClasses('/modeling')}>
                Modeling
            </Link>
        </nav>
    );
}

function AppWithRouter() {
    return (
        <Router>
            <div className="h-screen w-screen overflow-hidden flex flex-col">
                {/* Navigation Bar */}
                <NavigationBar />

                {/* Page Content */}
                <div className="flex-1 overflow-hidden relative">
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
