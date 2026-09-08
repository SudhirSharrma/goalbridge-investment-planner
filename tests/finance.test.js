import { describe, expect, it } from 'vitest';
import { calculatePlan } from '../finance.js';

const benchmark = Object.freeze({
    goalAmount: 1200000, years: 8, inflation: 6,
    annualReturn: 10, currentSavings: 150000
});

function expectFiniteNonnegative(plan) {
    for (const value of Object.values(plan)) {
        expect(typeof value).toBe('number');
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
    }
}

function expectAmounts(plan, expected) {
    expectFiniteNonnegative(plan);
    for (const [key, value] of Object.entries(expected)) {
        // Compare against the independently supplied amounts to the nearest paisa.
        expect(plan[key]).toBeCloseTo(value, 2);
    }
}

describe('calculatePlan', () => {
    it('matches all six independently verified Excel benchmark amounts', () => {
        expectAmounts(calculatePlan(benchmark), {
            futureGoal: 1912617.69, futureSavings: 321538.32,
            fundingGap: 1591079.37, monthlyContribution: 11094.45,
            totalContributions: 1065067.32, projectedGrowth: 526012.05
        });
    });

    it('handles zero return without division by zero or nonfinite outputs', () => {
        const plan = calculatePlan({ ...benchmark, annualReturn: 0 });
        expectAmounts(plan, {
            futureGoal: 1912617.69, futureSavings: 150000,
            fundingGap: 1762617.69, monthlyContribution: 18360.60,
            totalContributions: 1762617.69, projectedGrowth: 0
        });
        expect(plan.monthlyContribution).toBe(plan.fundingGap / 96);
        expect(plan.projectedGrowth).toBe(0);
    });

    it('requires no contributions when savings exceed the future goal', () => {
        const plan = calculatePlan({ goalAmount: 500000, years: 5, inflation: 5, annualReturn: 10, currentSavings: 1000000 });
        expectFiniteNonnegative(plan);
        expect(plan.futureSavings).toBeGreaterThan(plan.futureGoal);
        for (const key of ['fundingGap', 'monthlyContribution', 'totalContributions', 'projectedGrowth']) {
            expect(plan[key]).toBe(0);
        }
    });

    it('preserves today’s goal cost when inflation is zero', () => {
        const plan = calculatePlan({ goalAmount: 1000000, years: 10, inflation: 0, annualReturn: 8, currentSavings: 0 });
        expectFiniteNonnegative(plan);
        expect(plan.futureGoal).toBe(1000000);
    });

    it('funds the entire future goal through contributions and growth with no savings', () => {
        const plan = calculatePlan({ goalAmount: 1000000, years: 10, inflation: 5, annualReturn: 8, currentSavings: 0 });
        expectFiniteNonnegative(plan);
        expect(plan.futureSavings).toBe(0);
        expect(plan.fundingGap).toBe(plan.futureGoal);
        expect(plan.monthlyContribution).toBeGreaterThan(0);
    });

    it('uses twelve end-of-month contributions for a one-year goal', () => {
        const plan = calculatePlan({ goalAmount: 100000, years: 1, inflation: 5, annualReturn: 6, currentSavings: 10000 });
        expectFiniteNonnegative(plan);
        expect(plan.monthlyContribution).toBeGreaterThan(0);
        expect(plan.totalContributions).toBeCloseTo(plan.monthlyContribution * 12, 8);
        // Independently accumulate deposits month by month to verify their timing.
        let balance = 0;
        for (let month = 0; month < 12; month += 1) {
            balance = balance * Math.pow(1.06, 1 / 12) + plan.monthlyContribution;
        }
        expect(balance + plan.futureSavings).toBeCloseTo(plan.futureGoal, 6);
    });

    it('produces stable positive contributions for a small nonzero return', () => {
        const inputs = { goalAmount: 500000, years: 5, inflation: 4, annualReturn: 0.01, currentSavings: 50000 };
        const plan = calculatePlan(inputs);
        expectFiniteNonnegative(plan);
        expect(plan.monthlyContribution).toBeGreaterThan(0);
        let balance = plan.futureSavings;
        let deposits = 0;
        for (let month = 0; month < 60; month += 1) {
            deposits = deposits * Math.pow(1.0001, 1 / 12) + plan.monthlyContribution;
        }
        expect(balance + deposits).toBeCloseTo(plan.futureGoal, 4);
    });

    it('reconciles all funding components to the future goal for a positive gap', () => {
        const plan = calculatePlan(benchmark);
        expectFiniteNonnegative(plan);
        expect(plan.fundingGap).toBeGreaterThan(0);
        expect(plan.futureSavings + plan.totalContributions + plan.projectedGrowth)
            .toBeCloseTo(plan.futureGoal, 6);
    });

    it('is deterministic and leaves its input object unchanged', () => {
        const inputs = Object.freeze({ ...benchmark });
        expect(calculatePlan(inputs)).toEqual(calculatePlan(inputs));
        expect(inputs).toEqual(benchmark);
    });
});
