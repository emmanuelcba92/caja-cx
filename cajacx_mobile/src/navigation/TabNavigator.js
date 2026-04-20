import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import CajaScreen from '../screens/CajaScreen';
import DailyCashScreen from '../screens/DailyCashScreen';
import LiquidacionScreen from '../screens/LiquidacionScreen';
import ProfileScreen from '../screens/ProfileScreen';
import NewOrderScreen from '../screens/NewOrderScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import AddMovementScreen from '../screens/AddMovementScreen';
import ProfesionalesScreen from '../screens/ProfesionalesScreen';
import { useTheme } from '../context/ThemeContext';
import { LayoutGrid, History, Landmark, User, Users, ClipboardList } from 'lucide-react-native';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Stack para las Cirugías
const CirugiasStack = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CirugiasList" component={HomeScreen} />
      <Stack.Screen name="NewOrder" component={NewOrderScreen} />
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
    </Stack.Navigator>
  );
};

// Stack para la Caja
const CajaStack = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CajaList" component={CajaScreen} />
      <Stack.Screen name="AddMovement" component={AddMovementScreen} />
    </Stack.Navigator>
  );
};

const TabNavigator = () => {
  const { colors, isDark } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtext,
        tabBarStyle: {
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
      })}
    >
      <Tab.Screen 
        name="CajaDiaria" 
        component={DailyCashScreen} 
        options={{
          tabBarLabel: 'Caja Diaria',
          tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} />,
        }}
      />
      <Tab.Screen 
        name="Historial" 
        component={CajaScreen} 
        options={{
          tabBarLabel: 'Historial',
          tabBarIcon: ({ color, size }) => <History color={color} size={size} />,
        }}
      />
      <Tab.Screen 
        name="Cirugias" 
        component={CirugiasStack} 
        options={{
          tabBarLabel: 'Órdenes',
          tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} />,
        }}
      />
      <Tab.Screen 
        name="Liquidacion" 
        component={LiquidacionScreen} 
        options={{
          tabBarLabel: 'Liquidación',
          tabBarIcon: ({ color, size }) => <Landmark color={color} size={size} />,
        }}
      />
      <Tab.Screen 
        name="Profesionales" 
        component={ProfesionalesScreen} 
        options={{
          tabBarLabel: 'Profesionales',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tab.Screen 
        name="Perfil" 
        component={ProfileScreen} 
        options={{
          tabBarLabel: 'Perfil',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
};

export default TabNavigator;
