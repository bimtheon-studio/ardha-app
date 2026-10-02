// Exécution d'une analyse des risques demandée (job `study:analyze-risks`) : passe l'analyse en cours,
// la calcule sur les parcelles de l'étude, l'enregistre si elle vaut toujours pour les mêmes parcelles.
import { Injectable } from '@nestjs/common';

import { type AnalysisStep, type RisksPartial, RisksResult } from '../contracts/index.ts';
import { Clock } from '../shared/clock.ts';
import { AnalysesRepository } from '../studies/analyses.repository.ts';
import type { StudyJob } from '../studies/studies.jobs.ts';
import { StudiesRepository } from '../studies/studies.repository.ts';
import { RiskAnalyzer } from './risk-analyzer.ts';

export type RiskRunResult = 'done' | 'stale';

@Injectable()
export class RiskAnalyses {
  constructor(
    private readonly analyzer: RiskAnalyzer,
    private readonly analyses: AnalysesRepository,
    private readonly studies: StudiesRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * `final` : dernière tentative ; un échec est alors enregistré. `onProgress` : le déroulé, à chaque
   * étape, en plus de son enregistrement (CLI `--inline`).
   */
  async run(job: StudyJob, final = true, onProgress?: (steps: AnalysisStep[]) => void): Promise<RiskRunResult> {
    const study = await this.studies.get(job.studyId);
    if (!study || study.parcelsKey !== job.parcelsKey) return 'stale';
    if (!(await this.analyses.markRunning(job.studyId, 'risks', job.parcelsKey, this.clock.now()))) return 'stale';
    try {
      const persist = async (steps: AnalysisStep[], partial: RisksPartial) => {
        onProgress?.(steps);
        await this.analyses.saveProgress(job.studyId, 'risks', job.parcelsKey, steps, partial);
      };
      const result = RisksResult.parse(await this.analyzer.analyze(await this.studies.parcels(job.studyId), persist));
      return (await this.analyses.markReady(job.studyId, 'risks', job.parcelsKey, result, this.clock.now())) ? 'done' : 'stale';
    } catch (error) {
      if (final) await this.analyses.markFailed(job.studyId, 'risks', job.parcelsKey, 'L’analyse des risques a échoué. Relancez-la dans un instant.');
      throw error;
    }
  }
}
