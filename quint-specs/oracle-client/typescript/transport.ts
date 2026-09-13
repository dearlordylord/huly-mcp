/**
 * HTTP to the oracle daemon.
 *
 * One request shape everywhere: `fetch` (Node ≥ 18) with the protocol-version
 * header, no timeout. Errors carry the whole formatted diagnosis
 * (`METHOD url -> status: body` when the daemon refused the request,
 * `METHOD url failed: cause` when it never answered), so call sites need no
 * knowledge of the protocol to report them.
 */

/** The oracle wire-protocol version this client speaks. */
export const PROTOCOL_VERSION = 1;

/** POST one serialized event body to `/test/{name}`. */
export async function postEvent(
  baseUrl: string,
  test: string,
  body: string,
): Promise<void> {
  await send("POST", baseUrl, test, body);
}

/**
 * PATCH the run's outcome, spelled as the daemon deserializes it:
 * `{"status": "ok" | "failed"}`.
 */
export async function patchStatus(
  baseUrl: string,
  test: string,
  status: "ok" | "failed",
): Promise<void> {
  await send("PATCH", baseUrl, test, JSON.stringify({ status }));
}

async function send(
  method: "POST" | "PATCH",
  baseUrl: string,
  test: string,
  body: string,
): Promise<void> {
  const url = `${baseUrl}/test/${percentEncode(test)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "Quint-Oracle-Protocol": String(PROTOCOL_VERSION),
        "Content-Type": "application/json",
      },
      body,
    });
  } catch (error) {
    throw new Error(`${method} ${url} failed: ${describe(error)}`);
  }
  // Read the body even on success, so the connection can be reused; on
  // failure it doubles as the diagnosis (a 426 names the expected protocol
  // version, a 422 the missing component scope).
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`${method} ${url} -> ${response.status}: ${text.trim()}`);
  }
}

/** A fetch failure's message, with the cause Node buries under "fetch failed". */
function describe(error: unknown): string {
  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error ? `: ${error.cause.message}` : "";
    return `${error.message}${cause}`;
  }
  return String(error);
}

/**
 * Percent-encode one URL path segment: RFC 3986 unreserved bytes stay raw,
 * everything else — `/`, `%`, spaces, every non-ASCII byte of the UTF-8
 * encoding — is `%XX`-escaped. `encodeURIComponent` is wrong here (it leaves
 * `!'()*` raw); the daemon percent-decodes the segment back into UTF-8 bytes,
 * so any name round-trips intact.
 */
export function percentEncode(segment: string): string {
  let out = "";
  for (const byte of new TextEncoder().encode(segment)) {
    const unreserved =
      (byte >= 0x41 && byte <= 0x5a) || // A-Z
      (byte >= 0x61 && byte <= 0x7a) || // a-z
      (byte >= 0x30 && byte <= 0x39) || // 0-9
      byte === 0x2d || // -
      byte === 0x5f || // _
      byte === 0x2e || // .
      byte === 0x7e; // ~
    out += unreserved
      ? String.fromCharCode(byte)
      : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}
