import { DraftAlert } from "@/components/misc/DraftAlert"
import { AdvanceScriptSection } from "@/components/misc/AdvanceScriptSection"
import { HeaderNav } from "@/components/navigation/HeaderNav"
import { getScriptsForPath, getBundleForPath } from "@/lib/advance-script-manager"
import type { Metadata } from "next"
import { headers } from "next/headers"
import type { ReactNode } from "react"

import "@/styles/globals.css"

export const metadata: Metadata = {
  title: {
    default: "Next.js for Drupal",
    template: "%s | Next.js for Drupal",
  },
  description: "A Next.js site powered by a Drupal backend.",
  icons: {
    icon: "/favicon.ico",
  },
}

async function getRequestPath() {
  const headerList = await headers()

  // Middleware stores the current pathname here.
  const middlewarePath = headerList.get("x-pathname")
  if (middlewarePath) {
    return middlewarePath
  }

  // Next.js sends the requested path in this header during SSR/ISR.
  const invokePath = headerList.get("x-invoke-path")
  if (invokePath) {
    return invokePath
  }

  // Fallback to next-url which contains full URL (including query).
  const nextUrl = headerList.get("next-url")
  if (nextUrl) {
    try {
      const parsed = new URL(nextUrl, "http://localhost")
      return parsed.pathname || "/"
    } catch (error) {
      return "/"
    }
  }

  return "/"
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  const path = await getRequestPath()
  
  // Get content type from Drupal (API call here, can be cached by Next.js)
  const bundle = await getBundleForPath(path)
  
  // Fetch scripts filtered by both path and content type
  const scripts = await getScriptsForPath(path, bundle)

  return (
    <html lang="en">
      <head>
        <AdvanceScriptSection scripts={scripts} section="head" />
      </head>
      <body>
        <AdvanceScriptSection scripts={scripts} section="body" />
        <DraftAlert />
        <div className="max-w-screen-md px-6 mx-auto">
          <HeaderNav />
          <main className="container py-10 mx-auto">{children}</main>
        </div>
        <AdvanceScriptSection scripts={scripts} section="footer" />
      </body>
    </html>
  )
}
