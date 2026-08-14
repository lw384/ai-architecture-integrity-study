import { nestjsContractsPlugin } from './nestjs-contracts.js';
import { nestjsErrorPlugin } from './nestjs-errors.js';
import { nestjsRoutesPlugin } from './nestjs-routes.js';
import { nestjsSizePlugin } from './nestjs-size.js';
import { nestjsStructPlugin } from './nestjs-struct.js';
import { nestjsTestabilityPlugin } from './nestjs-testability.js';

export const nestjsPlugin = {
    rules: {
        ...(nestjsContractsPlugin.rules ?? {}),
        ...(nestjsStructPlugin.rules ?? {}),
        ...(nestjsErrorPlugin.rules ?? {}),
        ...(nestjsRoutesPlugin.rules ?? {}),
        ...(nestjsSizePlugin.rules ?? {}),
        ...(nestjsTestabilityPlugin.rules ?? {}),
    },
};
