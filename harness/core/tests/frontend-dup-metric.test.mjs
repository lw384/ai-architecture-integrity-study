import assert from 'node:assert/strict';
import test from 'node:test';

import { run } from '../../adapters/computed-metrics/implementations/frontend/FE-DUP-M-001.mjs';
import { runFrontendMetric } from './frontend-metric-test-helpers.mjs';

const COMPONENT = `
export function ContactCard({ contact, onSelect }) {
    const title = contact.firstName + ' ' + contact.lastName;
    const details = contact.email + ' / ' + contact.phone;
    const handleClick = () => onSelect(contact.id);
    return (
        <article className="card" onClick={handleClick}>
            <header><strong>{title}</strong></header>
            <section><span>{details}</span></section>
        </article>
    );
}
`;

const RENAMED_COMPONENT = `
export function CompanyCard({ company, choose }) {
    const heading = company.givenName + ' ' + company.familyName;
    const summary = company.mail + ' / ' + company.telephone;
    const activate = () => choose(company.key);
    return (
        <article className="panel" onClick={activate}>
            <header><strong>{heading}</strong></header>
            <section><span>{summary}</span></section>
        </article>
    );
}
`;

test('frontend clone ratio detects token-normalized Type-2 JSX clones', async () => {
    const result = await runFrontendMetric(run, {
        'src/ContactCard.jsx': COMPONENT,
        'src/CompanyCard.jsx': RENAMED_COMPONENT,
    });

    assert.ok(result.score.value > 0);
    assert.ok(result.details.target.matches.length > 0);
    assert.equal(result.details.target.fileCount, 2);
});

test('frontend clone ratio scans JS/TS variants and excludes test files', async () => {
    const javascript = `
        export function total(values) {
            let result = 0;
            for (const value of values) {
                result += value.amount * value.quantity;
            }
            return result;
        }
    `;
    const productionOnly = await runFrontendMetric(run, {
        'src/total.js': javascript,
        'src/types.ts': 'export interface Item { id: string; }',
        'src/total.test.js': javascript,
    }, { min_tokens: 20 });

    assert.equal(productionOnly.details.target.fileCount, 2);
    assert.equal(productionOnly.score.value, 0);
});
