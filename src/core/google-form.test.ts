import { describe, expect, it } from 'vitest';
import { buildFormBody, testFormat } from './google-form';

describe('google form body', () => {
  it('maps each test length onto the form choices', () => {
    expect(testFormat('quick')).toBe('Short');
    expect(testFormat('standard')).toBe('Medium');
    expect(testFormat('comprehensive')).toBe('Long');
  });

  it('sends the visible details and the automatic fields', () => {
    const body = buildFormBody({
      fullName: 'Ada Lovelace',
      email: 'ada@proton.me',
      phone: '+15552345678',
      ip: '203.0.113.4',
      mode: 'standard',
      timeTaken: '18:42',
      iqResult: '140+',
    });
    const params = new URLSearchParams(body);
    expect(params.get('entry.2005620554')).toBe('Ada Lovelace');
    expect(params.get('entry.1045781291')).toBe('ada@proton.me');
    expect(params.get('entry.1166974658')).toBe('+15552345678');
    expect(params.get('entry.472447572')).toBe('203.0.113.4');
    expect(params.get('entry.1407511150')).toBe('Medium');
    expect(params.get('entry.1618859095')).toBe('18:42');
    expect(params.get('entry.1629703056')).toBe('140+');
  });
});
