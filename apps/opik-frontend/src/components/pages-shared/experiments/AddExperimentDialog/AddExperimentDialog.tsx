import useDatasetsList from "@/api/datasets/useDatasetsList";
import useProjectsList from "@/api/projects/useProjectsList";
import {
  getPackage,
  getPackages,
  installPackage,
  PackagesInfoResponse,
  queueTestRun,
} from "@/api/test-runner/testRunner";
import ConfiguredCodeHighlighter from "@/components/pages-shared/onboarding/ConfiguredCodeHighlighter/ConfiguredCodeHighlighter";
import CodeRunner from "@/components/shared/CodeRunner.tsx/CodeRunner";
import CopyButton from "@/components/shared/CopyButton/CopyButton";
import LoadableSelectBox from "@/components/shared/LoadableSelectBox/LoadableSelectBox";
import SideDialog from "@/components/shared/SideDialog/SideDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { buildDocsUrl, cn } from "@/lib/utils";
import useAppStore from "@/store/AppStore";
import { DropdownOption } from "@/types/shared";
import { keepPreviousData } from "@tanstack/react-query";
import { AlertTriangle, Play, SquareArrowOutUpRight } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

const EVALUATION_TASK_REPLACE = "!{EVALUATION_TASK}";
const EVALUATION_TASK_NAME_REPLACE = "!{EVALUATION_TASK_NAME}";

export enum EVALUATOR_MODEL {
  equals = "equals",
  contains = "contains",
  regex_match = "regex_match",
  isJSON = "isJson",
  levenshtein = "levenshtein",
  hallucination = "hallucination",
  moderation = "moderation",
  answer_relevance = "answer_relevance",
  context_recall = "context_recall",
  context_precision = "context_precision",
}

export interface ModelData {
  class: string;
  initParameters?: string;
  scoreParameters?: string[];
}

const EVALUATOR_MODEL_MAP: Record<EVALUATOR_MODEL, ModelData> = {
  [EVALUATOR_MODEL.equals]: {
    class: "Equals",
    scoreParameters: ["output", "reference"],
  },
  [EVALUATOR_MODEL.regex_match]: {
    class: "RegexMatch",
    // eslint-disable-next-line no-useless-escape
    initParameters: `regex="\d{3}-\d{2}-\d{4}"`,
    scoreParameters: ["output"],
  },
  [EVALUATOR_MODEL.contains]: {
    class: "Contains",
    scoreParameters: ["output", "reference"],
  },
  [EVALUATOR_MODEL.isJSON]: {
    class: "IsJson",
    scoreParameters: ["output"],
  },
  [EVALUATOR_MODEL.levenshtein]: {
    class: "LevenshteinRatio",
    scoreParameters: ["output", "reference"],
  },
  [EVALUATOR_MODEL.moderation]: {
    class: "Moderation",
    scoreParameters: ["input", "output", "context"],
  },
  [EVALUATOR_MODEL.answer_relevance]: {
    class: "AnswerRelevance",
    scoreParameters: ["input", "output", "context"],
  },
  [EVALUATOR_MODEL.hallucination]: {
    class: "Hallucination",
    scoreParameters: ["input", "output", "context"],
  },
  [EVALUATOR_MODEL.context_recall]: {
    class: "ContextRecall",
    scoreParameters: ["input", "output", "context"],
  },
  [EVALUATOR_MODEL.context_precision]: {
    class: "ContextPrecision",
    scoreParameters: ["input", "output", "context"],
  },
};

const HEURISTICS_MODELS_OPTIONS: DropdownOption<EVALUATOR_MODEL>[] = [
  {
    value: EVALUATOR_MODEL.equals,
    label: "Equals",
    description: "Checks for exact text match.",
  },
  {
    value: EVALUATOR_MODEL.regex_match,
    label: "Regex match",
    description: "Verifies pattern conformity using regex.",
  },
  {
    value: EVALUATOR_MODEL.contains,
    label: "Contains",
    description: "Identifies presence of a substring.",
  },
  {
    value: EVALUATOR_MODEL.isJSON,
    label: "isJson",
    description: "Validates JSON format compliance.",
  },
  {
    value: EVALUATOR_MODEL.levenshtein,
    label: "Levenshtein",
    description: "Calculates text similarity via edit distance.",
  },
];

