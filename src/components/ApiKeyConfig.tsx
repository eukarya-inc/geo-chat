import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { storeEncryptedApiKey, retrieveEncryptedApiKey, clearEncryptedApiKey } from '../utils/encryption';

const Container = styled.div`
  max-width: 500px;
  margin: 100px auto;
  padding: 32px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
`;

const Title = styled.h2`
  margin: 0 0 24px 0;
  color: #1a1a1a;
  font-size: 24px;
  font-weight: 600;
`;

const Description = styled.p`
  color: #666;
  margin: 0 0 24px 0;
  line-height: 1.6;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Label = styled.label`
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #333;
  font-size: 14px;
  font-weight: 500;
`;

const Input = styled.input`
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  font-family: monospace;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #2563eb;
  }
`;

const Button = styled.button`
  padding: 12px 24px;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #1d4ed8;
  }

  &:disabled {
    background: #94a3b8;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled.div`
  padding: 12px;
  background: #fee;
  border: 1px solid #fcc;
  border-radius: 8px;
  color: #c00;
  font-size: 14px;
`;

const SuccessMessage = styled.div`
  padding: 12px;
  background: #efe;
  border: 1px solid #cfc;
  border-radius: 8px;
  color: #060;
  font-size: 14px;
`;

const ExistingKeyMessage = styled.div`
  padding: 16px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  color: #0369a1;
  font-size: 14px;
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const ClearButton = styled.button`
  padding: 6px 12px;
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #b91c1c;
  }
`;

interface ApiKeyConfigProps {
  onApiKeySet: (apiKey: string) => void;
}

export function ApiKeyConfig({ onApiKeySet }: ApiKeyConfigProps) {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);

  useEffect(() => {
    checkExistingKey();
  }, []);

  const checkExistingKey = async () => {
    try {
      const existingKey = await retrieveEncryptedApiKey();
      if (existingKey) {
        setHasExistingKey(true);
        onApiKeySet(existingKey);
      }
    } catch (err) {
      console.error('Failed to check existing key:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    if (!apiKey.trim()) {
      setError('Please enter an API key');
      setLoading(false);
      return;
    }

    if (!apiKey.startsWith('sk-ant-')) {
      setError('Invalid API key format. Anthropic API keys should start with "sk-ant-"');
      setLoading(false);
      return;
    }

    try {
      await storeEncryptedApiKey(apiKey);
      setSuccess(true);
      onApiKeySet(apiKey);
      setHasExistingKey(true);
      setTimeout(() => {
        setApiKey('');
      }, 1000);
    } catch (err) {
      setError('Failed to save API key. Please try again.');
      console.error('Failed to store API key:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearKey = async () => {
    clearEncryptedApiKey();
    setHasExistingKey(false);
    setSuccess(false);
    setApiKey('');
    onApiKeySet('');
  };

  if (hasExistingKey && !success) {
    return (
      <Container>
        <Title>API Key Configuration</Title>
        <ExistingKeyMessage>
          <span>✓ API key is already configured</span>
          <ClearButton onClick={handleClearKey}>Clear Key</ClearButton>
        </ExistingKeyMessage>
        <Description>
          Your Anthropic API key is securely stored. You can clear it and enter a new one if needed.
        </Description>
      </Container>
    );
  }

  return (
    <Container>
      <Title>Configure Anthropic API Key</Title>
      <Description>
        To use the AI chat features, please enter your Anthropic API key. Your key will be encrypted and stored securely in your browser.
      </Description>
      
      <Form onSubmit={handleSubmit}>
        <Label>
          API Key
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            disabled={loading}
          />
        </Label>

        {error && <ErrorMessage>{error}</ErrorMessage>}
        {success && <SuccessMessage>✓ API key saved successfully!</SuccessMessage>}

        <Button type="submit" disabled={loading || !apiKey.trim()}>
          {loading ? 'Saving...' : 'Save API Key'}
        </Button>
      </Form>

      <Description style={{ marginTop: '24px', fontSize: '12px', color: '#999' }}>
        Don't have an API key? Get one from{' '}
        <a href="https://console.anthropic.com/api" target="_blank" rel="noopener noreferrer">
          Anthropic Console
        </a>
      </Description>
    </Container>
  );
}
