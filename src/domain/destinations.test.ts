import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DESTINATIONS,
  describeDestinations,
  destinationCnigCodes,
  destinationLabel,
  isStudyDestination,
  mainDestination,
  marketFocus,
  normalizeDestinations,
  OTHER_DESTINATIONS,
  STUDY_DESTINATIONS,
} from './destinations.ts';

describe('destinations d’une étude (F-02b, Q1)', () => {
  it('sept destinations produit, adossées aux codes CNIG', () => {
    expect(STUDY_DESTINATIONS.map((d) => [d.key, d.label, d.cnig.join('-')])).toEqual([
      ['housing', 'Logement', '21'],
      ['managed-residence', 'Résidence gérée', '22'],
      ['retail', 'Commerce et services', '31-32-34'],
      ['office', 'Bureaux', '53'],
      ['hotel', 'Hôtellerie', '35-36'],
      ['industrial', 'Activités et entrepôts', '51-52'],
      ['public-facility', 'Équipement', '41-42-43-44-45-46-47'],
    ]);
    expect(DEFAULT_DESTINATIONS).toEqual(['housing']);
  });

  it('« Autre » : les sous-destinations qu’aucune destination produit ne couvre', () => {
    expect(OTHER_DESTINATIONS).toEqual(['11', '12', '33', '37', '54', '55']);
  });

  it('une clé produit ou une sous-destination CNIG ; rien d’autre', () => {
    expect(isStudyDestination('office')).toBe(true);
    expect(isStudyDestination('33')).toBe(true);
    expect(isStudyDestination('31')).toBe(true);
    expect(isStudyDestination('30')).toBe(false);
    expect(isStudyDestination('99')).toBe(false);
    expect(isStudyDestination('bureaux')).toBe(false);
  });

  it('libellés et codes CNIG', () => {
    expect(destinationLabel('office')).toBe('Bureaux');
    expect(destinationLabel('33')).toBe('Commerce de gros');
    expect(destinationLabel('99')).toBe('99 — libellé inconnu');
    expect(destinationCnigCodes('hotel')).toEqual(['35', '36']);
    expect(destinationCnigCodes('54')).toEqual(['54']);
    expect(destinationCnigCodes('99')).toEqual([]);
  });

  it('en toutes lettres : la principale d’abord ; en bref : la principale et le nombre des autres', () => {
    expect(describeDestinations(['housing'])).toBe('Logement');
    expect(describeDestinations(['retail', 'office', '33'])).toBe('Commerce et services (principale), Bureaux, Commerce de gros');
    expect(describeDestinations([])).toBe('');
    expect(mainDestination(['housing'])).toBe('Logement');
    expect(mainDestination(['retail', 'office', '33'])).toBe('Commerce et services (+2)');
    expect(mainDestination([])).toBe('');
  });

  it('normalise : code couvert ramené à sa clé, doublons retirés, ordre gardé (la principale en tête)', () => {
    expect(normalizeDestinations(['retail', 'housing'])).toEqual(['retail', 'housing']);
    expect(normalizeDestinations(['31', 'housing', '32', '21'])).toEqual(['retail', 'housing']);
    expect(normalizeDestinations(['33', 'office', '53', '33'])).toEqual(['33', 'office']);
    expect(normalizeDestinations([' Office '])).toEqual(['office']);
  });

  it('refuse une liste vide ou une destination inconnue', () => {
    expect(() => normalizeDestinations([])).toThrow('Choisissez au moins une destination.');
    expect(() => normalizeDestinations(['housing', 'bureaux'])).toThrow('Destination inconnue : bureaux.');
    expect(() => normalizeDestinations(['20'])).toThrow('Destination inconnue : 20.');
  });
});

describe('marketFocus (Q8)', () => {
  it('logement : appartements, maisons, locaux, terrains ; pas d’avertissement', () => {
    expect(marketFocus(['housing', 'retail'])).toEqual({ categories: ['apartment', 'house', 'commercial', 'land'], notice: null });
  });

  it('activité (commerce, bureaux, activités, gros, congrès, cuisine) : les locaux d’abord, DVF ne les distingue pas', () => {
    for (const main of ['retail', 'office', 'industrial', '33', '54', '55']) {
      const focus = marketFocus([main, 'housing']);
      expect(focus.categories).toEqual(['commercial', 'apartment', 'house', 'land']);
      expect(focus.notice).toBe('DVF ne distingue pas commerces, bureaux et locaux d’activité : un seul prix, celui des locaux d’activité.');
    }
  });

  it('destination sans prix DVF : l’ordre du logement et un avertissement qui la nomme', () => {
    expect(marketFocus(['hotel'])).toEqual({
      categories: ['apartment', 'house', 'commercial', 'land'],
      notice: 'DVF n’a pas de prix pour « Hôtellerie » : les prix affichés sont ceux des logements et des locaux d’activité.',
    });
    for (const main of ['managed-residence', 'public-facility', '11', '12', '37']) expect(marketFocus([main]).notice).toContain(`« ${destinationLabel(main)} »`);
  });

  it('sans destination (étude ancienne) : comme le logement', () => {
    expect(marketFocus([])).toEqual(marketFocus(['housing']));
  });
});
