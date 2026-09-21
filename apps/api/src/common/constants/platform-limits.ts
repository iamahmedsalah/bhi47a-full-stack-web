// Vercel Functions reject request or response payloads above 4.5 MB. Keeping
// application uploads at 4 MB leaves room for multipart boundaries and headers.
export const MAX_HTTP_UPLOAD_SIZE_BYTES = 4 * 1024 * 1024;
