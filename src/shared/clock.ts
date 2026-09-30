// L'heure, injectée : les tests d'expiration n'attendent pas 30 jours.
import { Injectable } from '@nestjs/common';

@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
