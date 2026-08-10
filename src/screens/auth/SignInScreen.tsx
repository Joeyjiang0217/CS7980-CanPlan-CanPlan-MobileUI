import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSignIn } from '../../features/auth';
import { messageForSignInError } from '../../features/auth/lib/errorMessages';
import type { AuthStackParamList } from '../../navigation/types';
import PasswordField from '../../shared/components/PasswordField';
import PrimaryButton from '../../shared/components/PrimaryButton';
import SecondaryButton from '../../shared/components/SecondaryButton';
import TextField from '../../shared/components/TextField';
import { colors, radius, spacing, typography } from '../../shared/theme/tokens';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'SignIn'>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const signInMutation = useSignIn();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();

  const canSubmit = email.length > 0 && password.length > 0 && !signInMutation.isPending;

  const handleSubmit = () => {
    // Cascade top-to-bottom: show the first failing field's error, clear the
    // rest. Each click of Sign In advances to the next problem.
    setFormError(undefined);
    setEmailError(undefined);
    setPasswordError(undefined);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError('Please enter your email.');
      return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setPasswordError('Please enter your password.');
      return;
    }

    signInMutation.mutate(
      { username: trimmedEmail, password },
      {
        onSuccess: (result) => {
          if (!result.isSignedIn) {
            setFormError(messageForNextStep(result.nextStep));
          }
          // When isSignedIn becomes true, the navigation root swaps to Home.
        },
        onError: (err) => {
          setFormError(messageForSignInError(err));
        },
      },
    );
  };

  const handleForgotPassword = () => {
    navigation.navigate('ForgotPassword');
  };

  const handleCreateAccount = () => {
    navigation.navigate('CreateAccount');
  };

  return (
    <View style={styles.root}>
      <View style={[styles.banner, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={styles.brand}>CanPlan 2.0</Text>
        <Text style={styles.tagline}>Your daily task guide</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.formWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + spacing.xl },
          ]}
        >
          <Text style={styles.heading}>Sign In</Text>

          <TextField
            label="Email address"
            placeholder="e.g. alex@email.com"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (emailError) setEmailError(undefined);
              if (formError) setFormError(undefined);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            textContentType="emailAddress"
            errorText={emailError}
          />

          <View style={styles.spacer} />

          <PasswordField
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (passwordError) setPasswordError(undefined);
              if (formError) setFormError(undefined);
            }}
            autoComplete="password"
            textContentType="password"
            errorText={passwordError}
          />

          <Pressable
            accessibilityRole="link"
            onPress={handleForgotPassword}
            style={styles.forgotWrap}
            hitSlop={8}
          >
            <Text style={styles.forgot}>Forgot password?</Text>
          </Pressable>

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}

          <PrimaryButton
            label="Sign In"
            onPress={handleSubmit}
            disabled={!canSubmit}
            loading={signInMutation.isPending}
            style={styles.signInBtn}
          />

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <SecondaryButton label="Create Account" onPress={handleCreateAccount} />

          <View style={{ flex: 1 }} />

          <Text style={styles.footnote}>
            Need help? Ask a support person to assist you.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function messageForNextStep(nextStep: string): string {
  switch (nextStep) {
    case 'CONFIRM_SIGN_UP':
      return 'Please verify your email before signing in.';
    case 'RESET_PASSWORD':
      return 'You need to reset your password to continue.';
    case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED':
      return 'Please set a new password to continue.';
    default:
      return `Additional step required: ${nextStep}.`;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  banner: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    alignItems: 'center',
  },
  brand: {
    ...typography.title,
    color: colors.onPrimary,
  },
  tagline: {
    ...typography.bodyStrong,
    color: colors.onPrimary,
    marginTop: spacing.xs,
    opacity: 0.95,
  },
  formWrapper: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  heading: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.xl,
  },
  spacer: {
    height: spacing.lg,
  },
  forgotWrap: {
    alignSelf: 'flex-end',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  forgot: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  formError: {
    ...typography.caption,
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  signInBtn: {
    marginTop: spacing.xs,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerText: {
    ...typography.body,
    color: colors.textMuted,
    marginHorizontal: spacing.md,
  },
  footnote: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
