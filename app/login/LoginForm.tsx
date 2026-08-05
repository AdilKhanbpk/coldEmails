'use client';

import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Lock, Loader2 } from 'lucide-react';

const loginSchema = z.object({
    email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
    password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// Isolated component that uses useSearchParams — must be inside Suspense
function LoginFormInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

    const [serverError, setServerError] = useState('');
    const [oauthLoading, setOauthLoading] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
    });

    const onSubmit = async (data: LoginFormValues) => {
        setServerError('');

        const res = await signIn('credentials', {
            email: data.email,
            password: data.password,
            redirect: false,
        });

        if (res?.error) {
            setServerError('Incorrect email or password. Please try again.');
            return;
        }

        router.push(callbackUrl);
        router.refresh();
    };

    const handleOAuth = async (provider: 'google' | 'azure-ad') => {
        setOauthLoading(provider);
        await signIn(provider, { callbackUrl });
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
            <div className="w-full max-w-sm">
                <div className="mb-8 flex items-center justify-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
                        <Mail className="h-5 w-5" />
                    </div>
                    <span className="text-xl font-semibold tracking-tight">Outreach AI</span>
                </div>

                <Card className="border-gray-200 shadow-sm">
                    <CardHeader className="space-y-1 text-center">
                        <CardTitle className="text-xl">Welcome back</CardTitle>
                        <CardDescription>Sign in to your account to continue</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-2">
                            <Button
                                variant="outline"
                                type="button"
                                onClick={() => handleOAuth('google')}
                                disabled={!!oauthLoading}
                                className="w-full border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                            >
                                {oauthLoading === 'google' ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <GoogleIcon className="mr-2 h-4 w-4" />
                                )}
                                Continue with Google
                            </Button>
                            <Button
                                variant="outline"
                                type="button"
                                onClick={() => handleOAuth('azure-ad')}
                                disabled={!!oauthLoading}
                                className="w-full border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                            >
                                {oauthLoading === 'azure-ad' ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <MicrosoftIcon className="mr-2 h-4 w-4" />
                                )}
                                Continue with Microsoft
                            </Button>
                        </div>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-gray-200" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-white px-2 text-gray-400">or</span>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="you@company.com"
                                    autoComplete="email"
                                    {...register('email')}
                                />
                                {errors.email && (
                                    <p className="text-xs text-red-600">{errors.email.message}</p>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="password">Password</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="Enter your password"
                                        autoComplete="current-password"
                                        className="pl-9"
                                        {...register('password')}
                                    />
                                </div>
                                {errors.password && (
                                    <p className="text-xs text-red-600">{errors.password.message}</p>
                                )}
                            </div>

                            {serverError && (
                                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                                    {serverError}
                                </p>
                            )}

                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full bg-blue-600 hover:bg-blue-700"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Signing in...
                                    </>
                                ) : (
                                    'Sign in'
                                )}
                            </Button>
                        </form>

                        <p className="text-center text-sm text-gray-500">
                            Don&apos;t have an account?{' '}
                            <Link
                                href="/signup"
                                prefetch={false}
                                className="font-medium text-blue-600 hover:text-blue-700"
                            >
                                Sign up
                            </Link>
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

// Default export wraps the form in Suspense — required because useSearchParams
// causes a CSR bailout during static generation without it.
export default function LoginForm() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center bg-gray-50">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        }>
            <LoginFormInner />
        </Suspense>
    );
}

function GoogleIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
    );
}

function MicrosoftIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 3h8.5v8.5H3V3z" fill="#F25022" />
            <path d="M12.5 3H21v8.5h-8.5V3z" fill="#7FBA00" />
            <path d="M3 12.5h8.5V21H3v-8.5z" fill="#00A4EF" />
            <path d="M12.5 12.5H21V21h-8.5v-8.5z" fill="#FFB900" />
        </svg>
    );
}
