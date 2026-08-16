import { run as runCloneRatio } from '../backend/BE-DUP-M-001.mjs';

export { VERSION } from '../backend/BE-DUP-M-001.mjs';

export function run(args) {
    return runCloneRatio({
        ...args,
        config: {
            source_extensions: ['.js', '.jsx', '.ts', '.tsx'],
            ...(args.config ?? {}),
        },
    });
}
