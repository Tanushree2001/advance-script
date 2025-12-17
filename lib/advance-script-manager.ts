import { drupal } from "./drupal"
/**
 * Helper utilities for Drupal's Advance Script Manager integration.
 * Current scope: "pages" visibility rules, "content type" filtering, plus placement handling.
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
  content_type?: string // comma-separated list: content type names or "0" for each position
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

/**
 * Checks if a script should be shown for the given content type (bundle).
 *
 * The content_type field format: "blog,0,0,0,0,0,0,0,0,0"
 * - Each position can be a content type name (e.g., "blog") or "0"
 * - "0" means that content type is NOT selected
 * - If ALL values are "0", the script applies to ALL content types
 * - If ANY value is a content type name, script only applies to those specific types
 */
function matchesContentType(script: AdvanceScript, bundle?: string) {
  const raw = script.content_type

  // No content_type configured => script applies to all content types
  if (!raw?.trim()) {
    return true
  }

  // Parse the comma-separated list
  const contentTypes = raw.split(",").map((entry) => entry.trim().toLowerCase())

  // Filter out "0" values to get only the selected content types
  const selectedTypes = contentTypes.filter((entry) => entry && entry !== "0")

  // If no specific content types are selected (all are "0"), show on all pages
  if (!selectedTypes.length) {
    return true
  }

  // If bundle is not provided (e.g., homepage or non-node page),
  // don't show scripts that are restricted to specific content types
  if (!bundle) {
    return false
  }

  // Check if the current page's bundle matches any of the selected content types
  const normalizedBundle = bundle.toLowerCase()
  return selectedTypes.includes(normalizedBundle)
}

/**
 * Filters scripts by both path and content type.
 * @param scripts - Array of scripts from the API
 * @param path - Current page path (e.g., "/about", "/blog/my-post")
 * @param bundle - Optional content type/bundle (e.g., "blog", "article", "page")
 */
export function filterScriptsByPath(
  scripts: AdvanceScript[],
  path: string,
  bundle?: string
) {
  return scripts
    .filter((script) => script.status === "1")
    .filter((script) => matchesPageSetting(script, path))
    .filter((script) => matchesContentType(script, bundle))
}

// Fetches the raw objects from Drupal's custom API.
export async function fetchAdvanceScripts() {
  if (!endpoint) {
    console.warn("Missing source URL for advance scripts")
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

/**
 * Convenience helper that fetches scripts and filters by path and content type.
 * @param path - Current page path (e.g., "/", "/about", "/blog/my-post")
 * @param bundle - Optional content type/bundle (e.g., "blog", "article", "page")
 */
export async function getScriptsForPath(path: string, bundle?: string) {
  const scripts = await fetchAdvanceScripts()
  return filterScriptsByPath(scripts, path, bundle).sort((a, b) => {
    const aWeight = Number(a.weight ?? 0)
    const bWeight = Number(b.weight ?? 0)
    return aWeight - bWeight
  })
}

/**
 * Gets the content type/bundle for a given path from Drupal.
 * Returns undefined for homepage or non-node pages.
 */
export async function getBundleForPath(
  path: string
): Promise<string | undefined> {
  // Homepage doesn't have a bundle
  if (path === "/" || path === "") {
    return undefined
  }

  try {
    const translatedPath = await drupal.translatePath(path)
    console.log("translatedPath", translatedPath)

    if (!translatedPath?.jsonapi?.resourceName) {
      return undefined
    }

    // Convert "node--blog" to "blog"
    const resourceName = translatedPath.jsonapi.resourceName
    if (resourceName.startsWith("node--")) {
      return resourceName.replace("node--", "")
    }

    return undefined
  } catch (error) {
    return undefined
  }
}
