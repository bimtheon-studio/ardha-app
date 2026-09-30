// Logs structurés (JSON) par pino ; lisibles en développement. Cookies et en-têtes d'authentification masqués.
import type { Params } from 'nestjs-pino';

import type { Config } from '../config/config.ts';

export function optionsJournalisation(config: Config): Params {
  return {
    pinoHttp: {
      level: config.LOG_LEVEL,
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
      ...(config.NODE_ENV === 'development' && {
        transport: { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } },
      }),
    },
  };
}
