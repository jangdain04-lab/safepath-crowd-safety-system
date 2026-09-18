import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

export default function SplashScreen({ navigation }: any) {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('Login');
    }, 1500);

    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Image source={require('../../../assets/logo.png')} style={styles.logo} />

      <Text style={styles.logoText}>
        SAFE<Text style={styles.logoAccent}>PATH</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 154,
    height: 154,
    resizeMode: 'contain',
    marginBottom: 54,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 1,
  },
  logoAccent: {
    color: '#55CCC4',
  },
});
