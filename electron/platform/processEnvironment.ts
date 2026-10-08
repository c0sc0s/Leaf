const systemVariables = new Set([
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'WINDIR',
  'TEMP',
  'TMP',
  'PATH',
  'PATHEXT',
  'COMSPEC',
]);

export function childEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  return {
    ...Object.fromEntries(
      Object.entries(environment).filter(
        ([name, value]) => value !== undefined && systemVariables.has(name.toUpperCase()),
      ),
    ),
    NODE_ENV: 'production',
  };
}
