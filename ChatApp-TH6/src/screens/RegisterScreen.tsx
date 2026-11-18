import React from 'react';
import { AuthForm } from '../components/common/AuthForm';
import { RegisterScreenProps } from '../types';

export function RegisterScreen({ navigation }: RegisterScreenProps) {
  return <AuthForm mode="register" onSwitch={() => navigation.goBack()} />;
}
