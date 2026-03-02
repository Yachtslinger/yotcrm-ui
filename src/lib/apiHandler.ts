import { NextResponse } from "next/server";

/**
 * Wraps an API handler with consistent error handling and logging.
 * Use: export const GET = apiHandler(async (req) => { ... return data; });
 */
export function apiHandler<T>(
  handler: (req: Request) => Promise<T>,
  options?: { status?: number }
) {
  return async (req: Request): Promise<NextResponse> => {
    try {
      const result = await handler(req);
      if (result instanceof NextResponse) return result;
      return NextResponse.json(result, { status: options?.status ?? 200 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const route = new URL(req.url).pathname;
      console.error(`[API Error] ${req.method} ${route}:`, message);
      return NextResponse.json(
        { error: message, route, timestamp: new Date().toISOString() },
        { status: 500 }
      );
    }
  };
}
