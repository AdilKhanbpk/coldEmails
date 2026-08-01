import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import Inbox from '@/models/Inbox';
import { encryptJSON } from '@/lib/crypto';

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/login?error=Unauthorized`);
        }

        const { searchParams } = new URL(req.url);
        const code = searchParams.get('code');
        if (!code) {
            return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings/inboxes?error=NoCode`);
        }

        const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.MICROSOFT_CLIENT_ID || '',
                client_secret: process.env.MICROSOFT_CLIENT_SECRET || '',
                code,
                redirect_uri: `${process.env.NEXTAUTH_URL}/api/oauth/microsoft/callback`,
                grant_type: 'authorization_code',
            }),
        });

        if (!tokenRes.ok) {
            const errorText = await tokenRes.text();
            console.error('Microsoft token exchange failed:', errorText);
            return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings/inboxes?error=TokenExchangeFailed`);
        }

        const tokens = await tokenRes.json();

        const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });

        if (!profileRes.ok) {
            console.error('Failed to fetch Microsoft profile');
            return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings/inboxes?error=ProfileFetchFailed`);
        }

        const profile = await profileRes.json();
        const emailAddress = profile.mail || profile.userPrincipalName;

        if (!emailAddress) {
            return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings/inboxes?error=NoEmail`);
        }

        const creds = {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            clientId: process.env.MICROSOFT_CLIENT_ID || '',
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
        };
        const encrypted = encryptJSON(creds);

        await connectDB();

        await Inbox.findOneAndUpdate(
            { userId: session.user.id, emailAddress: emailAddress.toLowerCase() },
            {
                userId: session.user.id,
                provider: 'OUTLOOK',
                emailAddress: emailAddress.toLowerCase(),
                credentials: encrypted,
                status: 'CONNECTED',
                updatedAt: new Date(),
            },
            { upsert: true, new: true }
        );

        return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings/inboxes?success=true`);
    } catch (error) {
        console.error('Error in Microsoft OAuth callback:', error);
        return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings/inboxes?error=CallbackFailed`);
    }
}
