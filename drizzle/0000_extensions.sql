-- Extensions de la pile (D-10) : PostGIS pour la géométrie, pgvector pour les plongements.
-- Elles apportent des types et des fonctions de bibliothèque, autorisés par le contrôle de doctrine.
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector;
