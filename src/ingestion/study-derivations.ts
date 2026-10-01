// Ce que le worker calcule pour une étude (F-02) : l'adresse (géocodage inverse des points sondés,
// Q3) et la vignette (tuiles OSM, Q6, Q12). Chaque calcul vaut pour une empreinte de parcelles : il
// ne fait rien si l'étude a changé depuis, et n'écrit que si elle n'a pas changé entre-temps.
import { Inject, Injectable } from '@nestjs/common';

import type { Address } from '../contracts/index.ts';
import { chooseAddress, probePoints, proposeStudyName, rankAddresses } from '../domain/index.ts';
import { Clock } from '../shared/clock.ts';
import { FileStore } from '../shared/files.ts';
import { Geocoding } from '../sources/geocoding.ts';
import { Tiles } from '../sources/tiles.ts';
import type { StudyJob } from '../studies/studies.jobs.ts';
import { StudiesRepository } from '../studies/studies.repository.ts';
import { thumbnailFile } from '../studies/studies.service.ts';
import { renderThumbnail } from './thumbnail.ts';

/** Adresses gardées dans l'étude, la principale en tête. */
const ADDRESSES_KEPT = 10;

/** `stale` : les parcelles ont changé, un autre job s'en charge ; `fresh` : déjà à jour. */
export type DerivationResult = 'done' | 'stale' | 'fresh';

@Injectable()
export class StudyDerivations {
  constructor(
    private readonly studies: StudiesRepository,
    private readonly geocoding: Geocoding,
    private readonly tiles: Tiles,
    private readonly clock: Clock,
    @Inject(FileStore) private readonly files: FileStore,
  ) {}

  private async current(job: StudyJob, done: (row: { addressKey: string | null; thumbnailKey: string | null }) => string | null) {
    const row = await this.studies.get(job.studyId);
    if (!row || row.deletedAt || row.parcelsKey !== job.parcelsKey) return 'stale' as const;
    if (!job.force && done(row) === job.parcelsKey) return 'fresh' as const;
    return row;
  }

  async resolveAddress(job: StudyJob): Promise<DerivationResult> {
    const row = await this.current(job, (r) => r.addressKey);
    if (typeof row === 'string') return row;
    const parcels = await this.studies.parcels(job.studyId);
    const geometries = parcels.map((p) => p.geometry);
    const candidates: Address[] = [];
    for (const [lon = 0, lat = 0] of probePoints(geometries)) candidates.push(...(await this.geocoding.reverseAll(lon, lat)));
    const addresses = rankAddresses(candidates, geometries).slice(0, ADDRESSES_KEPT);
    const address = chooseAddress(addresses, row.chosenAddressId);
    const naming = row.nameIsProvisional
      ? { name: proposeStudyName({ address, parcels, communeName: row.communeName, today: this.clock.now() }), nameIsProvisional: false }
      : {};
    const saved = await this.studies.saveDerived(job.studyId, job.parcelsKey, { addresses, address, addressKey: job.parcelsKey, ...naming });
    return saved ? 'done' : 'stale';
  }

  /** Adresse et vignette tout de suite, même à jour (CLI `--inline`). */
  async deriveNow(studyId: string): Promise<{ address: DerivationResult; thumbnail: DerivationResult }> {
    const row = await this.studies.get(studyId);
    if (!row) return { address: 'stale', thumbnail: 'stale' };
    const job = { studyId, parcelsKey: row.parcelsKey, force: true };
    return { address: await this.resolveAddress(job), thumbnail: await this.renderThumbnail(job) };
  }

  async renderThumbnail(job: StudyJob): Promise<DerivationResult> {
    const row = await this.current(job, (r) => r.thumbnailKey);
    if (typeof row === 'string') return row;
    const parcels = await this.studies.parcels(job.studyId);
    const png = await renderThumbnail(
      parcels.map((p) => p.geometry),
      (z, x, y) => this.tiles.get(z, x, y),
    );
    await this.files.put(thumbnailFile(job.studyId), png, 'image/png');
    const saved = await this.studies.saveDerived(job.studyId, job.parcelsKey, { thumbnailKey: job.parcelsKey });
    return saved ? 'done' : 'stale';
  }
}
