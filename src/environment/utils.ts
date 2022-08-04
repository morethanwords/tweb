import type ENVIRONMENT from '.';

let environment: typeof ENVIRONMENT;
export function getEnvironment() {
  return environment;
}

export function setEnvironment(env: typeof environment) {
  return environment = env;
}
