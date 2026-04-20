import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { auth } from '../src/services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Pantallas
import LoginScreen from '../src/screens/LoginScreen';
import TabNavigator from '../src/navigation/TabNavigator';

const Stack = createNativeStackNavigator();

export function AppEntry() {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const subscriber = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (initializing) setInitializing(false);
    });
    return subscriber; 
  }, []);

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator size="large" color="#008080" />
      </View>
    );
  }

  // Usamos un Stack interno para manejar el switch Login/Main
  // Esto es compatible con Expo Router si se hace correctamente
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <Stack.Screen name="Main" component={TabNavigator} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

export default AppEntry;
