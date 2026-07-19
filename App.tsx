// Must be imported before any other module that may use crypto (e.g. Amplify
// Auth / Cognito), so polyfill `crypto.getRandomValues` first.
import 'react-native-get-random-values';

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProviders } from './src/app/AppProviders';
import { useSession } from './src/app/SessionContext';
import { useCurrentUser } from './src/features/auth';
import { useMyProfile } from './src/features/users/hooks/useMyProfile';
import { readSimpleMode } from './src/features/users/hooks/useSimpleMode';
import CreateAccountScreen from './src/screens/auth/CreateAccountScreen';
import ForgotPasswordResetScreen from './src/screens/auth/ForgotPasswordResetScreen';
import ForgotPasswordScreen from './src/screens/auth/ForgotPasswordScreen';
import OnboardingNameScreen from './src/screens/auth/OnboardingNameScreen';
import SignInScreen from './src/screens/auth/SignInScreen';
import VerifyEmailScreen from './src/screens/auth/VerifyEmailScreen';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import CaregiverHomeScreen from './src/screens/caregiver/CaregiverHomeScreen';
import PatientOverviewScreen from './src/screens/caregiver/PatientOverviewScreen';
import CategoriesScreen from './src/screens/categories/CategoriesScreen';
import ReportsScreen from './src/screens/reports/ReportsScreen';
import ReportViewScreen from './src/screens/reports/ReportViewScreen';
import SelectPersonScreen from './src/screens/reports/SelectPersonScreen';
import AllTasksScreen from './src/screens/tasks/AllTasksScreen';
import CreateTaskScreen from './src/screens/tasks/CreateTaskScreen';
import CreateTaskStepScreen from './src/screens/tasks/CreateTaskStepScreen';
import ManageTasksScreen from './src/screens/tasks/ManageTasksScreen';
import ReorderStepsScreen from './src/screens/tasks/ReorderStepsScreen';
import TaskDetailScreen from './src/screens/tasks/TaskDetailScreen';
import TaskViewScreen from './src/screens/tasks/TaskViewScreen';
import { colors } from './src/shared/theme/tokens';

const Stack = createNativeStackNavigator();

/**
 * State-driven routing: picks one of three stacks based on session state.
 *
 *  - No Cognito user and not in guest mode → Auth stack (SignIn et al.)
 *  - Signed-in real user but profile not yet created → Onboarding (name)
 *  - Signed-in with profile, OR guest mode → Main stack
 *
 * Whenever any of these states change (sign in, sign out, profile created,
 * Skip pressed), the next render picks the matching stack — no manual
 * navigation.reset() needed anywhere.
 */
function RootStack() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const { isGuest } = useSession();
  // Only fetch the profile when a real user is signed in — in guest mode
  // there is no Cognito identity to query.
  const { data: profile, isLoading: profileLoading } = useMyProfile({
    enabled: !!currentUser && !isGuest,
  });

  if (userLoading) {
    return <Splash />;
  }
  // Real user signed in but the profile fetch hasn't completed yet — wait
  // so we don't briefly flash the Onboarding screen for existing users.
  if (currentUser && !isGuest && profileLoading) {
    return <Splash />;
  }

  const isAuthed = !!currentUser || isGuest;
  const needsOnboarding = !!currentUser && !isGuest && profile == null;
  const simpleMode = readSimpleMode(profile?.accessibilitySettings);
  // Caregivers (support persons) land on their own dashboard — the list of
  // people they support — rather than the patient Home. Role is derived from
  // the real profile, so there is no manual "role chooser" screen.
  const isCaregiver = profile?.role === 'SUPPORT_PERSON';
  const mainInitialRoute = isCaregiver
    ? 'CaregiverHome'
    : simpleMode
      ? 'AllTasks'
      : 'Home';

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={mainInitialRoute}
    >
      {!isAuthed ? (
        <>
          <Stack.Screen name="SignIn" component={SignInScreen} />
          <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
          <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          <Stack.Screen
            name="ForgotPasswordReset"
            component={ForgotPasswordResetScreen}
          />
        </>
      ) : needsOnboarding ? (
        <Stack.Screen name="Onboarding" component={OnboardingNameScreen} />
      ) : (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="CaregiverHome" component={CaregiverHomeScreen} />
          <Stack.Screen name="PatientOverview" component={PatientOverviewScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Categories" component={CategoriesScreen} />
          <Stack.Screen name="AllTasks" component={AllTasksScreen} />
          <Stack.Screen name="ManageTasks" component={ManageTasksScreen} />
          <Stack.Screen name="TaskView" component={TaskViewScreen} />
          <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
          <Stack.Screen
            name="CreateTask"
            component={CreateTaskScreen}
            options={{ headerBackButtonMenuEnabled: false }}
          />
          <Stack.Screen name="CreateTaskStep" component={CreateTaskStepScreen} />
          <Stack.Screen name="ReorderSteps" component={ReorderStepsScreen} />
          <Stack.Screen name="ReportPeople" component={SelectPersonScreen} />
          <Stack.Screen name="Reports" component={ReportsScreen} />
          <Stack.Screen name="ReportView" component={ReportViewScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

function Splash() {
  return (
    <View style={styles.splash}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <AppProviders>
        <SafeAreaProvider>
          <NavigationContainer>
            <RootStack />
          </NavigationContainer>
          <StatusBar style="dark" />
        </SafeAreaProvider>
      </AppProviders>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
