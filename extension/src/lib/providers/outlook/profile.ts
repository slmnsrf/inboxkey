/**
 * Outlook Profile API Integration
 *
 * Fetches Outlook/Microsoft user profile information using the Microsoft Graph API.
 * Used to retrieve the user's email address after authentication.
 */

/**
 * Fetch Outlook user profile to retrieve email address
 *
 * Uses the Microsoft Graph API to fetch the authenticated user's profile.
 * This endpoint returns user information including email addresses.
 *
 * The Microsoft Graph /me endpoint returns multiple email-related fields:
 * - mail: Primary SMTP email address (preferred)
 * - userPrincipalName: User's UPN (fallback, may be email-like)
 *
 * @param accessToken - Valid OAuth access token with Mail.Read scope
 * @returns User's email address
 * @throws Error if profile fetch fails or token is invalid
 */
export async function fetchOutlookProfile(accessToken: string): Promise<string> {
  try {
    const response = await fetch(
      'https://graph.microsoft.com/v1.0/me',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      // Provide specific error messages based on status code
      if (response.status === 401 || response.status === 403) {
        throw new Error('PROFILE_AUTH_FAILED')
      }
      if (response.status === 429) {
        throw new Error('PROFILE_RATE_LIMITED')
      }
      if (response.status >= 500) {
        throw new Error('PROFILE_SERVER_ERROR')
      }
      throw new Error(`PROFILE_FETCH_FAILED:${response.status}`)
    }

    const data = await response.json()

    // Prefer mail field, fallback to userPrincipalName
    const email = data.mail || data.userPrincipalName

    if (!email) {
      throw new Error('PROFILE_NO_EMAIL')
    }

    return email
  } catch (error) {
    // Re-throw our custom errors as-is
    if (error instanceof Error && error.message.startsWith('PROFILE_')) {
      throw error
    }

    // Network errors
    if (error instanceof TypeError || (error instanceof Error && error.message.includes('fetch'))) {
      throw new Error('PROFILE_NETWORK_ERROR')
    }

    // Unknown error
    throw new Error('PROFILE_UNKNOWN_ERROR')
  }
}
