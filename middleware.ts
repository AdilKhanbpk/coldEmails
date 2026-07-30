export { default } from 'next-auth/middleware';

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/onboarding/:path*',
    '/settings/:path*',
    '/outreach-types/:path*',
    '/leads/:path*',
  ],
};
