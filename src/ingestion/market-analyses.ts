// Exécution d'une analyse de marché demandée (job `study:analyze-market`) : passe l'analyse en cours,
// la calcule sur les parcelles et le rayon de l'étude, l'enregistre si elle vaut toujours pour eux.
import { Injectable } from '@nestjs/common';

import { type AnalysisStep, MarketResult } from '../contracts/index.ts';
import { marketKey } from '../domain/index.ts';
import { Clock } from '../shared/clock.ts';
import { AnalysesRepository } from '../studies/analyses.repository.ts';
import type { StudyJob } from '../studies/studies.jobs.ts';
import { StudiesRepository } from '../studies/studies.repository.ts';
import { MarketAnalyzer } from './market-analyzer.ts';

export type MarketRunResult = 'done' | 'stale';

@Injectable()
export class MarketAnalyses {
  constructor(
    private readonly analyzer: MarketAnalyzer,
    private readonly analyses: AnalysesRepository,
    private readonly studies: StudiesRepository,
    private readonly clock: Clock,
  ) {}

  /** `job.parcelsKey` : l'empreinte du marché (parcelles et rayon). `final` : dernière tentative, un échec est enregistré. */
  async run(job: StudyJob, final = true, onProgress?: (steps: AnalysisStep[]) => void): Promise<MarketRunResult> {
    const study = await this.studies.get(job.studyId);
    if (!study || marketKey(study.parcelsKey, study.marketRadiusM) !== job.parcelsKey) return 'stale';
    if (!(await this.analyses.markRunning(job.studyId, 'market', job.parcelsKey, this.clock.now()))) return 'stale';
    try {
      const persist = async (steps: AnalysisStep[]) => {
        onProgress?.(steps);
        await this.analyses.saveProgress(job.studyId, 'market', job.parcelsKey, steps);
      };
      const parcels = await this.studies.parcels(job.studyId);
      const result = MarketResult.parse(await this.analyzer.analyze(parcels, study.marketRadiusM as MarketResult['radiusM'], persist));
      return (await this.analyses.markReady(job.studyId, 'market', job.parcelsKey, result, this.clock.now())) ? 'done' : 'stale';
    } catch (error) {
      if (final) await this.analyses.markFailed(job.studyId, 'market', job.parcelsKey, 'L’analyse de marché a échoué. Relancez-la dans un instant.');
      throw error;
    }
  }
}
