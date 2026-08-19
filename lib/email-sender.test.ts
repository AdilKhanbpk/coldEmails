import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import type { EmailPayload } from './email-sender';
import type { IInbox } from '../models/Inbox';
import { encryptJSON } from './crypto';

/**
 * Bug Condition Exploration Test
 * **Validates: Requirements 1.1, 1.4, 1.5, 2.1**
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * 
 * This test encodes the EXPECTED behavior:
 * - When Gmail access token is expired AND refresh token is valid
 * - System SHOULD catch auth error and attempt token refresh
 * - System SHOULD make HTTP POST request to https://oauth2.googleapis.com/token
 * - System SHOULD retry the send and succeed
 * 
 * On UNFIXED code, this test will FAIL because:
 * - sendViaGmail throws AuthError immediately without attempting refresh
 * - No HTTP request is made to Google's token endpoint
 * 
 * When this test PASSES after fix implementation, it confirms the bug is resolved.
 */

// Mock googleapis at the top level
const mockSendMessage = vi.fn();
const mockSetCredentials = vi.fn();
const mockOn = vi.fn();
const mockOAuth2Client = {
  setCredentials: mockSetCredentials,
  on: mockOn,
};

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class OAuth2 {
        constructor() {
          return mockOAuth2Client;
        }
      },
    },
    gmail: vi.fn(() => ({
      users: {
        messages: {
          send: mockSendMessage,
        },
      },
    })),
  },
}));

// Mock Microsoft Graph Client at top level
const mockPost = vi.fn();
const mockApi = vi.fn().mockReturnValue({ post: mockPost });
const mockClientInit = vi.fn().mockReturnValue({ api: mockApi });

vi.mock('@microsoft/microsoft-graph-client', () => ({
  Client: {
    init: mockClientInit,
  },
}));

// Mock nodemailer at top level
const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'smtp_msg_123' });
const mockVerify = vi.fn().mockResolvedValue(true);
const mockTransport = {
  sendMail: mockSendMail,
  verify: mockVerify,
};
const mockCreateTransport = vi.fn().mockReturnValue(mockTransport);

vi.mock('nodemailer', () => ({
  default: {
    createTransport: mockCreateTransport,
  },
}));

