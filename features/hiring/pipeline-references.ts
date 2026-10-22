import type { WorkflowGraph } from "@/features/workflows/workflow";
import type { HiringStage, PipelineDefinition } from "./hiring";

export type PipelineReferences = { pipelineReferences?: Record<string, string> };

export function resolvePipelineReference(config: PipelineReferences, id: string) {
  return config.pipelineReferences?.[id] ?? id;
}

// Resolve old IDs in a copy. Published workflow snapshots and event history
// remain unchanged; their references point to the pipeline's current definition.
export function resolvePipelineGraph(graph: WorkflowGraph, config: PipelineReferences): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => node.config.pipelineVersionId ? {
      ...node,
      config: { ...node.config, pipelineVersionId: resolvePipelineReference(config, node.config.pipelineVersionId) },
    } : node),
  };
}

export function retainReferencedStages(
  definition: PipelineDefinition,
  previous: PipelineDefinition[],
  references: Set<string>,
): PipelineDefinition {
  const stages: HiringStage[] = [...definition.stages];
  const ids = new Set(stages.map((s) => s.id));
  const names = new Set(stages.map((s) => s.name.toLowerCase()));
  for (const previousDefinition of previous) {
    for (const stage of previousDefinition.stages) {
      if (ids.has(stage.id) || !references.has(stage.id)) continue;
      let name = stage.name, suffix = 1;
      while (names.has(name.toLowerCase())) name = `${stage.name.slice(0, 60)} (retained ${suffix++})`;
      stages.push({ ...stage, name });
      ids.add(stage.id);
      names.add(name.toLowerCase());
    }
  }
  return { ...definition, stages };
}
