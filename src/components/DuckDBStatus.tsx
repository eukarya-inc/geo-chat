import { useAppSelector } from '../store/hooks';
import styled from 'styled-components';

const StatusContainer = styled.div`
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  padding: 12px 24px;
  border-radius: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  font-size: 13px;
  z-index: 1000;
  border: 1px solid rgba(0, 0, 0, 0.06);
`;

const StatusIndicator = styled.div<{ status: 'loading' | 'success' | 'error' }>`
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(0, 0, 0, 0.7);
  font-weight: 500;
  
  &::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${props => 
      props.status === 'loading' ? '#f59e0b' :
      props.status === 'success' ? '#10b981' : 
      '#ef4444'
    };
    opacity: 0.8;
    animation: ${props => props.status === 'loading' ? 'pulse 2s infinite' : 'none'};
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 0.3; }
  }
`;

export function DuckDBStatus() {
  const { isInitialized, isLoading, error } = useAppSelector(state => state.duckdb);
  
  const status = isLoading ? 'loading' : isInitialized ? 'success' : 'error';
  const message = isLoading ? 'Initializing DuckDB...' : 
                  isInitialized ? 'DuckDB Ready' : 
                  `Error: ${error || 'Failed to initialize'}`;
  
  return (
    <StatusContainer>
      <StatusIndicator status={status}>
        {message}
      </StatusIndicator>
    </StatusContainer>
  );
}