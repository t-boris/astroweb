/** REQ-008: the device-bound notice is for anonymous users who already have a profile. */
export function shouldShowSignInNotice(s: { authReady: boolean; signedIn: boolean; profileCount: number }): boolean {
  return s.authReady && !s.signedIn && s.profileCount > 0;
}
