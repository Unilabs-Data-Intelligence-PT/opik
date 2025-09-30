import React, { useCallback, useEffect, useRef, useState } from "react";

import { Button, ButtonProps } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useCodemirrorLineHighlight } from "@/hooks/useCodemirrorLineHighlight";
import { useCodemirrorTheme } from "@/hooks/useCodemirrorTheme";
import { jsonLanguage } from "@codemirror/lang-json";
import { pythonLanguage } from "@codemirror/lang-python";
import { yamlLanguage } from "@codemirror/lang-yaml";
import { EditorState, Extension, StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import CodeMirror, { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { Check, Download, Play, RefreshCw } from "lucide-react";
import TooltipWrapper from "../TooltipWrapper/TooltipWrapper";

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

type RunButtonProps = {
  onClick: () => void;
  tooltipText?: string;
  message?: string;
  successIconTimeout?: number;
  variant?: "default" | "outline" | "ghost";
  className?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
} & Pick<ButtonProps, "size"> &
  Pick<CodeRunnerProps, "actionType">;

type CodeRunnerProps = {
  data: string;
  language?: SUPPORTED_LANGUAGE;
  highlightedLines?: number[];
  onChange?: (value: string) => void;
  onClick: () => void;
  disabled?: boolean;
  actionType: "run" | "install" | "update";
};

const actionMap = {
  run: {
    message: "Running code",
    tooltipText: "Run code",
    icon: <Play />,
  },
  install: {
    message: "Installing package",
    tooltipText: "Install package",
    icon: <Download />,
  },
  update: {
    message: "Updating package",
    tooltipText: "Update package",
    icon: <RefreshCw />,
  },
};

const RunButton: React.FunctionComponent<RunButtonProps> = ({
  onClick,
  message = "Running code",
  tooltipText = "Run code",
  successIconTimeout = 3000,
  variant = "default",
  className,
  size = "icon-sm",
  disabled = false,
  icon = <Play />,
  actionType = "run",
}) => {
  const { toast } = useToast();
  const [showSuccessIcon, setShowSuccessIcon] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (actionType == "run" && showSuccessIcon) {
      timer = setTimeout(() => setShowSuccessIcon(false), successIconTimeout);
    }
    return () => {
      clearTimeout(timer);
    };
  }, [showSuccessIcon, successIconTimeout]);

  const runClickHandler = useCallback(() => {
    toast({
      description: message,
    });
    onClick();
    setShowSuccessIcon(true);
  }, [onClick, toast]);

  if (showSuccessIcon) {
    return (
      <div className="flex size-8 items-center justify-center">
        <Check className="size-4" />
      </div>
    );
  }

  return (
    <TooltipWrapper content={tooltipText}>
      <Button
        disabled={disabled}
        size={size}
        variant={variant}
        className={className}
        onClick={runClickHandler}
      >
        {icon}
      </Button>
    </TooltipWrapper>
  );
};

const CodeRunner: React.FunctionComponent<CodeRunnerProps> = ({
  data,
  language = SUPPORTED_LANGUAGE.python,
  highlightedLines,
  onChange,
  onClick,
  disabled = false,
  actionType = "run",
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
  }, [highlightedLines?.join(",")]);
  return (
    <div className="relative overflow-hidden rounded-md bg-primary-foreground">
      <div className="absolute -bottom-0.5 right-0 z-10">
        <RunButton
          message={actionMap[actionType].message}
          tooltipText={actionMap[actionType].tooltipText}
          disabled={disabled}
          onClick={onClick}
          icon={actionMap[actionType].icon}
          actionType={actionType}
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

export default CodeRunner;
