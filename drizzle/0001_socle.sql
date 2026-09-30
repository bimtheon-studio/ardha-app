CREATE TYPE "public"."origine_audit" AS ENUM('api', 'cli', 'worker');--> statement-breakpoint
CREATE TYPE "public"."role_utilisateur" AS ENUM('admin', 'utilisateur');--> statement-breakpoint
CREATE TABLE "journal_audit" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"origine" "origine_audit" NOT NULL,
	"acteur_id" uuid,
	"action" text NOT NULL,
	"cible_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "reinitialisation_mot_de_passe" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"jeton_hash" text NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"utilise_le" timestamp with time zone,
	CONSTRAINT "reinitialisation_mot_de_passe_jeton_hash_unique" UNIQUE("jeton_hash")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"jeton_hash" text NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"derniere_activite_le" timestamp with time zone DEFAULT now() NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"expire_au_plus_tard_le" timestamp with time zone NOT NULL,
	"ip" text,
	"agent_utilisateur" text,
	CONSTRAINT "session_jeton_hash_unique" UNIQUE("jeton_hash")
);
--> statement-breakpoint
CREATE TABLE "utilisateur" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"nom" text NOT NULL,
	"mot_de_passe_hash" text,
	"role" "role_utilisateur" DEFAULT 'utilisateur' NOT NULL,
	"desactive_le" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "utilisateur_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "journal_audit" ADD CONSTRAINT "journal_audit_acteur_id_utilisateur_id_fk" FOREIGN KEY ("acteur_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reinitialisation_mot_de_passe" ADD CONSTRAINT "reinitialisation_mot_de_passe_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_audit_cree_le_index" ON "journal_audit" USING btree ("cree_le");--> statement-breakpoint
CREATE INDEX "journal_audit_acteur_id_index" ON "journal_audit" USING btree ("acteur_id");--> statement-breakpoint
CREATE INDEX "journal_audit_action_index" ON "journal_audit" USING btree ("action");--> statement-breakpoint
CREATE INDEX "reinitialisation_mot_de_passe_utilisateur_id_index" ON "reinitialisation_mot_de_passe" USING btree ("utilisateur_id");--> statement-breakpoint
CREATE INDEX "session_utilisateur_id_index" ON "session" USING btree ("utilisateur_id");--> statement-breakpoint
CREATE INDEX "session_expire_le_index" ON "session" USING btree ("expire_le");