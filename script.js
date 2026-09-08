import { calculatePlan } from './finance.js';

(() => {
    'use strict';

    const form = document.getElementById('goal-planning-form');
    const fields = {
        goalName: document.getElementById('goal-name'),
        goalAmount: document.getElementById('goal-amount'),
        currentSavings: document.getElementById('current-savings'),
        years: document.getElementById('years-to-goal'),
        inflation: document.getElementById('annual-inflation'),
        annualReturn: document.getElementById('annual-return')
    };
    const outputKeys = {
        'future-goal-cost': 'futureGoal',
        'future-savings-value': 'futureSavings',
        'funding-gap': 'fundingGap',
        'monthly-contribution': 'monthlyContribution',
        'total-monthly-contributions': 'totalContributions',
        'projected-growth': 'projectedGrowth',
        'funding-savings-value': 'futureSavings',
        'funding-contributions-value': 'totalContributions',
        'funding-growth-value': 'projectedGrowth'
    };
    const summary = document.getElementById('plan-summary');
    const defaultSummary = 'Enter your assumptions and calculate your plan to see your personalised goal summary.';
    const currencyFormatter = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    function getInputs() {
        const inputs = { goalName: fields.goalName.value.trim() };
        for (const [key, field] of Object.entries(fields)) {
            if (key !== 'goalName') {
                // An empty field must not become zero through Number('').
                inputs[key] = field.value.trim() === '' ? NaN : Number(field.value);
            }
        }
        return inputs;
    }

    function validateInputs(inputs) {
        const blankMessages = {
            goalAmount: 'Enter the goal amount.',
            currentSavings: 'Enter current savings. Use 0 if you have no savings yet.',
            years: 'Enter the number of years to your goal.',
            inflation: 'Enter an expected annual inflation rate.',
            annualReturn: 'Enter an expected annual investment return.'
        };
        const negativeMessages = {
            currentSavings: 'Enter zero or a positive amount.',
            inflation: 'Enter zero or a positive inflation rate.',
            annualReturn: 'Enter zero or a positive investment return.'
        };
        for (const [key, field] of Object.entries(fields)) {
            field.setCustomValidity('');
            const value = inputs[key];
            let message = '';

            if (key === 'goalName') {
                if (!value.trim()) message = 'Enter a goal name.';
            } else if (field.validity.badInput) {
                message = 'Enter a valid number.';
            } else if (field.value.trim() === '') {
                message = blankMessages[key];
            } else if (!Number.isFinite(value)) {
                message = 'Enter a valid number.';
            } else if (key === 'goalAmount' && value <= 0) {
                message = 'Enter a goal amount greater than ₹0.';
            } else if (key === 'years' && value <= 0) {
                message = 'Enter a positive whole number of years.';
            } else if (key === 'years' && !Number.isInteger(value)) {
                message = 'Enter a whole number of years.';
            } else if (value < 0) {
                message = negativeMessages[key];
            } else if (key === 'inflation' && value > 100) {
                message = 'Enter an inflation rate no greater than 100%.';
            } else if (key === 'annualReturn' && value > 100) {
                message = 'Enter an investment return no greater than 100%.';
            } else if (field.min !== '' && value < Number(field.min)) {
                message = `Enter a value of at least ${field.min}.`;
            } else if (field.max !== '' && value > Number(field.max)) {
                message = `Enter a value no greater than ${field.max}.`;
            } else if (field.validity.stepMismatch) {
                message = `Enter a value in increments of ${field.step}.`;
            }

            field.setCustomValidity(message);
        }

        // Show application messages through native accessible validation feedback.
        const invalidField = Object.values(fields).find(field => !field.checkValidity());
        if (invalidField) {
            invalidField.focus();
            invalidField.reportValidity();
            return false;
        }
        return true;
    }

    function formatCurrency(value) {
        // Avoid a negative-zero display; do not round values used by the model.
        return currencyFormatter.format(Math.abs(value) < 0.005 ? 0 : value);
    }

    function renderResults(plan) {
        for (const [id, key] of Object.entries(outputKeys)) {
            document.getElementById(id).textContent = formatCurrency(plan[key]);
        }
    }

    function renderFundingVisualisation(plan) {
        const components = [
            ['savings', 'Future Value of Existing Savings', plan.futureSavings],
            ['contributions', 'Monthly Contributions', plan.totalContributions],
            ['growth', 'Projected Investment Growth', plan.projectedGrowth]
        ];
        const goal = Number.isFinite(plan.futureGoal) && plan.futureGoal > 0 ? plan.futureGoal : 0;
        for (const [key, label, value] of components) {
            const amount = Number.isFinite(value) && value >= 0 ? value : 0;
            // Visual proportions only; the verified financial model remains untouched.
            const ratio = goal > 0 ? amount / goal * 100 : 0;
            const percentage = Number.isFinite(ratio) ? Math.max(0, ratio) : 0;
            const width = Math.min(100, percentage);
            document.getElementById('funding-' + key + '-fill').style.width = width + '%';
            document.getElementById('funding-' + key + '-value').textContent = formatCurrency(amount);
            document.getElementById('funding-' + key + '-bar').setAttribute('aria-label',
                label + ': ' + formatCurrency(amount) + ', approximately ' + percentage.toFixed(1)
                + ' percent of future goal cost.' + (percentage > 100 ? ' Bar capped at 100 percent.' : ''));
        }
        document.getElementById('funding-goal-total').textContent = formatCurrency(goal);
    }

    function renderSummary(inputs, plan) {
        const period = `${inputs.years} ${inputs.years === 1 ? 'year' : 'years'}`;
        const introduction = `Your ${inputs.goalName} is estimated to cost ${formatCurrency(plan.futureGoal)} in ${period}. `
            + `Your current savings could grow to ${formatCurrency(plan.futureSavings)}`;

        if (plan.fundingGap === 0) {
            summary.textContent = introduction
                + ', which is projected to cover the estimated future goal cost under the assumptions entered. '
                + `The estimated funding gap is ${formatCurrency(0)}, so the required monthly contribution is ${formatCurrency(0)} under this model.`;
        } else {
            summary.textContent = introduction
                + `, leaving an estimated funding gap of ${formatCurrency(plan.fundingGap)}. `
                + `Based on the assumptions entered, an estimated monthly contribution of ${formatCurrency(plan.monthlyContribution)} would be required to address this gap.`;
        }
    }

    function resetResults() {
        for (const id of Object.keys(outputKeys)) {
            document.getElementById(id).textContent = formatCurrency(0);
        }
        summary.textContent = defaultSummary;
        renderFundingVisualisation({ futureGoal: 0, futureSavings: 0, totalContributions: 0, projectedGrowth: 0 });
    }

    // Run validation on submit ourselves, including when HTML constraints are bypassed.
    // reportValidity() still provides native feedback on the relevant input.
    form.noValidate = true;
    form.addEventListener('submit', event => {
        event.preventDefault();
        const inputs = getInputs();
        if (!validateInputs(inputs)) return;
        const plan = calculatePlan(inputs);
        renderResults(plan);
        renderFundingVisualisation(plan);
        renderSummary(inputs, plan);
    });

    for (const field of Object.values(fields)) {
        field.addEventListener('input', () => field.setCustomValidity(''));
    }

    form.addEventListener('reset', () => {
        // The native reset action restores the HTML defaults without reloading.
        for (const field of Object.values(fields)) field.setCustomValidity('');
        resetResults();
    });

    resetResults();
})();
