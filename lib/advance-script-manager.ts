import { drupal } from "./drupal"
/**
 * Helper utilities for Drupal's Advance Script Manager integration.
 * Current scope: only the "pages" visibility rules plus placement handling.
 */
const drupalBaseUrl = process.env.NEXT_PUBLIC_DRUPAL_BASE_URL
const endpoint = drupalBaseUrl
  ? `${drupalBaseUrl.replace(/\/+$/, "")}/api/asm`
  : ""

export type AdvanceScript = {
  id: string
  script_name: string
  script_code: string
  css_code: string
  visibility_section?: string
  pages_settings: "" | "only" | "all" // "" or "all" => all pages except the listed pages, "only" => only the listed pages
  visibility_pages: string // list of pages to apply the script to
  content_type?: string // list of content types to apply the script to
  status: "0" | "1"
  weight?: string // weight of the script
}

export type ScriptPlacement = "head" | "body" | "footer"

export function normalizeSection(section?: string | null): ScriptPlacement {
  const value = section?.toLowerCase().trim()

  if (value === "footer") {
    return "footer"
  }

  if (value === "body") {
    return "body"
  }

  return "head"
}

// Ensures every path comparison uses the same simple format.
function normalizePath(path: string) {
  if (!path) {
    return "/"
  }

  const trimmed = path.trim()
  if (!trimmed) {
    return "/"
  }

  if (!trimmed.startsWith("/")) {
    return `/${trimmed}`
  }

  return trimmed.replace(/\/+$/, "") || "/"
}

// Drupal stores page rules as newline or comma separated strings.
function parsePageList(value: string) {
  return value
    .split(/[\r\n,]+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

const wildcardRegexCache = new Map<string, RegExp>()

function pathPatternMatches(pathPattern: string, normalizedPath: string) {
  if (pathPattern === "<front>") {
    return normalizedPath === "/"
  }

  const normalizedPattern = normalizePath(pathPattern)
  if (!normalizedPattern.includes("*")) {
    return normalizedPattern === normalizedPath
  }

  let regex = wildcardRegexCache.get(normalizedPattern)
  if (!regex) {
    const escaped = normalizedPattern
      .split("*")
      .map((segment) => segment.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&"))
      .join(".*")
    regex = new RegExp(`^${escaped}$`)
    wildcardRegexCache.set(normalizedPattern, regex)
  }

  return regex.test(normalizedPath)
}

// Implements "All pages except..." / "Only the listed pages" logic.
function matchesPageSetting(script: AdvanceScript, path: string) {
  const pages = parsePageList(script.visibility_pages)

  // No pages configured => script applies everywhere for now.
  if (!pages.length) {
    return true
  }

  const normalizedPath = normalizePath(path)

  const matches = pages.some((page) => {
    return pathPatternMatches(page, normalizedPath)
  })

  // pages_settings === "only" => allow only listed pages.
  if (script.pages_settings === "only") {
    return matches
  }

  // default fallback => apply everywhere except the listed pages.
  return !matches
}

export function filterScriptsByPath(
  scripts: AdvanceScript[],
  path: string
) {
  return scripts
    .filter((script) => script.status === "1")
    .filter((script) => matchesPageSetting(script, path))
}

// Fetches the raw objects from Drupal's custom API.
export async function fetchAdvanceScripts() {
  if (!endpoint) {
    console.warn(
      "[advance-script-manager] Missing ADVANCE_SCRIPTS_SOURCE_URL environment variable."
    )
    return []
  }

  try {
    const response = await drupal.fetch(endpoint, {
      cache: "no-store",
      withAuth: true,
    })

    if (!response.ok) {
      console.warn(
        `[advance-script-manager] Failed to fetch scripts: ${response.status}`
      )
      return []
    }

    const payload = (await response.json()) as AdvanceScript[]
    return Array.isArray(payload) ? payload : []
  } catch (error) {
    console.error("[advance-script-manager] Error fetching scripts:", error)
    return []
  }
}

// Convenience helper for pages so components only call one function.
export async function getScriptsForPath(path: string) {
  const scripts = await fetchAdvanceScripts()
  return filterScriptsByPath(scripts, path).sort((a, b) => {
    const aWeight = Number(a.weight ?? 0)
    const bWeight = Number(b.weight ?? 0)
    return aWeight - bWeight
  })
}

