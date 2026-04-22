const FALLBACK_BACKEND_URL = 'http://localhost:3000';

export function getBackendBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    FALLBACK_BACKEND_URL
  );
}