// Mock MongoDB connection
vi.mock('./mongodb', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

// Mock Inbox model
vi.mock('../models/Inbox', () => ({
  default: {
    findOneAndUpdate: vi.fn().mockResolvedValue({}),
  },
}));

describe('Bug Condition Exploration: Gmail Token Expired Without Refresh', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    mockSendMessage.mockReset();
    mockSetCredentials.mockReset();
    mockOn.mockReset();
    
    // Mock fetch to intercept HTTP requests
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(vi.fn());
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  /**
   * Property 1: Bug Condition - Gmail Token Expired Without Refresh
   * 
   * Test Strategy:
   * 1. Create inbox with Gmail provider, expired access token, valid refresh token
   * 2. Attempt to send email via sendViaGmail
   * 3. EXPECTED BEHAVIOR (will fail on unfixed code):
   *    - Token refresh should be attempted (HTTP POST to oauth2.googleapis.com/token)
   *    - Email should be sent successfully after token refresh
   * 4. ACTUAL BEHAVIOR on unfixed code (confirming the bug):
   *    - AuthError thrown immediately
   *    - No token refresh HTTP request made
   *    - Email not sent
   */
  it('should attempt token refresh when Gmail access token is expired (EXPECTED TO FAIL ON UNFIXED CODE)', async () => {
    // Arrange: Create mock inbox with expired Gmail access token
    const expiredAccessToken = 'ya29.expired_access_token_from_2_hours_ago';
    const validRefreshToken = 'valid_refresh_token_12345';
    const clientId = 'test_client_id.apps.googleusercontent.com';
    const clientSecret = 'test_client_secret';
    
    const mockInbox: Partial<IInbox> = {
      provider: 'GMAIL',
      emailAddress: 'test@example.com',
      userId: 'user123',
      status: 'CONNECTED',
      credentials: encryptJSON({
        accessToken: expiredAccessToken,
        refreshToken: validRefreshToken,
        clientId: clientId,
        clientSecret: clientSecret,
      }),
    };

    const emailPayload: EmailPayload = {
      to: 'recipient@example.com',
      from: 'test@example.com',
      subject: 'Test Email',
      text: 'This is a test email',
    };

    // Mock Gmail API to return 401 Unauthorized (expired token)
    mockSendMessage.mockRejectedValueOnce(
      new Error('Request had invalid authentication credentials. Expected OAuth 2 access token. 401')
    );

    // Mock successful token refresh response
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'ya29.new_access_token_fresh',
        refresh_token: validRefreshToken,
        expires_in: 3600,
      }),
    } as Response);

    // Mock successful send after token refresh
    mockSendMessage.mockResolvedValueOnce({
      data: {
        id: 'message_123',
        threadId: 'thread_456',
      },
    });

    // Act & Assert
    // EXPECTED BEHAVIOR: Should attempt token refresh and succeed
    // On UNFIXED code: Will throw AuthError without attempting refresh
    
    // Import sendEmail here to get fresh mocked dependencies
    const { sendEmail, AuthError } = await import('./email-sender');
    
    try {
      const result = await sendEmail(mockInbox as IInbox, emailPayload);
      
      // If we reach here, token refresh was attempted (EXPECTED behavior after fix)
      // Verify token refresh HTTP request was made
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );
      
      // Verify email was sent successfully after refresh
      expect(result).toBeDefined();
      expect(result.providerMessageId).toBe('message_123');
      expect(result.threadId).toBe('thread_456');
      
      // Verify Gmail send was called twice (first failed, second succeeded after refresh)
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      
    } catch (error) {
      // If we reach here, the bug still exists (EXPECTED on UNFIXED code)
      // This confirms the bug: AuthError thrown without attempting token refresh
      
      expect(error).toBeInstanceOf(AuthError);
      expect((error as Error).message).toContain('Gmail authentication failed');
      
      // CRITICAL: Verify NO token refresh was attempted (this proves the bug)
      expect(fetchSpy).not.toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.anything()
      );
      
      // Log the counterexample for documentation
      console.log('COUNTEREXAMPLE FOUND (Bug Confirmed):');
      console.log('- Gmail access token:', expiredAccessToken);
      console.log('- Gmail send failed with AuthError');
      console.log('- No token refresh HTTP request was made');
      console.log('- Email was NOT sent');
      console.log('- User would need to manually reconnect inbox');
      
      // IMPORTANT: This test SHOULD FAIL here on unfixed code
      // After the fix is implemented, this test will pass (no error thrown)
      throw new Error(
        'BUG CONFIRMED: Gmail send failed with AuthError. ' +
        'No token refresh was attempted. ' +
        'This is the expected outcome for bug condition exploration. ' +
        'After implementing the fix, this test should pass.'
      );
    }
  });

  /**
   * Property-Based Test: Gmail Token Expired Across Various Scenarios
   * 
   * This property generates various expired token scenarios and verifies
   * that token refresh is attempted in all cases (after fix is implemented).
   */
  it.skip('property: should attempt token refresh for any expired Gmail token (ENABLE AFTER FIX)', async () => {
    const { sendEmail } = await import('./email-sender');
    
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          to: fc.emailAddress(),
          subject: fc.string({ minLength: 1, maxLength: 100 }),
          text: fc.string({ minLength: 1, maxLength: 500 }),
        }),
        async (emailData) => {
          const expiredAccessToken = `ya29.expired_${Date.now()}`;
          const validRefreshToken = `refresh_token_${Date.now()}`;
          
          const mockInbox: Partial<IInbox> = {
            provider: 'GMAIL',
            emailAddress: 'test@example.com',
            userId: 'user123',
            status: 'CONNECTED',
            credentials: encryptJSON({
              accessToken: expiredAccessToken,
              refreshToken: validRefreshToken,
              clientId: 'client_id',
              clientSecret: 'client_secret',
            }),
          };

          const emailPayload: EmailPayload = {
            to: emailData.to,
            from: 'test@example.com',
            subject: emailData.subject,
            text: emailData.text,
          };

          // Mock expired token error
          mockSendMessage.mockRejectedValueOnce(
            new Error('401 unauthorized')
          );

          // Mock successful refresh
          fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              access_token: 'new_token',
              refresh_token: validRefreshToken,
            }),
          } as Response);

          // Mock successful retry
          mockSendMessage.mockResolvedValueOnce({
            data: { id: 'msg_id', threadId: 'thread_id' },
          });

          // After fix: should succeed with token refresh
          const result = await sendEmail(mockInbox as IInbox, emailPayload);
          
          // Verify token refresh was attempted
          expect(fetchSpy).toHaveBeenCalledWith(
            'https://oauth2.googleapis.com/token',
            expect.anything()
          );
          
          // Verify email was sent
          expect(result.providerMessageId).toBeDefined();
        }
      ),
      { numRuns: 10 }
    );
  });
});


