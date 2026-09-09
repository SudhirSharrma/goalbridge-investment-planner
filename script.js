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
    // Session-only snapshots; never persisted or transmitted.
    let basePlan = null;
    let alternatives = [null, null];
    let pendingSlot = null;
    let latestPlan = null;
    const metrics = [
        ['inputs', 'goalName', 'Goal Name', 'text'],
        ['inputs', 'goalAmount', 'Goal Amount Today', 'currency'],
        ['inputs', 'years', 'Years to Goal', 'years'],
        ['inputs', 'inflation', 'Expected Annual Inflation', 'rate'],
        ['inputs', 'annualReturn', 'Expected Annual Investment Return', 'rate'],
        ['inputs', 'currentSavings', 'Current Savings', 'currency'],
        ['plan', 'futureGoal', 'Future Goal Cost', 'currency'],
        ['plan', 'futureSavings', 'Future Value of Existing Savings', 'currency'],
        ['plan', 'fundingGap', 'Funding Gap', 'currency'],
        ['plan', 'monthlyContribution', 'Required Monthly Contribution', 'currency'],
        ['plan', 'totalContributions', 'Total Monthly Contributions', 'currency'],
        ['plan', 'projectedGrowth', 'Projected Investment Growth', 'currency']
    ];
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

    function renderSummary(inputs, plan, target = summary) {
        const period = `${inputs.years} ${inputs.years === 1 ? 'year' : 'years'}`;
        const parts = [
            `Your ${inputs.goalName} costs ${formatCurrency(inputs.goalAmount)} today and is estimated to cost ${formatCurrency(plan.futureGoal)} after ${period} at the assumed ${inputs.inflation}% annual inflation rate. This is an estimated increase of ${formatCurrency(plan.futureGoal - inputs.goalAmount)} due to inflation.`,
            inputs.currentSavings === 0
                ? `You entered no current savings (${formatCurrency(0)}), so their projected future value is ${formatCurrency(0)}.`
                : `Your current savings of ${formatCurrency(inputs.currentSavings)} could have a future value of ${formatCurrency(plan.futureSavings)} at the assumed ${inputs.annualReturn}% annual investment return.`
        ];
        if (plan.fundingGap === 0) {
            parts.push(`Under these assumptions, existing savings are projected to meet or exceed the future goal cost. The remaining funding gap is ${formatCurrency(0)} and no additional monthly contribution is currently estimated. Total additional contributions and their projected investment growth are both ${formatCurrency(0)}.`);
        } else {
            parts.push(`The remaining estimated funding gap is ${formatCurrency(plan.fundingGap)}. An estimated contribution of ${formatCurrency(plan.monthlyContribution)} at the end of each month would address this gap under the model.`);
            parts.push(inputs.annualReturn === 0
                ? `With a 0% assumed investment return, projected investment growth is ${formatCurrency(0)}. The gap is met entirely through total monthly contributions of ${formatCurrency(plan.totalContributions)}.`
                : `Over the goal period, ${formatCurrency(plan.totalContributions)} would come from monthly contributions and ${formatCurrency(plan.projectedGrowth)} from projected investment growth on those contributions.`);
        }
        parts.push('These are illustrative estimates; the assumed return is not guaranteed and actual outcomes may differ.');
        target.textContent = parts.join(' ');
    }

    function formatMetric(value, type) {
        if (type === 'currency') return formatCurrency(value);
        if (type === 'rate') return `${value}%`;
        if (type === 'years') return `${value} ${value === 1 ? 'year' : 'years'}`;
        return value;
    }

    function scenarioName(slot) {
        return slot === null ? 'Base Plan' : 'Alternative Scenario ' + (slot + 1);
    }

    function savedScenarios() {
        if (!basePlan) return [];
        return [{ name: 'Base Plan', slot: null, ...basePlan },
            ...alternatives.flatMap((snapshot, slot) => snapshot
                ? [{ name: scenarioName(slot), slot, ...snapshot }] : [])];
    }

    function fillScenarioInputs(snapshot) {
        if (!snapshot) return;
        for (const [key, field] of Object.entries(fields)) {
            field.value = snapshot.inputs[key];
            field.setCustomValidity('');
        }
    }

    function setScenarioMode(slot) {
        pendingSlot = slot;
        fields.goalName.readOnly = slot !== null;
        document.getElementById('scenario-mode').hidden = slot === null;
        document.getElementById('calculate-plan').textContent = slot === null
            ? 'Calculate My Plan' : 'Calculate Alternative Scenario';
        if (slot !== null) {
            document.getElementById('scenario-mode-heading').textContent = 'Creating ' + scenarioName(slot);
        }
    }

    function renderScenarioControls() {
        const create = document.getElementById('create-alternative');
        create.hidden = !basePlan;
        create.disabled = pendingSlot !== null || alternatives.every(Boolean);
        let message = 'Calculate a plan to establish your Base Plan.';
        if (pendingSlot !== null) {
            message = 'Creating ' + scenarioName(pendingSlot) + '. Complete the form above or cancel. No saved scenario changes until a valid calculation succeeds.';
        } else if (basePlan && alternatives.every(Boolean)) {
            message = 'Maximum of two alternative scenarios reached. Remove an alternative or reset comparisons to create another.';
        } else if (basePlan) {
            const vacant = alternatives.findIndex(snapshot => !snapshot);
            message = 'Base Plan saved for this page session. Create Alternative Scenario will use slot ' + (vacant + 1)
                + ' and pre-fill the Base Plan assumptions. Saved plans remain unchanged by ordinary calculations.';
        }
        document.getElementById('comparison-status').textContent = message;
    }

    function startAlternative() {
        const slot = alternatives.findIndex(snapshot => !snapshot);
        if (!basePlan || pendingSlot !== null || slot < 0) return;
        fillScenarioInputs(basePlan);
        setScenarioMode(slot);
        renderScenarioControls();
        fields.goalAmount.focus();
    }

    function cancelAlternative() {
        fillScenarioInputs(latestPlan);
        setScenarioMode(null);
        renderScenarioControls();
        document.getElementById('create-alternative').focus();
    }

    function removeAlternative(slot) {
        alternatives[slot] = null;
        renderSavedScenarios();
        renderScenarioControls();
        document.getElementById(pendingSlot === null ? 'create-alternative' : 'cancel-alternative').focus();
    }

    function resetComparison() {
        if (pendingSlot !== null) fillScenarioInputs(latestPlan);
        basePlan = null;
        alternatives = [null, null];
        setScenarioMode(null);
        renderSavedScenarios();
        renderScenarioControls();
    }

    function updateComparison(inputs, plan) {
        // Copy input/result primitives so later form edits cannot mutate saved plans.
        const snapshot = { inputs: { ...inputs }, plan: { ...plan } };
        latestPlan = snapshot;
        if (!basePlan) {
            basePlan = snapshot;
        } else if (pendingSlot !== null) {
            alternatives[pendingSlot] = snapshot;
            setScenarioMode(null);
        }
        renderSavedScenarios();
        renderScenarioControls();
    }

    function makeText(tag, text, className) {
        const element = document.createElement(tag);
        element.textContent = text;
        if (className) element.className = className;
        return element;
    }

    function makeVisualBar(value, maximum, label) {
        // Visual scaling only: no financial calculations are repeated here.
        const ratio = maximum > 0 ? value / maximum * 100 : 0;
        const width = Number.isFinite(ratio) ? Math.min(100, Math.max(0, ratio)) : 0;
        const track = document.createElement('span');
        track.className = 'funding-track';
        track.setAttribute('role', 'img');
        track.setAttribute('aria-label', label + ': ' + formatCurrency(value)
            + (value > maximum && maximum > 0 ? '. Visual bar capped at full width.' : ''));
        const fill = document.createElement('span');
        fill.className = 'funding-fill';
        fill.style.width = width + '%';
        fill.setAttribute('aria-hidden', 'true');
        track.append(fill);
        return track;
    }

    function renderScenarioFunding(scenarios, cards = document.getElementById('scenario-funding-cards'), interactive = true) {
        cards.replaceChildren();
        cards.hidden = !scenarios.length;
        for (const scenario of scenarios) {
            const card = document.createElement('article');
            card.className = 'scenario-funding-card';
            card.dataset.scenario = scenario.name;
            const title = makeText('h3', scenario.name);
            title.id = (interactive ? 'saved-scenario-' : 'print-scenario-funding-') + (scenario.slot === null ? 'base' : scenario.slot + 1);
            card.setAttribute('aria-labelledby', title.id);
            card.append(title, makeText('p', scenario.inputs.goalName, 'scenario-goal-name'));
            const list = document.createElement('dl');
            for (const [key, label] of [['futureSavings', 'Future Value of Existing Savings'], ['totalContributions', 'Monthly Contributions'], ['projectedGrowth', 'Projected Investment Growth']]) {
                const row = document.createElement('div');
                const value = document.createElement('dd');
                value.append(makeVisualBar(scenario.plan[key], scenario.plan.futureGoal, scenario.name + ', ' + label),
                    makeText('span', formatCurrency(scenario.plan[key]), 'funding-amount'));
                row.append(makeText('dt', label), value);
                list.append(row);
            }
            const total = document.createElement('div');
            total.className = 'scenario-total';
            total.append(makeText('dt', 'Future Goal Cost'), makeText('dd', formatCurrency(scenario.plan.futureGoal), 'funding-amount'));
            list.append(total);
            card.append(list);
            if (scenario.plan.futureSavings > scenario.plan.futureGoal) {
                card.append(makeText('p', 'Projected savings exceed the goal cost. The savings bar is capped; the full amount is shown.', 'scenario-note'));
            }
            if (interactive && scenario.slot !== null) {
                const controls = document.createElement('div');
                controls.className = 'enhancement-actions';
                const remove = makeText('button', 'Remove ' + scenario.name, 'button-secondary');
                remove.type = 'button';
                remove.addEventListener('click', () => removeAlternative(scenario.slot));
                controls.append(remove);
                card.append(controls);
            }
            cards.append(card);
        }
    }

    function renderComparisonGraph(id, scenarios, key) {
        const list = typeof id === 'string' ? document.getElementById(id) : id;
        list.replaceChildren();
        const maximum = Math.max(0, ...scenarios.map(scenario => scenario.plan[key]));
        for (const scenario of scenarios) {
            const row = document.createElement('div');
            row.className = 'comparison-chart-row';
            const value = document.createElement('dd');
            value.append(makeVisualBar(scenario.plan[key], maximum, scenario.name),
                makeText('span', formatCurrency(scenario.plan[key]), 'funding-amount'));
            row.append(makeText('dt', scenario.name), value);
            list.append(row);
        }
    }

    function renderComparisonTable(scenarios, columns = document.getElementById('comparison-columns'), rows = document.getElementById('comparison-rows')) {
        columns.replaceChildren();
        for (const label of ['Metric', ...scenarios.map(scenario => scenario.name)]) {
            const heading = makeText('th', label);
            heading.scope = 'col';
            heading.setAttribute('role', 'columnheader');
            columns.append(heading);
        }
        rows.replaceChildren();
        for (const [source, key, label, type] of metrics) {
            if (key === 'goalName') continue;
            const row = document.createElement('tr');
            row.setAttribute('role', 'row');
            const heading = makeText('th', label);
            heading.scope = 'row';
            heading.setAttribute('role', 'rowheader');
            row.append(heading);
            for (const scenario of scenarios) {
                const cell = document.createElement('td');
                cell.setAttribute('role', 'cell');
                const mobileLabel = makeText('span', scenario.name, 'comparison-mobile-label');
                mobileLabel.setAttribute('aria-hidden', 'true');
                cell.append(mobileLabel, document.createTextNode(formatMetric(scenario[source][key], type)));
                row.append(cell);
            }
            rows.append(row);
        }
    }

    function renderComparisonExplanation(scenarios, container = document.getElementById('comparison-explanation'), reference = basePlan, referenceName = 'Base Plan') {
        container.replaceChildren();
        for (const scenario of scenarios.slice(1)) {
            const changed = metrics.filter(([source, key]) => source === 'inputs' && key !== 'goalName' && scenario.inputs[key] !== reference.inputs[key]);
            const descriptions = changed.map(([, key, label, type]) => label.toLowerCase() + ' from '
                + formatMetric(reference.inputs[key], type) + ' to ' + formatMetric(scenario.inputs[key], type));
            const sentences = [descriptions.length
                ? scenario.name + ' changes ' + descriptions.join('; ') + '.'
                : scenario.name + ' uses the same assumptions as the ' + referenceName + '.'];
            if (changed.length > 1) sentences.push('Several assumptions changed together; the result reflects their combined effects, not one change alone.');
            if (changed.some(([, key]) => key === 'years')) sentences.push('The goal period affects both the number of monthly contributions and the time over which assumed inflation and returns compound.');
            if (changed.some(([, key]) => key === 'inflation')) sentences.push('Inflation is used to estimate future purchasing costs; a higher inflation assumption raises those costs when other assumptions stay fixed.');
            if (changed.some(([, key]) => key === 'currentSavings')) sentences.push('Existing savings contribute toward the future goal and may reduce the remaining funding gap.');
            if (changed.some(([, key]) => key === 'annualReturn')) sentences.push('The assumed return affects projected savings and growth on monthly contributions; it is illustrative and not guaranteed.');
            sentences.push('The estimated future goal cost is ' + formatCurrency(scenario.plan.futureGoal)
                + ' (' + referenceName + ': ' + formatCurrency(reference.plan.futureGoal) + '), the funding gap is '
                + formatCurrency(scenario.plan.fundingGap) + ' (' + referenceName + ': ' + formatCurrency(reference.plan.fundingGap)
                + '), and the monthly contribution is ' + formatCurrency(scenario.plan.monthlyContribution)
                + ' (' + referenceName + ': ' + formatCurrency(reference.plan.monthlyContribution) + ').');
            container.append(makeText('p', sentences.join(' ')));
        }
        if (scenarios.length > 1) container.append(makeText('p', 'All scenarios are illustrative estimates. Actual inflation, returns and goal costs may differ.'));
    }

    function renderSavedScenarios() {
        const scenarios = savedScenarios();
        renderScenarioFunding(scenarios);
        document.getElementById('comparison-content').hidden = scenarios.length < 2;
        renderComparisonGraph('monthly-comparison-chart', scenarios, 'monthlyContribution');
        renderComparisonGraph('gap-comparison-chart', scenarios, 'fundingGap');
        renderComparisonTable(scenarios);
        renderComparisonExplanation(scenarios);
    }

    function updatePrintPlan(inputs) {
        const list = document.getElementById('print-inputs');
        list.replaceChildren();
        for (const [source, key, label, type] of metrics) {
            if (source !== 'inputs') continue;
            const row = document.createElement('div');
            const term = document.createElement('dt');
            const value = document.createElement('dd');
            term.textContent = label;
            value.textContent = formatMetric(inputs[key], type);
            row.append(term, value);
            list.append(row);
        }
        document.getElementById('print-plan-details').hidden = false;
        document.getElementById('print-actions').hidden = false;
    }

    function resetResults() {
        for (const id of Object.keys(outputKeys)) {
            document.getElementById(id).textContent = formatCurrency(0);
        }
        summary.textContent = defaultSummary;
        renderFundingVisualisation({ futureGoal: 0, futureSavings: 0, totalContributions: 0, projectedGrowth: 0 });
        latestPlan = null;
        resetComparison();
        document.getElementById('print-actions').hidden = true;
        document.getElementById('print-plan-details').hidden = true;
        document.getElementById('print-inputs').replaceChildren();
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
        updateComparison(inputs, plan);
        updatePrintPlan(inputs);
    });

    for (const field of Object.values(fields)) {
        field.addEventListener('input', () => field.setCustomValidity(''));
    }

    form.addEventListener('reset', () => {
        // The native reset action restores the HTML defaults without reloading.
        for (const field of Object.values(fields)) field.setCustomValidity('');
        resetResults();
    });

    // Print options capture references to immutable saved snapshots for this dialog only.
    let printAvailable = [];
    const printDialog = document.getElementById('print-options');

    function clearPrintReport() {
        document.body.classList.remove('printing-selected');
        const report = document.getElementById('selected-print-report');
        report.hidden = true;
        report.replaceChildren();
    }

    function openPrintOptions() {
        clearPrintReport();
        printAvailable = savedScenarios();
        if (!printAvailable.length && latestPlan) {
            printAvailable = [{ name: 'Current Plan', slot: null, ...latestPlan }];
        }
        if (!printAvailable.length) return;
        const options = document.getElementById('print-scenario-options');
        options.replaceChildren();
        printAvailable.forEach((scenario, index) => {
            const label = document.createElement('label');
            label.className = 'print-scenario-option';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = 'printScenario';
            checkbox.value = String(index);
            checkbox.id = 'print-choice-' + index;
            checkbox.checked = true;
            label.htmlFor = checkbox.id;
            checkbox.setAttribute('aria-describedby', 'print-selection-error');
            checkbox.addEventListener('change', () => {
                document.getElementById('print-selection-error').textContent = '';
            });
            label.append(checkbox, document.createTextNode(scenario.name));
            options.append(label);
        });
        document.getElementById('print-selection-error').textContent = '';
        printDialog.showModal();
        options.querySelector('input').focus();
    }

    function closePrintOptions() {
        printDialog.close();
        printAvailable = [];
        document.getElementById('print-scenario-options').replaceChildren();
        document.getElementById('print-selection-error').textContent = '';
        document.getElementById('print-plan').focus();
    }

    function buildSelectedPrintReport(scenarios) {
        const report = document.getElementById('selected-print-report');
        report.replaceChildren();
        const header = document.createElement('header');
        header.append(makeText('p', 'GoalBridge', 'brand-name'), makeText('h1', 'Goal Planning Summary'));
        report.append(header);
        for (const scenario of scenarios) {
            const card = document.createElement('article');
            card.className = 'selected-plan-summary';
            card.dataset.scenario = scenario.name;
            card.append(makeText('h2', scenario.name));
            const details = document.createElement('dl');
            details.className = 'selected-plan-details';
            for (const [source, key, label, type] of metrics) {
                const row = document.createElement('div');
                row.append(makeText('dt', label), makeText('dd', formatMetric(scenario[source][key], type)));
                details.append(row);
            }
            card.append(details);
            const funding = document.createElement('div');
            funding.className = 'selected-funding';
            renderScenarioFunding([scenario], funding, false);
            card.append(funding, makeText('h3', 'Your Plan'));
            const summaryText = document.createElement('p');
            renderSummary(scenario.inputs, scenario.plan, summaryText);
            card.append(summaryText);
            report.append(card);
        }
        if (scenarios.length > 1) {
            const comparison = document.createElement('section');
            comparison.className = 'selected-comparison';
            comparison.append(makeText('h2', 'Compare Your Scenarios'));
            const graphs = document.createElement('div');
            graphs.className = 'comparison-graphs';
            for (const [key, title] of [['monthlyContribution', 'Estimated Monthly Contribution'], ['fundingGap', 'Estimated Funding Gap']]) {
                const chart = document.createElement('section');
                chart.className = 'comparison-graph';
                chart.append(makeText('h3', title));
                const list = document.createElement('dl');
                renderComparisonGraph(list, scenarios, key);
                chart.append(list);
                graphs.append(chart);
            }
            comparison.append(graphs);
            const table = document.createElement('table');
            table.className = 'comparison-table';
            table.append(makeText('caption', 'Selected scenario assumptions and estimated results'));
            const head = document.createElement('thead');
            const columns = document.createElement('tr');
            const rows = document.createElement('tbody');
            head.append(columns);
            table.append(head, rows);
            renderComparisonTable(scenarios, columns, rows);
            comparison.append(table, makeText('h3', 'Understanding the differences'));
            const interpretation = document.createElement('div');
            interpretation.className = 'selected-interpretation';
            // The first selected scenario is the reference, even when Base is excluded.
            renderComparisonExplanation(scenarios, interpretation, scenarios[0], scenarios[0].name);
            comparison.append(interpretation);
            report.append(comparison);
        }
        const disclaimer = document.querySelector('.educational-disclaimer').cloneNode(true);
        disclaimer.removeAttribute('aria-labelledby');
        disclaimer.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
        report.append(disclaimer);
        report.hidden = false;
        document.body.classList.add('printing-selected');
    }

    function printSelectedScenarios(event) {
        event.preventDefault();
        const choices = Array.from(document.querySelectorAll('#print-scenario-options input:checked'));
        if (!choices.length) {
            document.getElementById('print-selection-error').textContent = 'Select at least one scenario to print.';
            document.querySelector('#print-scenario-options input').focus();
            return;
        }
        const selected = choices.map(choice => printAvailable[Number(choice.value)]);
        buildSelectedPrintReport(selected);
        closePrintOptions();
        window.print();
    }

    document.getElementById('create-alternative').addEventListener('click', startAlternative);
    document.getElementById('cancel-alternative').addEventListener('click', cancelAlternative);
    document.getElementById('reset-comparison').addEventListener('click', resetComparison);
    document.getElementById('print-plan').addEventListener('click', openPrintOptions);
    document.getElementById('print-options-form').addEventListener('submit', printSelectedScenarios);
    document.getElementById('cancel-print').addEventListener('click', closePrintOptions);
    document.getElementById('select-all-print').addEventListener('click', () => {
        document.querySelectorAll('#print-scenario-options input').forEach(input => { input.checked = true; });
        document.getElementById('print-selection-error').textContent = '';
    });
    printDialog.addEventListener('cancel', event => {
        event.preventDefault();
        closePrintOptions();
    });
    window.addEventListener('afterprint', clearPrintReport);
    resetResults();
})();
