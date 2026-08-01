import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { google } from 'googleapis';
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

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            `${process.env.NEXTAUTH_URL}/api/oauth/google/callback`
        );

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        const emailAddress = userInfo.data.email;

        if (!emailAddress) {
            return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings/inboxes?error=NoEmail`);
        }

        const creds = {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        };
        const encrypted = encryptJSON(creds);

        await connectDB();

        await Inbox.findOneAndUpdate(
            { userId: session.user.id, emailAddress: emailAddress.toLowerCase() },
            {
                userId: session.user.id,
                provider: 'GMAIL',
                emailAddress: emailAddress.toLowerCase(),
                credentials: encrypted,
                status: 'CONNECTED',
                updatedAt: new Date(),
            },
            { upsert: true, new: true }
        );

        return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings/inboxes?success=true`);
    } catch (error) {
        console.error('Error in Google OAuth callback:', error);
        return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings/inboxes?error=CallbackFailed`);
    }
}
