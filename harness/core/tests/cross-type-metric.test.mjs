import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { run } from '../../adapters/computed-metrics/implementations/cross/CROSS-TYPE-M-001.mjs';
import { collectTypeRuleEvents } from '../../adapters/cross-static/type-contracts.mjs';

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RULE_ID = 'CROSS-TYPE-C-001-request-query-body-contract-alignment';

function makeFinding(mismatchKind) {
    return {
        rule_id: RULE_ID,
        evidence: { source_tool: 'cross-static', source_rule_id: mismatchKind, payload: {} },
        location: { file: 'frontend/src/pages/orders/OrderForm.jsx' },
    };
}

function fakeConstraintsLayer({ findings = [], meta = {} } = {}) {
    return {
        findings_by_rule: { [RULE_ID]: findings },
        adapter_meta: { 'cross-static': meta },
    };
}

test('no mismatches with a positive position count: density is 0', async () => {
    const result = await run({
        constraintsLayer: fakeConstraintsLayer({ findings: [], meta: { contract_position_count: 10 } }),
        config: {},
    });

    assert.equal(result.score.value, 0);
});

test('weighted density applies the default weights (body-key mismatches weigh double)', async () => {
    const findings = [
        makeFinding('cross-static/frontend-route-param-arity-mismatch'),
        makeFinding('cross-static/frontend-query-key-mismatch'),
        makeFinding('cross-static/frontend-body-key-mismatch'),
    ];
    const result = await run({
        constraintsLayer: fakeConstraintsLayer({ findings, meta: { contract_position_count: 8 } }),
        config: {},
    });

    // weighted total = 1*1 (route-param) + 1*1 (query) + 1*2 (body) = 4
    assert.equal(result.details.target.weightedMismatchTotal, 4);
    assert.equal(result.score.value, 0.5);
    assert.equal(result.details.target.weightedMismatchCounts['cross-static/frontend-body-key-mismatch'].weight, 2);
});

test('custom weights in config override the defaults', async () => {
    const findings = [makeFinding('cross-static/frontend-query-key-mismatch')];
    const result = await run({
        constraintsLayer: fakeConstraintsLayer({ findings, meta: { contract_position_count: 4 } }),
        config: { weights: { 'cross-static/frontend-query-key-mismatch': 5 } },
    });

    assert.equal(result.details.target.weightedMismatchTotal, 5);
    assert.equal(result.score.value, 1.25);
});

test('zero contract positions yields a null density rather than dividing by zero', async () => {
    const result = await run({
        constraintsLayer: fakeConstraintsLayer({ findings: [], meta: { contract_position_count: 0 } }),
        config: {},
    });

    assert.equal(result.score.value, null);
});

test('adapter enumerates route-param/query/body contract positions, not only violating ones', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cross-type-'));

    try {
        const write = (relativePath, content) => {
            const filePath = path.join(workspaceRoot, relativePath);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, content, 'utf8');
        };

        write('backend/src/modules/orders/dto/create-order.dto.ts', `
            import { IsString } from 'class-validator';
            export class CreateOrderDto {
                @IsString()
                name: string;
            }
        `);
        write('backend/src/modules/orders/orders.controller.ts', `
            import { Controller, Post, Body } from '@nestjs/common';
            import { CreateOrderDto } from './dto/create-order.dto';
            @Controller('orders')
            export class OrdersController {
                @Post()
                createOrder(@Body() body: CreateOrderDto) {}
            }
        `);
        write('frontend/src/api/request.js', `
            export const request = (url) => url;
        `);
        write('frontend/src/api/ordersApi.js', `
            import { request } from './request';
            export const ordersApi = {
                createOrder: (payload) => request('/orders', { method: 'POST', body: payload }),
            };
        `);
        write('frontend/src/pages/orders/ordersQueries.js', `
            import { useMutation } from '@tanstack/react-query';
            import { ordersApi } from '../../api/ordersApi';
            export function useCreateOrder() {
                return useMutation({
                    mutationFn: (data) => ordersApi.createOrder(data),
                });
            }
        `);
        write('frontend/src/pages/orders/OrderForm.jsx', `
            import { useCreateOrder } from './ordersQueries';
            function OrderForm() {
                const mutation = useCreateOrder();
                mutation.mutate({ name: 'Widget', color: 'red' });
            }
        `);

        const config = JSON.parse(fs.readFileSync(
            path.join(harnessRoot, 'rulepacks/cross/tool-configs/cross-static.config.json'),
            'utf8',
        ));

        const result = collectTypeRuleEvents(workspaceRoot, config);

        // "name" is declared by the backend DTO and sent by the frontend: not a
        // violation. "color" is not declared by the DTO: a body-key mismatch.
        const bodyMismatches = result.normalizedEvents.filter(
            (event) => event.source_rule_id === 'cross-static/frontend-body-key-mismatch',
        );
        assert.equal(bodyMismatches.length, 1);
        assert.equal(bodyMismatches[0].payload.reason, 'body field "color" is not defined by backend DTO');

        // Total enumerated body-field positions: both "name" and "color" count,
        // not only the violating "color" key.
        assert.equal(result.stats.body_field_position_count, 2);
        assert.equal(result.stats.route_param_position_count, 0);
        assert.equal(result.stats.query_field_position_count, 0);
        assert.equal(result.stats.contract_position_count, 2);
    } finally {
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
});
