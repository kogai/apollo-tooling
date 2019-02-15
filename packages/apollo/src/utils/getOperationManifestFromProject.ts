import { GraphQLClientProject } from "apollo-language-server";
import {
  defaultEngineReportingSignature,
  hashForOperationSignature
} from "apollo-graphql";

export interface ManifestEntry {
  signature: string;
  document: string;
  metadata: {
    engineSignature: string;
  };
}

export function getOperationManifestFromProject(
  project: GraphQLClientProject
): ManifestEntry[] {
  const manifest = Object.values(
    project.mergedOperationsAndFragmentsForService
  ).map(operationAST => {
    const printed = defaultEngineReportingSignature(operationAST, "");

    return {
      signature: hashForOperationSignature(printed),
      document: printed,
      metadata: {
        engineSignature: printed
      }
    };
  });

  return manifest;
}
