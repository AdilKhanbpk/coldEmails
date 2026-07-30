import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import MicrosoftProvider from 'next-auth/providers/azure-ad';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required.');
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!user || !user.password) {
          throw new Error('No account found with that email. Try signing up.');
        }

        const passwordValid = await bcrypt.compare(
          credentials.password,
          user.password,
        );
        if (!passwordValid) {
          throw new Error('Incorrect password. Please try again.');
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
        };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
    MicrosoftProvider({
      clientId: process.env.MICROSOFT_CLIENT_ID || '',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
      tenantId: 'common',
      authorization: {
        params: {
          scope: 'openid email profile Mail.Send Mail.ReadWrite',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'credentials') {
        return true;
      }

      if (account && (account.provider === 'google' || account.provider === 'azure-ad')) {
        if (!user.email) return false;

        const existing = await prisma.user.findUnique({
          where: { email: user.email.toLowerCase() },
        });

        if (!existing) {
          await prisma.user.create({
            data: {
              name: user.name || 'New User',
              email: user.email.toLowerCase(),
              role: 'ADMIN',
            },
          });
        }
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};
