// import { Fragment } from "react"

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

// Breaks a blob of HTML into discrete nodes we can render in React.
function extractNodes(code: string, fallbackType: NodeType): RenderNode[] {
  if (!code?.trim()) {
    return []
  }

  TAG_REGEX.lastIndex = 0
  const nodes: RenderNode[] = []
  let match: RegExpExecArray | null

  while ((match = TAG_REGEX.exec(code))) {
    const [, tag, rawAttrs, innerHTML] = match
    nodes.push({
      type: tag as NodeType,
      attrs: parseAttributes(rawAttrs ?? ""),
      innerHTML: innerHTML ?? "",
    })
  }

  if (!nodes.length) {
    nodes.push({
      type: fallbackType,
      attrs: {},
      innerHTML: code,
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