const LLM_JUDGES_MODELS_OPTIONS: DropdownOption<EVALUATOR_MODEL>[] = [
  {
    value: EVALUATOR_MODEL.hallucination,
    label: "Hallucination",
    description: "Detects generated false information.",
  },
  {
    value: EVALUATOR_MODEL.moderation,
    label: "Moderation",
    description: "Checks adherence to content standards.",
  },
  {
    value: EVALUATOR_MODEL.answer_relevance,
    label: "Answer relevance",
    description: "Evaluates how well the answer fits the question.",
  },
  {
    value: EVALUATOR_MODEL.context_recall,
    label: "Context recall",
    description: "Measures retrieval of relevant context.",
  },
  {
    value: EVALUATOR_MODEL.context_precision,
    label: "Context precision",
    description: "Checks accuracy of provided context details.",
  },
];

const DEFAULT_LOADED_DATASET_ITEMS = 25;
const DEFAULT_LOADED_PROJECT_ITEMS = 25;

type AddExperimentDialogProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  datasetName?: string;
  projectName?: string;
};

const AddExperimentDialog: React.FunctionComponent<
  AddExperimentDialogProps
> = ({
  open,
  setOpen,
  datasetName: initialDatasetName = "",
  projectName: initialProjectName = "",
}) => {
  const workspaceName = useAppStore((state) => state.activeWorkspaceName);

  const [isLoadedMoreProjects, setIsLoadedMoreProjects] = useState(false);
  const [isLoadedMoreDatasets, setIsLoadedMoreDatasets] = useState(false);
  const [datasetName, setDatasetName] = useState(initialDatasetName);
  const [projectName, setProjectName] = useState(initialProjectName);
  const [models, setModels] = useState<EVALUATOR_MODEL[]>([
    HEURISTICS_MODELS_OPTIONS[0].value,
  ]); // Set the first heuristic model as checked

  const [experimentName, setExperimentName] = useState("");
  const useExperimentName =
    experimentName ||
    (projectName && datasetName ? projectName + " | " + datasetName : "");

  const importString =
    models.length > 0
      ? `from opik.evaluation.metrics import (${models
          .map((m) => EVALUATOR_MODEL_MAP[m].class)
          .join(", ")})
  `
      : ``;

  const metricsString =
    models.length > 0
      ? `\nmetrics = [${models
          .map(
            (m) =>
              EVALUATOR_MODEL_MAP[m].class +
              "(" +
              (EVALUATOR_MODEL_MAP[m].initParameters || "") +
              ")",
          )
          .join(", ")}]\n`
      : "";

  const metricsParam =
    models.length > 0
      ? `,
  scoring_metrics=metrics`
      : "";

  const section3 =
    "" +
    `import os
from opik import Opik
from opik.evaluation import evaluate
import llm_kit #monkey patching opik

# os.environ["OPENAI_API_KEY"] = "OpenAI API key goes here"

# INJECT_OPIK_CONFIGURATION
${importString}

client = Opik(project_name="${projectName || "project name placeholder"}")
dataset = client.get_dataset(name="${
      datasetName || "dataset name placeholder"
    }")

${EVALUATION_TASK_REPLACE}

${metricsString}
eval_results = evaluate(
  project_name="${projectName || "project name placeholder"}",
  experiment_name="${useExperimentName || "experiment name placeholder"}",
  dataset=dataset,
  task=${EVALUATION_TASK_NAME_REPLACE}${metricsParam}
)`;

  const { data: projectData, isLoading: projectIsLoading } = useProjectsList(
    {
      workspaceName,
      page: 1,
      size: isLoadedMoreProjects ? 10000 : DEFAULT_LOADED_PROJECT_ITEMS,
    },
    {
      placeholderData: keepPreviousData,
    },
  );

  const { data: datasetData, isLoading: datasetIsLoading } = useDatasetsList(
    {
      workspaceName,
      page: 1,
      size: isLoadedMoreDatasets ? 10000 : DEFAULT_LOADED_DATASET_ITEMS,
    },
    {
      placeholderData: keepPreviousData,
    },
  );

  const totalDatasets = datasetData?.total ?? 0;
  const totalProjects = projectData?.total ?? 0;

  const loadMoreProjectsHandler = useCallback(
    () => setIsLoadedMoreProjects(true),
    [],
  );
  const loadMoreDatasetsHandler = useCallback(
    () => setIsLoadedMoreDatasets(true),
    [],
  );

  const datasetOptions: DropdownOption<string>[] = useMemo(() => {
    return (datasetData?.content || []).map((dataset) => ({
      value: dataset.name,
      label: dataset.name,
    }));
  }, [datasetData?.content]);

  const projectOptions: DropdownOption<string>[] = useMemo(() => {
    return (projectData?.content || []).map((project) => ({
      value: project.name,
      label: project.name,
    }));
  }, [projectData?.content]);

  const openChangeHandler = useCallback(
    (open: boolean) => {
      setOpen(open);
      if (!open) {
        setDatasetName("");
        setProjectName("");
      }
    },
    [setOpen],
  );

  const checkboxChangeHandler = (id: EVALUATOR_MODEL) => {
    setModels((state) => {
      const localModels = state.slice();
      const index = localModels.indexOf(id);

      if (index !== -1) {
        localModels.splice(index, 1);
      } else {
        localModels.push(id);
      }

      return localModels;
    });
  };

  const generateList = (
    title: string,
    list: DropdownOption<EVALUATOR_MODEL>[],
  ) => {
    return (
      <div>
        <div className="comet-body-s-accented pb-1 pt-2 text-muted-slate">
          {title}
        </div>
        {list.map((m) => {
          return (
            <label key={m.value} className="flex cursor-pointer py-2.5">
              <Checkbox
                checked={models.includes(m.value)}
                onCheckedChange={() => checkboxChangeHandler(m.value)}
                aria-label="Select row"
                className="mt-0.5"
              />
              <div className="px-2">
                <div className="comet-body-s-accented truncate">{m.label}</div>
                <div className="comet-body-s mt-0.5 text-light-slate">
                  {m.description}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    );
  };

  const [fullCode, setFullCode] = useState(section3);
  const [section3Code, setSection3Code] = useState(section3);
  const [evalFunction, setEvalFunction] = useState(
    `def evaluation_task(dataset_item):\n  # your LLM application is called here\n\n  result = {"output": "placeholder string", "reference": "placeholder string"}\n\n  return result`,
  );
  const [installPackageText, setInstallPackageText] = useState("");
  const [selectedImport, setSelectedImport] = useState<null | string>(null);
  const [importsData, setImportsData] = useState<PackagesInfoResponse>({});
  const [loadingImportData, setLoadingImportData] = useState(false);
  const [queueingTest, setQueueingTest] = useState(false);
  const { toast } = useToast();
  const evalFuncName =
    evalFunction.match(/def (\w+)\(/)?.[1] || "PLEASE REVIEW YOUR CODE";

  useEffect(() => {
    setSection3Code(section3);
  }, [section3]);

  useEffect(() => {
    setFullCode(
      section3Code
        .replace(EVALUATION_TASK_NAME_REPLACE, evalFuncName)
        .replace(EVALUATION_TASK_REPLACE, evalFunction),
    );
  }, [section3Code, evalFunction]);

  const missingFields = [
    ...new Set(models.flatMap((m) => EVALUATOR_MODEL_MAP[m].scoreParameters)),
  ].filter((param) => param && !evalFunction.includes(`"${param}"`));
  const IGNORE_IMPORTS = [
    "os",
    "json",
    "re",
    "math",
    "sys",
    "time",
    "datetime",
  ];

  const imports = useMemo(
    () => [
      ...new Set(
        fullCode
          .split("\n")
          .map((line) => {
            const match = line.trim().match(/^(from|import) (\w+)\.?/);
            return match ? match[2] : "";
          })
          .filter((pkg) => pkg && !IGNORE_IMPORTS.includes(pkg)),
      ),
    ],
    [fullCode],
  );

  const importsRef = React.useRef(imports);
  importsRef.current = imports;

  useEffect(() => {
    setLoadingImportData(true);
    setTimeout(async () => {
      if (JSON.stringify(imports) == JSON.stringify(importsRef.current)) {
        const data = await getPackages(imports);
        setImportsData(data || {});
        setLoadingImportData(false);
      }
    }, 500);

    if (selectedImport && !importsRef.current.includes(selectedImport)) {
      setSelectedImport(null);
    }
  }, [importsRef.current.join(",")]);

  const linkClasses = cn(
    "comet-body-s flex h-9 w-full items-center gap-2 text-foreground rounded-md hover:bg-primary-foreground data-[status=active]:bg-primary-100 data-[status=active]:text-primary",
    "pl-[10px] pr-3",
  );
  const triggerUpdate = (evalCode: boolean, fullCode: boolean) => {
    if (fullCode) {
      setSection3Code(
        section3Code.endsWith(" ") ? section3Code.trim() : section3Code + " ",
      );
    }
    if (evalCode) {
      setEvalFunction(
        evalFunction.endsWith(" ") ? evalFunction.trim() : evalFunction + " ",
      );
    }
  };

  return (
    <SideDialog open={open} setOpen={openChangeHandler}>
      <div className="pb-20">
        <div className="pb-8">
          <SheetTitle>Create a new experiment</SheetTitle>
          <div className="comet-body-s m-auto mt-4 w-[468px] self-center text-center text-muted-slate">
            Select a dataset, assign the relevant evaluators, and follow the
            instructions to track and compare your training runs
          </div>
        </div>
        <div className="m-auto flex w-full max-w-[1250px] items-start gap-6">
          <div className="flex w-[250px] shrink-0 flex-col gap-2">
            <div className="comet-title-s">Select evaluators</div>
            {generateList("Heuristics metrics", HEURISTICS_MODELS_OPTIONS)}
            {generateList("LLM Judges", LLM_JUDGES_MODELS_OPTIONS)}
            <div className="mt-4">
              <Button variant="secondary" asChild>
                <a
                  href={buildDocsUrl("/evaluation/metrics/custom_metric")}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center"
                >
                  Learn about custom metrics
                  <SquareArrowOutUpRight className="ml-1 size-4" />
                </a>
              </Button>
            </div>
          </div>
          <div className="flex w-full max-w-[700px] flex-col gap-2 rounded-md border border-border p-6">
            <div className="comet-body-s text-foreground-secondary">
              1. Select Project
            </div>
            <LoadableSelectBox
              options={projectOptions}
              value={projectName}
              placeholder="Select a project"
              onChange={setProjectName}
              onLoadMore={
                totalProjects > DEFAULT_LOADED_PROJECT_ITEMS &&
                !isLoadedMoreProjects
                  ? loadMoreProjectsHandler
                  : undefined
              }
              isLoading={projectIsLoading}
              optionsCount={DEFAULT_LOADED_PROJECT_ITEMS}
            />{" "}
            <div className="comet-body-s mt-4 text-foreground-secondary">
              2. Select dataset
            </div>
            <LoadableSelectBox
              options={datasetOptions}
              value={datasetName}
              placeholder="Select a dataset"
              onChange={setDatasetName}
              onLoadMore={
                totalDatasets > DEFAULT_LOADED_DATASET_ITEMS &&
                !isLoadedMoreDatasets
                  ? loadMoreDatasetsHandler
                  : undefined
              }
              isLoading={datasetIsLoading}
              optionsCount={DEFAULT_LOADED_DATASET_ITEMS}
            />{" "}
            <div className="comet-body-s mt-4 text-foreground-secondary">
              3. Name the experiment
            </div>
            <Input
              placeholder="Experiment name"
              value={useExperimentName}
              onChange={(e) => {
                setExperimentName(e.target.value);
              }}
            />
            <div className="comet-body-s mt-4 text-foreground-secondary">
              4. Define experiment function
              <br />
              <span className="comet-body-s mt-0.5 text-light-slate">
                You may also add other custom code here, it will not be replaced
                by auto-generated code
              </span>
            </div>
            <ConfiguredCodeHighlighter
              highlightedLines={
                selectedImport == null
                  ? []
                  : evalFunction
                      .split("\n")
                      .map((line, index) =>
                        line
                          .trim()
                          .match(new RegExp(`^(from|import) ${selectedImport}`))
                          ? index + 1
                          : null,
                      )
                      .filter((index) => index !== null)
              }
              code={evalFunction}
              useEditor={(value) => setEvalFunction(value)}
            />
            {missingFields.length > 0 && (
              <span
                className="comet-body-s mt-0.5 text-light-slate"
                style={{ display: "flex" }}
              >
                <AlertTriangle
                  color="#ffcc00"
                  size={16}
                  style={{ display: "inline-block" }}
                />
                <span style={{ display: "inline-block", marginLeft: "0.25em" }}>
                  Experiment result seems to be missing field
                  {missingFields.length > 0 ? "s: " : ": "}
                  {missingFields.slice(0, -1).map((param, index, arr) => (
                    <React.Fragment key={index}>
                      <b>{param}</b>
                      {index == arr.length - 1 ? "" : ","}{" "}
                    </React.Fragment>
                  ))}
                  {missingFields.length > 1 && "and "}
                  <b>{missingFields[missingFields.length - 1]}</b>
                </span>
              </span>
            )}
            <div className="comet-body-s mt-4 text-foreground-secondary">
              5. Validate and adjust the generated code
            </div>
            {
              <ConfiguredCodeHighlighter
                highlightedLines={
                  selectedImport == null
                    ? []
                    : fullCode
                        .split("\n")
                        .map((line, index) =>
                          line
                            .trim()
                            .match(
                              new RegExp(`^(from|import) ${selectedImport}`),
                            )
                            ? index + 1
                            : null,
                        )
                        .filter((index) => index !== null)
                }
                code={fullCode}
                useEditor={(value) => {
                  //prevent changes on evalFunction code
                  if (!value.includes(evalFunction)) {
                    triggerUpdate(false, true);
                    return;
                  }
                  const templateCode = value
                    .replace(evalFunction, EVALUATION_TASK_REPLACE)
                    .replace(
                      `task=${evalFuncName}`,
                      `task=${EVALUATION_TASK_NAME_REPLACE}`,
                    );
                  setSection3Code(templateCode);
                }}
              />
            }
            <Button
              disabled={
                !useExperimentName ||
                datasetName === "" ||
                projectName === "" ||
                queueingTest
              }
              onClick={() => {
                setQueueingTest(true);
                queueTestRun({
                  name: useExperimentName,
                  install_dependencies: [],
                  code: fullCode,
                })
                  .then((data) => {
                    toast({
                      title: `Experiment ${useExperimentName} queued`,
                      description: (
                        <div className="relative pr-2.5">
                          {`Id: ${data.id}`}{" "}
                          <TooltipProvider
                            delayDuration={500}
                            skipDelayDuration={0}
                          >
                            {" "}
                            <div className="absolute right-[-1.5em] top-[-0.5em]">
                              <CopyButton tooltipText="Copy" text={data.id} />
                            </div>
                          </TooltipProvider>
                        </div>
                      ),
                    });
                    setOpen(false);
                    setQueueingTest(false);
                  })
                  .catch((error) => {
                    toast({
                      title: "Error queuing experiment",
                      description: error.message,
                      variant: "destructive",
                    });
                    setQueueingTest(false);
                  });
              }}
              size="sm"
              className="h-7 gap-2 px-4"
            >
              Queue Experiment <Play size="20" />
            </Button>
          </div>
          <div className="flex w-[250px] shrink-0 flex-col gap-2">
            <div className="comet-title-s">Handle imports</div>
            <ul className="rounded-md border border-slate-200 p-2">
              {imports.map((imp) => (
                <li key={imp} className="flex">
                  <button
                    data-status={selectedImport === imp ? "active" : undefined}
                    onClick={async () => {
                      if (selectedImport === imp) {
                        setSelectedImport(null);
                        return;
                      }
                      setSelectedImport(imp);
                      setInstallPackageText(imp || "");
                      // triggerUpdate(true, false);
                    }}
                    className={cn(linkClasses, "text-left relative")}
                  >
                    {imp}{" "}
                    <span className="text-xs text-light-slate">
                      {importsData[imp]?.version ? (
                        importsData[imp]?.version
                      ) : loadingImportData ? (
                        <Spinner className="size-3" />
                      ) : (
                        <i>not installed</i>
                      )}
                    </span>
                    {!importsData[imp]?.version && !loadingImportData && (
                      <AlertTriangle
                        color="#c9370bff"
                        size={16}
                        className="absolute right-2"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
            {selectedImport != null && (
              <div className="relative rounded-md border border-slate-200 p-2">
                <CodeRunner
                  key={selectedImport}
                  actionType={
                    importsData[selectedImport] ? "update" : "install"
                  }
                  data={"pip install " + installPackageText}
                  disabled={installPackageText.trim() === ""}
                  onClick={async () => {
                    if (!installPackageText) {
                      return;
                    }

                    const currentSelectedPackage = selectedImport;
                    setImportsData((state) => ({
                      ...state,
                      [currentSelectedPackage]: null,
                    }));
                    setLoadingImportData(true);
                    await installPackage(installPackageText.trim());
                    const packageData = await getPackage(
                      currentSelectedPackage,
                    );
                    setImportsData((state) => ({
                      ...state,
                      [currentSelectedPackage]: packageData,
                    }));
                    setLoadingImportData(false);
                  }}
                  onChange={(value) => {
                    const splitted = value.split("pip install ");
                    if (splitted.length == 1 || !value.startsWith("pip")) {
                      setInstallPackageText(
                        installPackageText.endsWith(" ")
                          ? installPackageText.trim()
                          : installPackageText + " ",
                      );
                      return;
                    }
                    const splitParagraph = splitted[1].split("\n");
                    if (splitParagraph.length > 1) {
                      setInstallPackageText(
                        installPackageText.endsWith(" ")
                          ? splitParagraph[0].trim()
                          : splitParagraph[0] + " ",
                      );
                      return;
                    }
                    setInstallPackageText(splitParagraph[0]);
                  }}
                />
                <div
                  style={{
                    background: "rgba(248,250,252,0.5)",
                    position: "absolute",
                    top: "9px",
                    left: "40px",
                    width: "85px",
                    height: "25px",
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </SideDialog>
  );
};

export default AddExperimentDialog;
