/**
 * Gmail Profile API Integration
 *
 * Fetches Gmail user profile information using the Gmail API.
 * Used to retrieve the user's email address after authentication.
 */

/**
 * Fetch Gmail user profile to retrieve email address
 *
 * Uses the Gmail API v1 to fetch the authenticated user's profile.
 * This endpoint returns basic profile information including the email address.
 *
 * @param accessToken - Valid OAuth access token with Gmail.readonly scope
 * @returns User's email address
 * @throws Error if profile fetch fails or token is invalid
 */
export async function fetchGmailProfile(accessToken: string): Promise<string> {
  try {
    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
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

    if (!data.emailAddress) {
      throw new Error('PROFILE_NO_EMAIL')
    }

    return data.emailAddress
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
