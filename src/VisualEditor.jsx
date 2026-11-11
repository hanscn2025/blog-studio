import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Image from "@tiptap/extension-image";
import { resolveDraftImage } from "./markdown-media.js";

const PreviewImage = Image.extend({
  renderHTML({ HTMLAttributes }) {
    return ["img", { ...HTMLAttributes, src: resolveDraftImage(HTMLAttributes.src || "") }];
  },
});

export function VisualEditor({ value, onChange, onReady }) {
  const [safe, setSafe] = useState(true);
  const editor = useEditor({
    extensions: [StarterKit, PreviewImage, Markdown],
    content: value || "",
    contentType: "markdown",
    onUpdate: ({ editor }) => onChange(editor.getMarkdown()),
  });

  useEffect(() => { onReady(editor); return () => onReady(null); }, [editor, onReady]);
  useEffect(() => {
    if (editor && value !== editor.getMarkdown()) editor.commands.setContent(value || "", { contentType: "markdown", emitUpdate: false });
    if (editor) {
      const matches = (value || "").trim() === editor.getMarkdown().trim();
      if (editor.isEditable !== matches) editor.setEditable(matches);
      setSafe(matches);
    }
  }, [editor, value]);

  return <div>{!safe && <p role="alert">这篇文章含有可视化模式无法无损转换的 Markdown，请切换到 Markdown 模式编辑。</p>}<EditorContent editor={editor} className="visual-editor" aria-label="可视化正文编辑器" /></div>;
}
