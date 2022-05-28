'use strict';

const core = require('@actions/core'),
    github = require('@actions/github'),
    token = core.getInput('token'),
    octokit = github.getOctokit(token);

if(!github.context.payload.issue && !/\/(?:issue|pull-request)s\/\d+$/.test(github.context.payload.project_card?.content_url)) {
    core.info('Not running on an event with an associated issue.');
    return;
}

async function getIssue() {
    let { issue } = github.context.payload;
    if(!issue) {
        const issueNumber = /\/(?:issue|pull-request)s\/(\d+)$/.exec(github.context.payload.project_card?.content_url);
        const { data: result } = await octokit.rest.issues.get({
            ...github.context.repo,
            issue_number: issueNumber[1],
        });
        issue = result;
    }
    return issue;
}

async function createLabelIfNeeded(name, description) {
    try {
        await octokit.rest.issues.getLabel({
            ...github.context.repo,
            name,
        });
    } catch (error) {
        await octokit.rest.issues.createLabel({
            ...github.context.repo,
            name,
            description,
        });
    }
}

async function doStuff() {
    const errors = JSON.parse(core.getInput('validationErrors'));
    const readyLabelName = core.getInput('readyLabel');
    const labelDescription = 'This label is used to indicate that the issue has no validation errors and is ready to be reviewed.';
    const issue = await getIssue();

    await createLabelIfNeeded(readyLabelName, labelDescription);

    if(errors.length === 0) {
        core.info('No validation errors found, adding ready label if not already set');
        await octokit.rest.issues.addLabels({
            ...github.context.repo,
            issue_number: issue.number,
            labels: [readyLabelName],
        });
        return;
    }

    if (issue.labels.find((label) => label.name === readyLabelName)) {
        core.info('Validation errors found, removing ready label');
        await octokit.rest.issues.removeLabel({
            ...github.context.repo,
            issue_number: issue.number,
            name: readyLabelName,
        });
    }

    const commentPrefix = 'Validation for this issue failed. Please fix the description of the issue accordingly and the validation will rerun.';
    const stringifiedErrors = errors.map((error) => `- ${error}`).join('\n');
    const comment = `${commentPrefix}\n\n${stringifiedErrors}`;
    core.info('Adding comment with validation info to issue');
    await octokit.rest.issues.createComment({
        ...github.context.repo,
        issue_number: issue.number,
        body: comment,
    });
}

doStuff().catch((error) => {
    console.error(error);
    core.setFailed(error.message);
});