/**
 * PRESERVATION PROPERTY TESTS
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 * 
 * These tests observe and capture baseline behavior on UNFIXED code.
 * They MUST PASS on unfixed code to confirm behaviors we want to preserve.
 * 
 * Strategy: Observation-first methodology
 * 1. Run tests on UNFIXED code to observe current behavior
 * 2. Capture that behavior in test assertions
 * 3. After fix is implemented, re-run to ensure no regressions
 */
describe('Preservation Properties: Valid Token and Non-Gmail Behavior', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMessage.mockReset();
    mockSetCredentials.mockReset();
    mockOn.mockReset();
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(vi.fn());
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  /**
   * Preservation Property 1: Valid Gmail Token Behavior
   * **Validates: Requirement 3.1**
   * 
   * WHEN Gmail access token is valid (not expired)
   * THEN email should send successfully WITHOUT any token refresh operations
   * 
   * This test observes and confirms the current successful sending flow
   * that must remain unchanged after the fix.
   */
  it('should send Gmail email successfully with valid token WITHOUT token refresh', async () => {
    const { sendEmail } = await import('./email-sender');
    
    // Arrange: Mock inbox with valid Gmail access token
    const validAccessToken = 'ya29.valid_access_token_not_expired';
    const refreshToken = 'valid_refresh_token_12345';
    
    const mockInbox: Partial<IInbox> = {
      provider: 'GMAIL',
      emailAddress: 'test@example.com',
      userId: 'user123',
      status: 'CONNECTED',
      credentials: encryptJSON({
        accessToken: validAccessToken,
        refreshToken: refreshToken,
        clientId: 'client_id',
        clientSecret: 'client_secret',
      }),
    };

    const emailPayload: EmailPayload = {
      to: 'recipient@example.com',
      from: 'test@example.com',
      subject: 'Test Email',
      text: 'This is a test email',
    };

    // Mock successful Gmail send (no auth error)
    mockSendMessage.mockResolvedValueOnce({
      data: {
        id: 'message_valid_token_123',
        threadId: 'thread_valid_456',
      },
    });

    // Act
    const result = await sendEmail(mockInbox as IInbox, emailPayload);

    // Assert: Email sent successfully
    expect(result).toBeDefined();
    expect(result.providerMessageId).toBe('message_valid_token_123');
    expect(result.threadId).toBe('thread_valid_456');
    
    // Assert: Gmail send was called exactly once (no retry)
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    
    // Assert: NO token refresh was attempted (no HTTP call to Google token endpoint)
    expect(fetchSpy).not.toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.anything()
    );
    
    console.log('✓ Preservation confirmed: Valid Gmail tokens send successfully without token refresh');
  });

  /**
   * Preservation Property 2: Gmail SDK Auto-Refresh Event Listener
   * **Validates: Requirement 3.2**
   * 
   * WHEN Gmail SDK automatically refreshes tokens proactively before expiration
   * THEN the 'tokens' event listener should save new tokens to database
   * 
   * This test confirms the existing SDK auto-refresh mechanism continues to work.
   */
  it('should preserve Gmail SDK auto-refresh event listener functionality', async () => {
    const { sendEmail } = await import('./email-sender');
    
    // Arrange: Mock inbox with valid Gmail access token
    const validAccessToken = 'ya29.valid_token_before_sdk_refresh';
    const refreshToken = 'refresh_token';
    
    const mockInbox: Partial<IInbox> = {
      provider: 'GMAIL',
      emailAddress: 'test@example.com',
      userId: 'user123',
      status: 'CONNECTED',
      credentials: encryptJSON({
        accessToken: validAccessToken,
        refreshToken: refreshToken,
        clientId: 'client_id',
        clientSecret: 'client_secret',
      }),
    };

    const emailPayload: EmailPayload = {
      to: 'recipient@example.com',
      from: 'test@example.com',
      subject: 'Test Email',
      text: 'Test',
    };

    // Capture the 'tokens' event listener
    let tokensListener: ((tokens: any) => void) | null = null;
    mockOn.mockImplementation((event: string, callback: any) => {
      if (event === 'tokens') {
        tokensListener = callback;
      }
    });

    // Mock successful Gmail send
    mockSendMessage.mockResolvedValueOnce({
      data: { id: 'msg_id', threadId: 'thread_id' },
    });

    // Act: Send email (this registers the event listener)
    await sendEmail(mockInbox as IInbox, emailPayload);

    // Verify the event listener was registered
    expect(mockOn).toHaveBeenCalledWith('tokens', expect.any(Function));
    expect(tokensListener).toBeDefined();

    // Simulate SDK auto-refresh by triggering the 'tokens' event
    if (tokensListener) {
      const newTokensFromSDK = {
        access_token: 'ya29.new_token_from_sdk_refresh',
        refresh_token: refreshToken,
      };
      
      // Trigger the event listener (SDK auto-refresh)
      await tokensListener(newTokensFromSDK);
      
      // The event listener should save tokens to database via Inbox.findOneAndUpdate
      const InboxModel = (await import('../models/Inbox')).default;
      expect(InboxModel.findOneAndUpdate).toHaveBeenCalledWith(
        { emailAddress: 'test@example.com', userId: 'user123' },
        expect.objectContaining({
          status: 'CONNECTED',
        })
      );
    }
    
    console.log('✓ Preservation confirmed: Gmail SDK auto-refresh event listener continues to work');
  });

  /**
   * Preservation Property 3: Non-Authentication Error Handling
   * **Validates: Requirement 3.3**
   * 
   * WHEN non-authentication errors occur during Gmail send
   * THEN system should throw appropriate error types WITHOUT attempting token refresh
   * 
   * This confirms error handling for bounce errors, network errors, etc. is preserved.
   */
  it('should handle bounce errors correctly without attempting token refresh', async () => {
    const { sendEmail, BounceError } = await import('./email-sender');
    
    const mockInbox: Partial<IInbox> = {
      provider: 'GMAIL',
      emailAddress: 'test@example.com',
      userId: 'user123',
      status: 'CONNECTED',
      credentials: encryptJSON({
        accessToken: 'valid_token',
        refreshToken: 'refresh_token',
        clientId: 'client_id',
        clientSecret: 'client_secret',
      }),
    };

    const emailPayload: EmailPayload = {
      to: 'invalid@example.com',
      from: 'test@example.com',
      subject: 'Test',
      text: 'Test',
    };

    // Mock bounce error (550 - mailbox not found)
    mockSendMessage.mockRejectedValueOnce(
      new Error('550 5.1.1 The email account that you tried to reach does not exist.')
    );

    // Act & Assert: Should throw BounceError
    await expect(sendEmail(mockInbox as IInbox, emailPayload)).rejects.toThrow(BounceError);
    
    // Assert: NO token refresh was attempted (not an auth error)
    expect(fetchSpy).not.toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.anything()
    );
    
    console.log('✓ Preservation confirmed: Bounce errors handled correctly without token refresh');
  });

  /**
   * Preservation Property 4: Outlook Token Refresh (Already Working)
   * **Validates: Requirement 3.4**
   * 
   * WHEN Outlook access token is expired
   * THEN existing Outlook token refresh logic should work correctly
   * 
   * This confirms Outlook's working token refresh is not affected by Gmail changes.
   */
  it('should preserve Outlook token refresh functionality (already working)', async () => {
    const { sendEmail } = await import('./email-sender');
    
    // Arrange: Mock Outlook inbox with expired access token
    const expiredOutlookToken = 'expired_outlook_access_token';
    const validRefreshToken = 'valid_outlook_refresh_token';
    
    const mockInbox: Partial<IInbox> = {
      provider: 'OUTLOOK',
      emailAddress: 'test@outlook.com',
      userId: 'user123',
      status: 'CONNECTED',
      credentials: encryptJSON({
        accessToken: expiredOutlookToken,
        refreshToken: validRefreshToken,
        clientId: 'outlook_client_id',
        clientSecret: 'outlook_client_secret',
      }),
    };

    const emailPayload: EmailPayload = {
      to: 'recipient@example.com',
      from: 'test@outlook.com',
      subject: 'Test Email',
      text: 'Test',
    };

    // Mock first send attempt fails with auth error
    mockPost.mockRejectedValueOnce(new Error('401 unauthorized'));

    // Mock successful token refresh from Microsoft
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new_outlook_access_token',
        refresh_token: validRefreshToken,
      }),
    } as Response);

    // Mock successful retry after token refresh
    mockPost.mockResolvedValueOnce(undefined);

    // Act
    const result = await sendEmail(mockInbox as IInbox, emailPayload);

    // Assert: Email sent successfully after token refresh
    expect(result).toBeDefined();
    expect(result.providerMessageId).toContain('outlook-');
    
    // Assert: Token refresh was attempted with Microsoft endpoint
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    );
    
    // Assert: Send was attempted twice (first failed, second succeeded)
    expect(mockPost).toHaveBeenCalledTimes(2);
    
    console.log('✓ Preservation confirmed: Outlook token refresh continues to work correctly');
  });

  /**
   * Preservation Property 5: SMTP Sending (Unaffected)
   * **Validates: Requirement 3.5**
   * 
   * WHEN sending via SMTP provider
   * THEN normal SMTP flow should work WITHOUT any OAuth logic
   * 
   * This confirms SMTP sending is completely unaffected by Gmail OAuth changes.
   */
  it('should preserve SMTP sending functionality without OAuth logic', async () => {
    const { sendEmail } = await import('./email-sender');
    
    // Arrange: Mock SMTP inbox
    const mockInbox: Partial<IInbox> = {
      provider: 'SMTP',
      emailAddress: 'test@smtp.com',
      userId: 'user123',
      status: 'CONNECTED',
      credentials: encryptJSON({
        host: 'smtp.example.com',
        port: 587,
        username: 'smtp_user',
        password: 'smtp_pass',
        secure: false,
      }),
    };

    const emailPayload: EmailPayload = {
      to: 'recipient@example.com',
      from: 'test@smtp.com',
      subject: 'Test Email',
      text: 'Test',
    };

    // Act
    const result = await sendEmail(mockInbox as IInbox, emailPayload);

    // Assert: Email sent successfully via SMTP
    expect(result).toBeDefined();
    expect(result.providerMessageId).toBe('smtp_msg_123');
    
    // Assert: Nodemailer sendMail was called
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'test@smtp.com',
        to: 'recipient@example.com',
        subject: 'Test Email',
        text: 'Test',
      })
    );
    
    // Assert: NO OAuth-related HTTP calls were made
    expect(fetchSpy).not.toHaveBeenCalled();
    
    console.log('✓ Preservation confirmed: SMTP sending works without OAuth logic');
  });

  /**
   * Property-Based Test: Valid Gmail Tokens Never Trigger Refresh
   * **Validates: Requirement 3.1**
   * 
   * FOR ALL valid Gmail tokens and email payloads
   * THEN email should send successfully WITHOUT token refresh
   * 
   * This uses property-based testing to verify preservation across many inputs.
   */
  it('property: valid Gmail tokens always send successfully without refresh', async () => {
    const { sendEmail } = await import('./email-sender');
    
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          to: fc.emailAddress(),
          subject: fc.string({ minLength: 1, maxLength: 100 }),
          text: fc.string({ minLength: 1, maxLength: 500 }),
        }),
        async (emailData) => {
          // Arrange: Mock inbox with valid Gmail token
          const mockInbox: Partial<IInbox> = {
            provider: 'GMAIL',
            emailAddress: 'test@example.com',
            userId: 'user123',
            status: 'CONNECTED',
            credentials: encryptJSON({
              accessToken: `ya29.valid_token_${Date.now()}`,
              refreshToken: 'refresh_token',
              clientId: 'client_id',
              clientSecret: 'client_secret',
            }),
          };

          const emailPayload: EmailPayload = {
            to: emailData.to,
            from: 'test@example.com',
            subject: emailData.subject,
            text: emailData.text,
          };

          // Mock successful send (no auth error)
          mockSendMessage.mockResolvedValueOnce({
            data: { id: `msg_${Date.now()}`, threadId: `thread_${Date.now()}` },
          });

          // Act
          const result = await sendEmail(mockInbox as IInbox, emailPayload);

          // Assert: Email sent successfully
          expect(result.providerMessageId).toBeDefined();
          
          // Assert: NO token refresh was attempted
          expect(fetchSpy).not.toHaveBeenCalledWith(
            'https://oauth2.googleapis.com/token',
            expect.anything()
          );
          
          // Reset for next iteration
          vi.clearAllMocks();
          mockSendMessage.mockReset();
          fetchSpy.mockClear();
        }
      ),
      { numRuns: 20 }
    );
    
    console.log('✓ Property confirmed: All valid Gmail tokens send without refresh (20 runs)');
  });

  /**
   * Property-Based Test: Non-Auth Errors Never Trigger Refresh
   * **Validates: Requirement 3.3**
   * 
   * FOR ALL non-authentication error types
   * THEN system should throw appropriate errors WITHOUT attempting token refresh
   */
  it('property: non-auth errors never trigger token refresh', async () => {
    const { sendEmail } = await import('./email-sender');
    
    // Test various non-auth error messages
    const nonAuthErrors = [
      '550 5.1.1 mailbox not found',
      '550 bounce',
      'User not found',
      'Network error',
      'ETIMEDOUT',
      'ECONNREFUSED',
    ];

    for (const errorMsg of nonAuthErrors) {
      // Arrange
      const mockInbox: Partial<IInbox> = {
        provider: 'GMAIL',
        emailAddress: 'test@example.com',
        userId: 'user123',
        status: 'CONNECTED',
        credentials: encryptJSON({
          accessToken: 'valid_token',
          refreshToken: 'refresh_token',
          clientId: 'client_id',
          clientSecret: 'client_secret',
        }),
      };

      const emailPayload: EmailPayload = {
        to: 'test@example.com',
        from: 'test@example.com',
        subject: 'Test',
        text: 'Test',
      };

      // Mock non-auth error
      mockSendMessage.mockRejectedValueOnce(new Error(errorMsg));

      // Act & Assert: Should throw error
      await expect(sendEmail(mockInbox as IInbox, emailPayload)).rejects.toThrow();
      
      // Assert: NO token refresh attempted
      expect(fetchSpy).not.toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.anything()
      );
      
      // Reset for next iteration
      vi.clearAllMocks();
      mockSendMessage.mockReset();
      fetchSpy.mockClear();
    }
    
    console.log('✓ Property confirmed: Non-auth errors never trigger token refresh');
  });
});
