import React from 'react';
import { AuthForm } from '../components/common/AuthForm';
import { LoginScreenProps } from '../types';

export function LoginScreen({ navigation }: LoginScreenProps) {
  return (
    <AuthForm mode="login" onSwitch={() => navigation.navigate('Register')} />
  );
}
