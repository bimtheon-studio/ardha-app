// Vérifie qu'un port TCP est libre, en tentant de l'écouter.
import net from 'node:net';

export function portLibre(port: number, hote = '0.0.0.0'): Promise<boolean> {
  return new Promise((resolve) => {
    const serveur = net.createServer();
    serveur.once('error', () => resolve(false));
    serveur.listen({ port, host: hote, exclusive: true }, () => {
      serveur.close(() => resolve(true));
    });
  });
}

/** Libre sur toutes les interfaces et sur la boucle locale (Docker publie sur l'une ou l'autre). */
export async function portVraimentLibre(port: number): Promise<boolean> {
  return (await portLibre(port, '0.0.0.0')) && (await portLibre(port, '127.0.0.1'));
}
