import CodeEditor from "@/components/shared/CodeEditor.tsx/CodeEditor";
import CodeHighlighter from "@/components/shared/CodeHighlighter/CodeHighlighter";
import { putConfigInCode } from "@/lib/formatCodeSnippets";
import useAppStore, { useUserApiKey } from "@/store/AppStore";

export type ConfiguredCodeHighlighterProps = {
  code: string;
  projectName?: string;
  useEditor?: (value: string) => void;
  highlightedLines?: number[];
};
const ConfiguredCodeHighlighter: React.FC<ConfiguredCodeHighlighterProps> = ({
  code,
  projectName,
  useEditor,
  highlightedLines,
}) => {
  const apiKey = useUserApiKey();
  const workspaceName = useAppStore((state) => state.activeWorkspaceName);

  const { code: codeWithConfig } = putConfigInCode({
    code,
    workspaceName,
    apiKey,
    shouldMaskApiKey: true,
    projectName,
  });
  const { code: codeWithConfigToCopy } = putConfigInCode({
    code,
    workspaceName,
    apiKey,
    projectName,
  });
  return useEditor ? (
    <CodeEditor
      data={codeWithConfig}
      copyData={codeWithConfigToCopy}
      onChange={useEditor}
      highlightedLines={highlightedLines}
    />
  ) : (
    <CodeHighlighter
      data={codeWithConfig}
      copyData={codeWithConfigToCopy}
      highlightedLines={highlightedLines}
    />
  );
};

export default ConfiguredCodeHighlighter;
