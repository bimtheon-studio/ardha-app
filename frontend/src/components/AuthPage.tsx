// Cadre des pages d'authentification : sans la coquille de l'application (F-00, #20).
import type { ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';

export function AuthPage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <p className="eyebrow text-primary">Ardha</p>
          <h1 className="text-2xl leading-none font-semibold tracking-tight">{title}</h1>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
