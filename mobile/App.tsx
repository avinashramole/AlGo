import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/AuthContext";
import { MarketProvider } from "./src/MarketContext";
import { AlgoScreen } from "./src/screens/AlgoScreen";
import { BrokersScreen } from "./src/screens/BrokersScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { MarketsScreen } from "./src/screens/MarketsScreen";
import { OptionsScreen } from "./src/screens/OptionsScreen";
import { OrdersScreen } from "./src/screens/OrdersScreen";
import { PortfolioScreen } from "./src/screens/PortfolioScreen";
import { PositionsScreen } from "./src/screens/PositionsScreen";
import { ReportScreen } from "./src/screens/ReportScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { SignalsScreen } from "./src/screens/SignalsScreen";
import { TradeScreen } from "./src/screens/TradeScreen";
import { colors } from "./src/theme";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Markets" component={MarketsScreen} />
      <Tab.Screen name="Chain" component={OptionsScreen} />
      <Tab.Screen name="Signals" component={SignalsScreen} />
      <Tab.Screen name="Algo" component={AlgoScreen} />
      <Tab.Screen name="Portfolio" component={PortfolioScreen} />
    </Tab.Navigator>
  );
}

function Root() {
  const { ready, user } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.brand} />
        <Text style={{ marginTop: 8, color: colors.muted }}>Starting T2S...</Text>
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.brand, headerTitleStyle: { fontWeight: "800" } }}>
      {user ? (
        <>
          <Stack.Screen name="Main" component={Tabs} options={{ headerShown: false }} />
          <Stack.Screen name="Options" component={OptionsScreen} />
          <Stack.Screen name="Orders" component={OrdersScreen} options={{ title: "Order Book" }} />
          <Stack.Screen name="Positions" component={PositionsScreen} />
          <Stack.Screen name="Report" component={ReportScreen} />
          <Stack.Screen name="Brokers" component={BrokersScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Trade" component={TradeScreen} options={{ title: "Review Trade" }} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <MarketProvider>
            <NavigationContainer>
              <StatusBar style="dark" />
              <Root />
            </NavigationContainer>
          </MarketProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
