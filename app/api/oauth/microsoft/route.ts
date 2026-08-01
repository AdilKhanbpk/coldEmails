import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const clientId = process.env.MICROSOFT_CLIENT_ID;
        if (!clientId) {
            return NextResponse.json({ error: 'Microsoft Client ID not configured' }, { status: 500 });
        }

        const redirectUri = `${process.env.NEXTAUTH_URL}/api/oauth/microsoft/callback`;
        const scope = 'openid email profile offline_access Mail.Send Mail.ReadWrite';
        const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${encodeURIComponent(scope)}`;

        return NextResponse.redirect(url);
    } catch (error) {
        console.error('Error starting Microsoft OAuth:', error);
        return NextResponse.json({ error: 'Failed to initiate Microsoft OAuth' }, { status: 500 });
    }
}
