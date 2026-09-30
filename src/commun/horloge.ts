// L'heure, injectée : les tests d'expiration n'attendent pas 30 jours.
import { Injectable } from '@nestjs/common';

@Injectable()
export class Horloge {
  maintenant(): Date {
    return new Date();
  }
}
