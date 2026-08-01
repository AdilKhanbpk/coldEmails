'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';


const LoginForm = dynamic(() => import('./LoginForm.tsx'), { ssr: false });

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
