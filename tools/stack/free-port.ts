// Vérifie qu'un port TCP est libre, en tentant de l'écouter.
import net from 'node:net';

export function portFree(port: number, host = '0.0.0.0'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen({ port, host: host, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

/** Libre sur toutes les interfaces et sur la boucle locale (Docker publie sur l'une ou l'autre). */
export async function portReallyFree(port: number): Promise<boolean> {
  return (await portFree(port, '0.0.0.0')) && (await portFree(port, '127.0.0.1'));
}
