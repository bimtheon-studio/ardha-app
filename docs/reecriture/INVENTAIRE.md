# Inventaire de l'ancien Ardha

> Généré par `tools/inventaire-ancien.mjs` + `tools/rendre-inventaire.mjs` sur `bimtheon-studio/ardha` @ `2a7f9a0`.
> Ne pas éditer à la main : régénérer.

**Méthode.** Pour chaque page, fermeture transitive des imports locaux, hors infrastructure partagée
(`components/ui`, `integrations/`, coquille de l'application). *Lignes propres* = code atteint par cette
seule page ; le reste est partagé entre plusieurs pages (carte, hooks d'API, utilitaires). Pour chaque
edge function : son `index.ts` seul, puis sa fermeture avec `_shared/`.

## Synthèse par lot

| Lot | Pages | Lignes propres (front) | Functions | Lignes `index.ts` (back) |
|---|---|--:|---|--:|
| L0 · Socle | Auth, NotFound | 265 | 1 | 25 |
| L1 · Carte et parcellaire | Cadastre | 1 306 | 1 | 79 |
| L2 · Étude | Home, EtatEtude, mobile/MobileStudyList, mobile/MobileStudyView, mobile/MobileMapPage | 1 818 | 0 | 0 |
| L3 · Chaîne PLU et urbanisme | Urbanisme | 5 563 | 20 | 6 623 |
| L4 · Risques | Risques | 1 611 | 0 | 0 |
| L5 · Foncier et marché | Foncier | 1 862 | 5 | 1 608 |
| L6 · Estimation | Estimation | 6 690 | 1 | 260 |
| L7 · Faisabilité et résultats | Faisabilite, Resultats | 5 712 | 0 | 0 |
| L8 · Exports | Export | 7 385 | 0 | 0 |
| L9 · Administration → CLI | Admin | 3 564 | 2 | 417 |
| Hors v1 · Volet agent (non repris, D-12) | AgentDashboard, AgentListings, AgentClients, AgentMandates, AgentProfile | 2 572 | 1 | 154 |
| Hors v1 · SaaS | Onboarding | 916 | 0 | 0 |

Toutes les pages et toutes les functions sont rattachées à un lot.

## Front — par page

| Page | Fichiers | Lignes (fermeture) | Lignes propres | Tables | Functions appelées | API externes |
|---|--:|--:|--:|---|---|---|
| Export | 45 | 13 934 | 7 385 | documents_urbanisme, regles_zones_extraites | dvf-proxy, fetch-gpu-layers | api-adresse.data.gouv.fr, apicarto.ign.fr, data.geopf.fr, geo.api.gouv.fr, mapsref.brgm.fr, overpass.openstreetmap.fr, www.georisques.gouv.fr, www.landxml.org, www.openstreetmap.org |
| Urbanisme | 55 | 12 389 | 5 563 | articles_urbanisme, documents_communes, documents_fichiers, documents_urbanisme, oap_analyses, regles_zones_extraites, user_roles | analyze-oap, analyze-zone-rules, fetch-gpu-layers | api-adresse.data.gouv.fr, apicarto.ign.fr, data.geopf.fr, geo.api.gouv.fr, mapsref.brgm.fr, overpass.openstreetmap.fr, www.geoportail-urbanisme.gouv.fr, www.georisques.gouv.fr, www.openstreetmap.org |
| Estimation | 40 | 10 404 | 6 690 | agent_profiles, estimations, user_roles, user_subscriptions | dvf-proxy, generate-estimation-pdf, generate-fiche-commerciale, market-analysis | api-adresse.data.gouv.fr, apicarto.ign.fr, data.geopf.fr, geo.api.gouv.fr, www.georisques.gouv.fr |
| Risques | 39 | 8 688 | 1 611 | etudes | fetch-gpu-layers | api-adresse.data.gouv.fr, data.geopf.fr, geo.api.gouv.fr, mapsref.brgm.fr, overpass.openstreetmap.fr, www.georisques.gouv.fr, www.openstreetmap.org |
| Foncier | 42 | 8 286 | 1 862 | — | dvf-proxy, fetch-gpu-layers, market-analysis | api-adresse.data.gouv.fr, data.geopf.fr, geo.api.gouv.fr, mapsref.brgm.fr, overpass.openstreetmap.fr, www.georisques.gouv.fr, www.openstreetmap.org |
| Cadastre | 40 | 7 879 | 1 306 | — | fetch-gpu-layers | api-adresse.data.gouv.fr, data.geopf.fr, geo.api.gouv.fr, mapsref.brgm.fr, overpass.openstreetmap.fr, www.georisques.gouv.fr, www.openstreetmap.org |
| Faisabilite | 33 | 7 171 | 4 373 | documents_urbanisme, ecln_prix_neufs, etudes, market_data_cache, regles_zones_extraites, user_roles | construction-indices | data.geopf.fr, overpass.openstreetmap.fr, www.openstreetmap.org |
| Resultats | 19 | 3 916 | 1 339 | agent_profiles, etudes, user_roles | — | data.geopf.fr, overpass.openstreetmap.fr, www.openstreetmap.org |
| Admin | 13 | 3 877 | 3 564 | admin_audit_log, documents_urbanisme, extraction_settings, extraction_status, import_jobs, model_catalog, purge_audit_log, regles_zones_extraites, user_roles | admin-extraction-control, analyze-manual-pdf, analyze-zone-rules, build-corpus, extract-rules, purge-zone-cache, sentry-test-nonexistent | — |
| Home | 20 | 3 677 | 896 | agent_profiles, estimations, etudes, user_roles, user_subscriptions | — | data.geopf.fr, overpass.openstreetmap.fr, tile.openstreetmap.org, www.openstreetmap.org |
| EtatEtude | 12 | 2 917 | 430 | agent_profiles, etudes, user_roles, user_subscriptions | — | data.geopf.fr, overpass.openstreetmap.fr, www.openstreetmap.org |
| AgentMandates | 14 | 2 338 | 913 | agent_profiles, estimations, user_roles | generate-fiche-commerciale | — |
| AgentListings | 13 | 2 142 | 650 | estimations, user_roles | generate-fiche-commerciale | — |
| AgentClients | 12 | 1 783 | 453 | estimations, user_roles | generate-fiche-commerciale | — |
| AgentDashboard | 9 | 1 306 | 180 | estimations, user_roles | generate-fiche-commerciale | — |
| Onboarding | 11 | 1 260 | 916 | agent_profiles, user_roles, user_subscriptions | — | — |
| AgentProfile | 7 | 1 116 | 376 | agent_profiles, user_roles, user_subscriptions | — | — |
| Auth | 5 | 550 | 237 | user_roles | — | — |
| mobile/MobileStudyList | 5 | 490 | 110 | etudes, user_roles | — | — |
| mobile/MobileStudyView | 2 | 258 | 191 | etudes | — | — |
| mobile/MobileMapPage | 2 | 191 | 191 | etudes | — | www.openstreetmap.org |
| NotFound | 1 | 28 | 28 | — | — | — |

## Back — par edge function

| Function | `index.ts` | Avec `_shared` | Tables | API externes | Appelée par (front) |
|---|--:|--:|---|---|---|
| analyze-zone-rules | 1 235 | 2 866 | communes_referentiel, documents_fichiers, documents_urbanisme, regles_zones_extraites, texte_reglement_cache | — | Admin, Urbanisme |
| process-extraction-queue | 137 | 2 633 | articles_urbanisme, communes_referentiel, documents_urbanisme, extraction_job_chapters, extraction_jobs, extraction_settings, regles_zones_extraites, texte_reglement_cache | — | cron, admin ou service |
| extract-rules | 285 | 1 796 | articles_urbanisme, communes_referentiel, documents_urbanisme, regles_zones_extraites, texte_reglement_cache | — | Admin |
| market-analysis | 709 | 1 566 | dvf_price_aggregates, ecln_prix_neufs, market_data_cache | apidf-preprod.cerema.fr, bdm.insee.fr, data.ademe.fr, data.statistiques.developpement-durable.gouv.fr, files.data.gouv.fr, geo.api.gouv.fr | Estimation, Foncier |
| analyze-oap | 277 | 1 463 | documents_communes, documents_fichiers, documents_urbanisme, oap_analyses | — | Urbanisme |
| extract-pdf-text | 413 | 1 389 | documents_fichiers, documents_urbanisme, texte_reglement_cache | — | cron, admin ou service |
| dvf-archive | 312 | 1 282 | communes_referentiel, dvf_price_aggregates, market_data_cache | apidf-preprod.cerema.fr, files.data.gouv.fr | cron, admin ou service |
| dvf-proxy | 198 | 1 098 | market_data_cache | apidf-preprod.cerema.fr, files.data.gouv.fr, geo.api.gouv.fr | Estimation, Export, Foncier |
| unpack-plu-archive | 415 | 914 | documents_communes, documents_fichiers, documents_urbanisme, pipeline_jobs | www.geoportail-urbanisme.gouv.fr | cron, admin ou service |
| extract-gis-layers | 279 | 874 | documents_communes, documents_urbanisme, gpu_layers_cache, pipeline_jobs | www.geoportail-urbanisme.gouv.fr | cron, admin ou service |
| import-plu | 659 | 773 | documents_communes, documents_fichiers, documents_urbanisme | apicarto.ign.fr, geo.api.gouv.fr, www.geoportail-urbanisme.gouv.fr | cron, admin ou service |
| fetch-gpu-layers | 507 | 756 | documents_communes, documents_urbanisme, gpu_layers_cache | apicarto.ign.fr, data.geopf.fr, geo.api.gouv.fr | Cadastre, Export, Foncier, Risques, Urbanisme |
| sync-documents-urba | 483 | 756 | documents_communes, documents_urbanisme, gpu_layers_cache, oap_analyses, regles_zones_extraites, texte_reglement_cache | apicarto.ign.fr, geo.api.gouv.fr, www.geoportail-urbanisme.gouv.fr | cron, admin ou service |
| build-corpus | 183 | 729 | admin_audit_log, commune_data_status, corpus_targets, documents_communes, documents_urbanisme, extraction_settings, pipeline_jobs, user_roles | — | Admin |
| provision-commune | 362 | 728 | commune_data_status, communes_referentiel, documents_communes, documents_urbanisme, regles_zones_extraites | — | cron, admin ou service |
| urbanisme | 374 | 710 | — | apicarto.ign.fr, www.geoportail-urbanisme.gouv.fr | cron, admin ou service |
| extract-articles | 308 | 654 | articles_urbanisme, texte_reglement_cache | geo.api.gouv.fr | cron, admin ou service |
| generate-estimation-pdf | 260 | 639 | agent_profiles, estimations | — | Estimation |
| purge-processed-storage | 88 | 627 | admin_audit_log, documents_fichiers, documents_urbanisme, storage_purge_candidates, texte_reglement_cache, user_roles | — | cron, admin ou service |
| analyze-manual-pdf | 245 | 591 | — | — | Admin |
| admin-extraction-control | 172 | 552 | admin_audit_log, corpus_funnel, documents_urbanisme, extraction_settings, storage_usage, user_roles | — | Admin |
| import-ecln | 324 | 546 | ecln_prix_neufs, market_data_cache | data.statistiques.developpement-durable.gouv.fr | cron, admin ou service |
| generate-fiche-commerciale | 154 | 500 | agent_listings | — | AgentClients, AgentDashboard, AgentListings, AgentMandates, Estimation |
| download-missing-pdfs | 258 | 372 | documents_communes, documents_urbanisme, pipeline_jobs | — | cron, admin ou service |
| read-zone-rules | 95 | 359 | documents_urbanisme, extraction_jobs, regles_zones_extraites | — | cron, admin ou service |
| purge-zone-cache | 125 | 272 | purge_audit_log, regles_zones_extraites | — | Admin |
| urbanisme-docs | 100 | 214 | documents_communes, documents_urbanisme | — | cron, admin ou service |
| load-communes-referentiel | 79 | 193 | communes_referentiel | geo.api.gouv.fr | cron, admin ou service |
| enqueue-extraction-backfill | 40 | 154 | — | — | cron, admin ou service |
| construction-indices | 65 | 130 | — | bdm.insee.fr | Faisabilite |
| sentry-config | 25 | 49 | — | — | Admin, AgentClients, AgentDashboard, AgentListings, AgentMandates, AgentProfile, Auth, Cadastre, Estimation, EtatEtude, Export, Faisabilite, Foncier, Home, Onboarding, Resultats, Risques, Urbanisme, mobile/MobileStudyList |

