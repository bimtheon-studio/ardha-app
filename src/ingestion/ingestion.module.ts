// Ce qui alimente les données de référence depuis les sources publiques, et ce que le worker en
// déduit pour les études (adresse, vignette) : pour le worker et la CLI.
import { Module } from '@nestjs/common';

import { GeoModule } from '../geo/geo.module.ts';
import { SourcesModule } from '../sources/sources.module.ts';
import { CadastreLoader } from './cadastre-loader.ts';
import { LookupHandlers } from './lookup-handlers.ts';
import { ReferenceSeed } from './reference-seed.ts';
import { StudiesModule } from '../studies/studies.module.ts';
import { StudyDerivations } from './study-derivations.ts';
import { RiskAnalyses } from './risk-analyses.ts';
import { RiskAnalyzer } from './risk-analyzer.ts';
import { HydrantCache } from './hydrant-cache.ts';
import { CommuneRiskCache } from './commune-risk-cache.ts';
import { MarketAnalyses } from './market-analyses.ts';
import { MarketAnalyzer } from './market-analyzer.ts';
import { MarketData } from './market-data.ts';

@Module({
  imports: [SourcesModule, GeoModule, StudiesModule],
  providers: [CadastreLoader, LookupHandlers, ReferenceSeed, StudyDerivations, RiskAnalyzer, RiskAnalyses, HydrantCache, CommuneRiskCache, MarketData, MarketAnalyzer, MarketAnalyses],
  exports: [CadastreLoader, LookupHandlers, ReferenceSeed, StudyDerivations, RiskAnalyzer, RiskAnalyses, HydrantCache, CommuneRiskCache, MarketData, MarketAnalyzer, MarketAnalyses, SourcesModule],
})
export class IngestionModule {}
