type CredentialTestState = {
  lastTestStatus?: string | null;
  lastErrorMessage?: string | null;
};

const authFailurePattern =
  /authentication failed|unauthorized|invalid[^.]*token|expired[^.]*token|\b401\b/i;

export function isYelpCredentialAuthFailure(
  credential: CredentialTestState | null | undefined,
) {
  return (
    credential?.lastTestStatus === "FAILED" &&
    authFailurePattern.test(credential.lastErrorMessage ?? "")
  );
}
