import api, { TEST_RUNNER_PACKAGE, TEST_RUNNER_QUEUE } from "@/api/api";

type PythonScript = {
  name: string;
  install_dependencies: string[];
  code: string;
};

export type PackagesInfoResponse = {
  [key: string]: PackageInfoResponse | null;
};

export type PackageInfoResponse = {
  version: string;
};

export const getPackage = async (packageName: string) => {
  const data = await api
    .get(`${TEST_RUNNER_PACKAGE}/${packageName}`)
    .then((res) => res.data as PackageInfoResponse)
    .catch(() => null);
  return data;
};

export const getPackages = async (packages: string[]) => {
  const data = await api
    .post(`${TEST_RUNNER_PACKAGE}/get`, { packages })
    .then((res) => res.data as PackagesInfoResponse)
    .catch(() => null);
  return data;
};

export const installPackage = async (installString: string) => {
  const data = await api
    .post(`${TEST_RUNNER_PACKAGE}`, { installString })
    .then((res) => res.data);
  return data;
};

export const queueTestRun = async (script: PythonScript) => {
  const data = await api
    .post(`${TEST_RUNNER_QUEUE}`, { ...script })
    .then((res) => res.data);
  return data;
};
