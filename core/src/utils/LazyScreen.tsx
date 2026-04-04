import React, { useState, useEffect, ComponentType } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

interface LazyScreenProps {
  load: () => Promise<{ default: ComponentType<any> }>;
  [key: string]: any;
}

function LazyScreen({ load, ...props }: LazyScreenProps) {
  const [Component, setComponent] = useState<ComponentType<any> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    load()
      .then(mod => {
        if (alive) setComponent(() => mod.default);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => { alive = false; };
  }, []);

  if (error) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#4A90D9" size="large" />
      </View>
    );
  }

  if (!Component) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#4A90D9" size="large" />
      </View>
    );
  }

  return <Component {...props} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default LazyScreen;
