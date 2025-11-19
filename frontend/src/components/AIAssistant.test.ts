import { describe, expect, it } from 'vitest';
import { detectIntentByMessage } from './AIAssistant';

describe('detectIntentByMessage', () => {
  it('detects summarizing intent based on keywords', () => {
    const intent = detectIntentByMessage('Bitte fasse den Text kurz zusammen');
    expect(intent).toBe('summarizing');
  });

  it('falls back to editing when text is selected', () => {
    const intent = detectIntentByMessage('Unklare Anfrage', 'Ausgewählter Abschnitt');
    expect(intent).toBe('editing');
  });

  it('returns provided fallback when no hints matched', () => {
    const intent = detectIntentByMessage('Ganz anderer Kontext', undefined, 'structuring');
    expect(intent).toBe('structuring');
  });
});
