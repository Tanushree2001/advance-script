import { NextResponse } from "next/server" // helper to create a response.
import type { NextRequest } from "next/server" // imports the typescript type NextRequest.

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers) // creates a new mutable copy of the request headers.
  requestHeaders.set("x-pathname", request.nextUrl.pathname || "/")

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

