import type { ApiResult, PanelRequest, PanelResponse, RecoveryActionData } from "../shared/messages";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function send<T>(message: PanelRequest): Promise<ApiResult<T>> {
  try {
    const response: unknown = await chrome.runtime.sendMessage(message);
    if (!response || typeof response !== "object" || typeof (response as { ok?: unknown }).ok !== "boolean") {
      return {
        ok: false,
        code: "invalid-response",
        error: "The extension background did not return a valid response. Reload the extension and try again.",
      };
    }
    return response as ApiResult<T>;
  } catch (error) {
    return {
      ok: false,
      code: "send-failed",
      error: `Could not reach the extension background: ${describeError(error)}`,
    };
  }
}

/** Send a typed request to the background and normalise every failure shape. */
export async function sendPanelRequest(message: PanelRequest): Promise<PanelResponse> {
  return send<import("../shared/types").PanelState>(message);
}

export async function sendRecoveryRequest(message: PanelRequest): Promise<ApiResult<RecoveryActionData>> {
  return send<RecoveryActionData>(message);
}

export async function requestLocalIcon(documentId: string, issueId: string): Promise<string | null> {
  const result = await send<string>({ kind: "panel:localIcon", documentId, issueId });
  return result.ok ? result.data : null;
}
