import React from 'react';
import { render, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../src/context/AuthContext';

jest.mock('../src/utils/databaseHelper', () => ({
  logout: jest.fn().mockResolvedValue(undefined),
  deleteAccount: jest.fn().mockResolvedValue(undefined),
}));

function TestConsumer() {
  const { attendantId, attendantName, login, logout, deleteAccount } = useAuth();
  return (
    <>
      {/* Using testID-based assertions */}
    </>
  );
}

it('provides default values (0, empty)', () => {
  const { getByText } = render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  );
});

it('throws when useAuth used outside AuthProvider', () => {
  expect(() => render(<TestConsumer />)).toThrow('useAuth must be used within AuthProvider');
});
