import { expect, it } from 'vitest';
import { childEnvironment } from '../../../../electron/platform/processEnvironment.ts';

it('preserves system variables with Windows casing without passing application credentials', () => {
  expect(
    childEnvironment({
      SystemRoot: 'C:\\Windows',
      windir: 'C:\\Windows',
      Path: 'C:\\Windows\\System32',
      TEMP: 'C:\\Temp',
      TMP: undefined,
      NODE_ENV: 'development',
      LEAF_AI_API_KEY: 'model-key',
      GITHUB_TOKEN: 'account-token',
    }),
  ).toEqual({
    SystemRoot: 'C:\\Windows',
    windir: 'C:\\Windows',
    Path: 'C:\\Windows\\System32',
    TEMP: 'C:\\Temp',
    NODE_ENV: 'production',
  });
});
