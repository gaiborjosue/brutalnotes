import { $isCodeNode, CodeNode } from "@lexical/code"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getSelection, $isNodeSelection, $isRangeSelection } from "lexical"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function CodeLanguageToolbarPlugin() {
  const [editor] = useLexicalComposerContext()

  const onCodeLanguageSelect = (language: string) => {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection) || $isNodeSelection(selection)) {
        const nodes = selection.getNodes()
        const codeNode = nodes.find((node) => $isCodeNode(node)) as CodeNode
        if (codeNode) {
          codeNode.setLanguage(language)
        }
      }
    })
  }

  return (
    <Select onValueChange={onCodeLanguageSelect}>
      <SelectTrigger className="w-32 h-8">
        <SelectValue placeholder="Language" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="plain">Plain Text</SelectItem>
        <SelectItem value="js">JavaScript</SelectItem>
        <SelectItem value="typescript">TypeScript</SelectItem>
        <SelectItem value="python">Python</SelectItem>
        <SelectItem value="css">CSS</SelectItem>
        <SelectItem value="html">HTML</SelectItem>
        <SelectItem value="markdown">Markdown</SelectItem>
        <SelectItem value="sql">SQL</SelectItem>
        <SelectItem value="rust">Rust</SelectItem>
        <SelectItem value="c">C</SelectItem>
        <SelectItem value="swift">Swift</SelectItem>
        <SelectItem value="xml">XML</SelectItem>
      </SelectContent>
    </Select>
  )
}
