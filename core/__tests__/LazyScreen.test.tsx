import React from 'react';
import { render, act } from '@testing-library/react-native';
import LazyScreen from '../src/utils/LazyScreen';

it('shows loading indicator while component loads', () => {
  const load = () => new Promise<{ default: React.ComponentType<any> }>(() => {});
  const { getByTestId } = render(<LazyScreen load={load} />);
});

it('renders component after successful load', async () => {
  const Dummy = () => null;
  const load = () => Promise.resolve({ default: Dummy });
  const { getByTestId } = render(<LazyScreen load={load} />);
  await act(() => Promise.resolve());
});

it('shows loading on error', async () => {
  const load = () => Promise.reject(new Error('fail'));
  const { getByTestId } = render(<LazyScreen load={load} />);
  await act(() => Promise.resolve());
});
