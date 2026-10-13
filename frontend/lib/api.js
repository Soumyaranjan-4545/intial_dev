/**
 * One place for every call to the backend.
 *
 * apiFetch("/auth/me") calls /api/auth/me, which Next.js forwards to
 * FastAPI (see next.config.mjs). If the backend answers with an error,
 * apiFetch throws an ApiError carrying a readable message, so pages can
 * simply do:
 *
 *   try { await apiFetch(...) } catch (error) { show(error.message) }
 */

export class ApiError extends Error {
  constructor(status, message, fieldErrors = {}) {
    super(message);
    this.status = status;
    // For 422 validation errors: { phone: "Enter a valid ..." }
    this.fieldErrors = fieldErrors;
  }
}

/**
 * FastAPI sends errors in two shapes:
 *  - our own rules:   {"detail": "This code has expired..."}
 *  - validation (422): {"detail": [{"loc": ["body", "phone"], "msg": "..."}]}
 */
function readError(status, body) {
  const detail = body?.detail;
  if (typeof detail === "string") {
    return new ApiError(status, detail);
  }
  if (Array.isArray(detail)) {
    const fieldErrors = {};
    for (const problem of detail) {
      const field = problem.loc?.[problem.loc.length - 1];
      // Pydantic prefixes custom messages with "Value error, ".
      const message = String(problem.msg || "").replace(/^Value error, /, "");
      if (field && !fieldErrors[field]) fieldErrors[field] = message;
    }
    return new ApiError(status, "Please check the highlighted fields.", fieldErrors);
  }
  return new ApiError(status, "Something went wrong. Please try again.");
}

export async function apiFetch(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check that the backend is running.");
  }

  if (response.status === 204) return null; // success with no content (e.g. sign out)

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // The proxy answers 500 with no JSON when FastAPI isn't running.
    if (data === null && response.status >= 500) {
      throw new ApiError(response.status, "Can't reach the server. Check that the backend is running.");
    }
    throw readError(response.status, data);
  }
  return data;
}
