import { useEffect } from 'react';
import { useAppDispatch } from './store/hooks';
import { initializeDuckDB } from './store/slices/duckdbSlice';
import Layout from './components/Layout';
import DiagnosticsPanel from './components/DiagnosticsPanel';

function App() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Initialize DuckDB when app starts
    dispatch(initializeDuckDB());
  }, [dispatch]);

  return (
    <>
      <Layout />
      {/* Temporary diagnostics panel for debugging */}
      <DiagnosticsPanel />
    </>
  );
}

export default App;
