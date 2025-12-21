import type {
  AdvanceScript,
  ScriptPlacement,
} from "@/lib/advance-script-manager"
import { normalizeSection } from "@/lib/advance-script-manager"

type AdvanceScriptSectionProps = {
  scripts: AdvanceScript[]
  section: ScriptPlacement
}

type NodeType = "script" | "style" | "noscript"

type RenderNode = {
  type: NodeType
  attrs: Record<string, string | boolean>
  innerHTML: string
}

// Simple regex helpers to extract tags and attribute key/value pairs.
const TAG_REGEX = /<(script|style|noscript)([^>]*)>([\s\S]*?)<\/\1>/gi
const ATTR_REGEX = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/gi

// Converts raw attribute text (`async src="..."`) to a props object.
function parseAttributes(raw: string) {
  const attrs: Record<string, string | boolean> = {}

  ATTR_REGEX.lastIndex = 0
  raw.replace(
    ATTR_REGEX,
    (_, name: string, v1?: string, v2?: string, v3?: string) => {
      const value = v1 ?? v2 ?? v3
      attrs[name] = value ?? true
      return ""
    }
  )

  return attrs
}

// Normalize line endings to prevent hydration mismatch between server and client
function normalizeLineEndings(str: string): string {
  return str.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}

// Breaks a blob of HTML into discrete nodes we can render in React.
function extractNodes(code: string, fallbackType: NodeType): RenderNode[] {
  if (!code?.trim()) {
    return []
  }

  // Normalize line endings to prevent hydration mismatch
  const normalizedCode = normalizeLineEndings(code)

  TAG_REGEX.lastIndex = 0
  const nodes: RenderNode[] = []
  let match: RegExpExecArray | null

  while ((match = TAG_REGEX.exec(normalizedCode))) {
    const [, tag, rawAttrs, innerHTML] = match
    nodes.push({
      type: tag as NodeType,
      attrs: parseAttributes(rawAttrs ?? ""),
      innerHTML: normalizeLineEndings(innerHTML ?? ""),
    })
  }

  // Only use fallback if no tags were found
  if (!nodes.length) {
    // If fallback type is "script", check if content looks like HTML (not JavaScript)
    // HTML content in a script tag would cause "Unexpected token '<'" error
    if (fallbackType === "script") {
      const trimmedCode = normalizedCode.trim()
      // Skip if content looks like HTML (starts with < or contains HTML tags)
      if (trimmedCode.startsWith("<") || /<[a-z][\s\S]*>/i.test(trimmedCode)) {
        return nodes // Return empty, don't render HTML as JavaScript
      }
    }

    nodes.push({
      type: fallbackType,
      attrs: {},
      innerHTML: normalizedCode,
    })
  }

  return nodes
}

// Renders scripts or styles for a specific placement (head/body/footer).
export function AdvanceScriptSection({
  scripts,
  section,
}: AdvanceScriptSectionProps) {
  const matchingScripts = scripts.filter(
    (script) => normalizeSection(script.visibility_section) === section
  )

  if (!matchingScripts.length) {
    return null
  }

  return matchingScripts.map((script) => {
    const nodes: RenderNode[] = [
      ...extractNodes(script.script_code, "script"),
      ...extractNodes(script.css_code, "style"),
    ]

    return nodes.map((node, index) => {
      if (node.type === "style") {
        return (
          <style
            key={`${script.id}-style-${index}`}
            {...node.attrs}
            dangerouslySetInnerHTML={{ __html: node.innerHTML }}
          />
        )
      }

      if (node.type === "noscript") {
        return (
          <noscript
            key={`${script.id}-noscript-${index}`}
            {...node.attrs}
            dangerouslySetInnerHTML={{ __html: node.innerHTML }}
          />
        )
      }

      return (
        <script
          key={`${script.id}-script-${index}`}
          {...node.attrs}
          dangerouslySetInnerHTML={{ __html: node.innerHTML }}
        />
      )
    })
  })
}
