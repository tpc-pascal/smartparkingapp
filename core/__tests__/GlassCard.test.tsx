import React from 'react';
import { render } from '@testing-library/react-native';
import GlassCard from '../src/components/GlassCard';

it('renders children inside GlassCard', () => {
  const { getByText } = render(<GlassCard><></></GlassCard>);
});

it('applies custom style', () => {
  const { getByTestId } = render(
    <GlassCard style={{ marginTop: 10 }}><></></GlassCard>
  );
});
