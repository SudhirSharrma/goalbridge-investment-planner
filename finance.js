// Pure model: inputs are validated numbers; rates are annual percentages.
export function calculatePlan(inputs) {
    const inflation = inputs.inflation / 100;
    const annualReturn = inputs.annualReturn / 100;
    const months = inputs.years * 12;
    const futureGoal = inputs.goalAmount * Math.pow(1 + inflation, inputs.years);
    const futureSavings = inputs.currentSavings * Math.pow(1 + annualReturn, inputs.years);
    const fundingGap = Math.max(0, futureGoal - futureSavings);

    // Convert the effective annual return to its equivalent compounded monthly rate.
    const monthlyRate = Math.pow(1 + annualReturn, 1 / 12) - 1;
    let monthlyContribution = 0;
    if (fundingGap > 0) {
        if (monthlyRate === 0) {
            // Zero return: spread the gap evenly, without division by zero.
            monthlyContribution = fundingGap / months;
        } else {
            // Ordinary annuity: each contribution occurs at the end of the month.
            monthlyContribution = fundingGap * monthlyRate
                / (Math.pow(1 + monthlyRate, months) - 1);
        }
    }

    const totalContributions = monthlyContribution * months;
    // With nonnegative returns, growth cannot be negative; remove floating-point residue.
    const projectedGrowth = Math.max(0, fundingGap - totalContributions);
    return { futureGoal, futureSavings, fundingGap, monthlyContribution, totalContributions, projectedGrowth };
}
