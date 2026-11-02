import type { ModeId } from './config';

/** Published response endpoint for the Free IQ Test Google Form. */
const FORM_ACTION =
  'https://docs.google.com/forms/d/e/1FAIpQLSeuzslDZMbP45NJgBMSpP4X0T6e1DHodZFHRUeX06ZXyZ2BtQ/formResponse';

/** Entry ids from the form definition. Choice values must match the form's options exactly. */
const FORM_FIELDS = {
  name: 'entry.2005620554',
  email: 'entry.1045781291',
  phone: 'entry.1166974658',
  ip: 'entry.472447572',
  format: 'entry.1407511150',
  time: 'entry.1618859095',
  iq: 'entry.1629703056',
} as const;

/** The form's Test Format choices, in the same order as the test lengths. */
const TEST_FORMAT: Record<ModeId, 'Short' | 'Medium' | 'Long'> = {
  quick: 'Short',
  standard: 'Medium',
  comprehensive: 'Long',
};

export interface FormSubmission {
  fullName: string;
  email: string;
  phone: string;
  ip: string;
  mode: ModeId;
  /** Clock time spent, e.g. "18:42". */
  timeTaken: string;
  /** The score shown on the results screen, e.g. "118" or "140+". */
  iqResult: string;
}

export function testFormat(mode: ModeId): 'Short' | 'Medium' | 'Long' {
  return TEST_FORMAT[mode];
}

export function buildFormBody(submission: FormSubmission): string {
  const fields: [string, string][] = [
    [FORM_FIELDS.name, submission.fullName],
    [FORM_FIELDS.email, submission.email],
    [FORM_FIELDS.phone, submission.phone],
    [FORM_FIELDS.ip, submission.ip],
    [FORM_FIELDS.format, testFormat(submission.mode)],
    [FORM_FIELDS.time, submission.timeTaken],
    [FORM_FIELDS.iq, submission.iqResult],
  ];
  return fields.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
}

export async function getPublicIP(): Promise<string> {
  const response = await fetch('https://api.ipify.org?format=json');
  if (!response.ok) throw new Error('Could not read the IP address.');
  const data = (await response.json()) as { ip?: string };
  if (!data.ip) throw new Error('Could not read the IP address.');
  return data.ip;
}

/** Posts to Google Forms. no-cors hides the response, so a resolve only means the request was sent. */
export function submitToForm(body: string): Promise<Response> {
  const request = fetch(FORM_ACTION, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('timeout')), 10_000);
  });
  return Promise.race([request, timeout]);
}
