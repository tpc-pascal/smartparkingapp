import React from 'react';
import { render } from '@testing-library/react-native';
import AppIcon, { AvatarCircle } from '../src/theme/Icon';

it('renders AppIcon with given name', () => {
  const { getByTestId } = render(<AppIcon name="camera" />);
});

it('renders AvatarCircle with initial letter', () => {
  const { getByText } = render(<AvatarCircle label="John" />);
  expect(getByText('J')).toBeTruthy();
});

it('renders AvatarCircle with lowercase label', () => {
  const { getByText } = render(<AvatarCircle label="doe" />);
  expect(getByText('D')).toBeTruthy();
});

it('renders AvatarCircle with custom size', () => {
  const { getByText } = render(<AvatarCircle label="A" size={60} />);
  expect(getByText('A')).toBeTruthy();
});
