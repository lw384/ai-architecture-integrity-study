// mock/test_env.mjs
import { getEnvSnapshot } from '../core/env/env_snapshot.mjs';

function main() {
    // 模拟从 rulepack.schema.json 读出的 manifest
    const mockRulepackManifest = {
        rulepack_id: "rp_ts_react_nest_v1",
        tool_versions: {
            eslint: "8.56.0",
            typescript: "5.3.3",
            jest: "29.7.0"
        }
    };

    console.log('--- Grabbing Environment Snapshot ---');

    const snapshot = getEnvSnapshot({ rulepack: mockRulepackManifest });

    console.log(JSON.stringify(snapshot, null, 2));
}

main();