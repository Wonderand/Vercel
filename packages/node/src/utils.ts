import type { LauncherType } from '@vercel/build-utils';
import type { LauncherConfiguration } from '@vercel/node-bridge/types';
import { extname } from 'path';
import { pathToRegexp } from 'path-to-regexp';
import { debug, NowBuildError } from '@vercel/build-utils';

export function getRegExpFromMatchers(matcherOrMatchers: unknown): string {
  if (!matcherOrMatchers) {
    return '^/.*$';
  }
  const matchers = Array.isArray(matcherOrMatchers)
    ? matcherOrMatchers
    : [matcherOrMatchers];
  const regExps = matchers.flatMap(getRegExpFromMatcher).join('|');
  return regExps;
}

function getRegExpFromMatcher(
  matcher: unknown,
  index: number,
  allMatchers: unknown[]
): string[] {
  if (typeof matcher !== 'string') {
    throw new Error(
      "Middleware's `config.matcher` must be a path matcher (string) or an array of path matchers (string[])"
    );
  }

  if (!matcher.startsWith('/')) {
    throw new Error(
      `Middleware's \`config.matcher\` values must start with "/". Received: ${matcher}`
    );
  }

  const regExps = [pathToRegexp(matcher).source];
  if (matcher === '/' && !allMatchers.includes('/index')) {
    regExps.push(pathToRegexp('/index').source);
  }
  return regExps;
}

/**
 * If `zeroConfig`:
 *   "api/foo.js" -> "api/foo.js"
 *   "api/foo.ts" -> "api/foo.ts"
 *
 * If *NOT* `zeroConfig`:
 *   "api/foo.js" -> "api/foo"
 *   "api/foo.ts" -> "api/foo"
 */
export function entrypointToOutputPath(
  entrypoint: string,
  zeroConfig?: boolean
): string {
  if (zeroConfig) {
    const ext = extname(entrypoint);
    return entrypoint.slice(0, entrypoint.length - ext.length);
  }
  return entrypoint;
}

export function logError(error: Error) {
  console.error(error.message);
  if (error.stack) {
    // only show the stack trace if debug is enabled
    // because it points to internals, not user code
    const errorPrefixLength = 'Error: '.length;
    const errorMessageLength = errorPrefixLength + error.message.length;
    debug(error.stack.substring(errorMessageLength + 1));
  }
}

export enum EdgeRuntimes {
  Edge = 'edge',
  ExperimentalEdge = 'experimental-edge',
}

export enum NodejRuntime {
  // @ts-ignore typescript does not allow undefined as a value
  Legacy = undefined,
  WinterCG = 'nodejs-experimental', // TODO remove -experimental once ready
}

export const ALLOWED_RUNTIMES = [
  NodejRuntime.WinterCG as string,
  ...Object.values(EdgeRuntimes),
];

export function checkConfiguredRuntime(
  runtime: string | undefined,
  entrypoint: string
) {
  if (runtime) {
    // TODO remove when nodejs-experimental will land
    if (runtime === 'nodejs') {
      throw new Error(
        `${entrypoint}: \`config.runtime: "nodejs"\` semantics will evolve soon. Please remove the \`runtime\` key to keep the existing behavior.`
      );
    }
    if (!ALLOWED_RUNTIMES.includes(runtime)) {
      throw new Error(
        `${entrypoint}: unsupported "runtime" property in \`config\`: ${JSON.stringify(
          runtime
        )} (must be one of: ${JSON.stringify(
          ALLOWED_RUNTIMES
        )}). Learn more: https://vercel.link/creating-edge-functions`
      );
    }
  }
}

export function isEdgeRuntime(runtime?: string): runtime is EdgeRuntimes {
  return (
    runtime !== undefined &&
    Object.values(EdgeRuntimes).includes(runtime as EdgeRuntimes)
  );
}

export function detectServerlessLauncherType(
  config: { runtime?: string } | null | undefined
): LauncherType {
  // The final execution environment is always node.js, but the signature differ:
  // - for BuildOutAPI, `launcherType: WinterCG-experimental` is web-compliant signature, `launcherType: Nodejs` is node-compliant signature
  // - for vc api files, `runtime: edge` is web-compliant signature on Edge, `runtime: nodejs-experimental` is web-compliant signature on node.js, undefined is legacy node-compliant on node.js
  return config?.runtime === NodejRuntime.WinterCG
    ? 'WinterCG-experimental' // TODO remove -experimental once ready
    : 'Nodejs';
}

export function checkLauncherCompatibility(
  entrypoint: string,
  launcherType: LauncherConfiguration['launcherType'],
  nodeMajorVersion: number
) {
  // TODO remove -experimental once ready
  if (launcherType === 'WinterCG-experimental' && nodeMajorVersion < 18) {
    throw new NowBuildError({
      code: 'INVALID_RUNTIME_FOR_LAUNCHER',
      message: `${entrypoint}: configured runtime "${NodejRuntime.WinterCG}" can only be used with Node.js 18 and newer`,
      // TODO when documentation will be available, add link: 'https://vercel.link/isomorphic-support',
    });
  }
}
