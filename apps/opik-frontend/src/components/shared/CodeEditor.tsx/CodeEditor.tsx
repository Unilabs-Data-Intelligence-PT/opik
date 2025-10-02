import React, { useEffect, useRef } from "react";

import CopyButton from "@/components/shared/CopyButton/CopyButton";
import { useCodemirrorLineHighlight } from "@/hooks/useCodemirrorLineHighlight";
import { useCodemirrorTheme } from "@/hooks/useCodemirrorTheme";
import { jsonLanguage } from "@codemirror/lang-json";
import { pythonLanguage } from "@codemirror/lang-python";
import { yamlLanguage } from "@codemirror/lang-yaml";
import { EditorState, Extension, StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import CodeMirror, { ReactCodeMirrorRef } from "@uiw/react-codemirror";

export enum SUPPORTED_LANGUAGE {
  json = "json",
  yaml = "yaml",
  python = "python",
}

const PLUGINS_MAP: Record<SUPPORTED_LANGUAGE, Extension> = {
  [SUPPORTED_LANGUAGE.json]: jsonLanguage,
  [SUPPORTED_LANGUAGE.yaml]: yamlLanguage,
  [SUPPORTED_LANGUAGE.python]: pythonLanguage,
};

type CodeEditorProps = {
  data: string;
  copyData?: string;
  language?: SUPPORTED_LANGUAGE;
  highlightedLines?: number[];
  onChange?: (value: string) => void;
};

const CodeEditor: React.FunctionComponent<CodeEditorProps> = ({
  data,
  copyData,
  language = SUPPORTED_LANGUAGE.python,
  highlightedLines,
  onChange,
}) => {
  const theme = useCodemirrorTheme();
  const editorRef = useRef<ReactCodeMirrorRef | null>(null);

  const LineHighlightExtension = useCodemirrorLineHighlight({
    lines: highlightedLines,
  });
  const setHighlightedLines = StateEffect.define({
    map: (lines: number[], mapping) =>
      lines.map((line) => mapping.mapPos(line)).filter((pos) => pos !== null),
  });
  useEffect(() => {
    editorRef.current?.view?.dispatch({
      effects: setHighlightedLines.of(highlightedLines || []),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedLines?.join(",")]);

  return (
    <div className="relative overflow-hidden rounded-md bg-primary-foreground">
      <div className="absolute right-2 top-0.5 z-10">
        <CopyButton
          message="Successfully copied code"
          text={copyData || data}
          tooltipText="Copy code"
        />
      </div>
      <CodeMirror
        onChange={onChange}
        theme={theme}
        ref={editorRef}
        value={data}
        extensions={[
          PLUGINS_MAP[language],
          EditorView.lineWrapping,
          EditorState.readOnly.of(false),
          EditorView.editable.of(true),
          LineHighlightExtension,
        ]}
      />
    </div>
  );
};

export default CodeEditor;
