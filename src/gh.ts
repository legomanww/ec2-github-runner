import { error as logError, info as logInfo, group as logGroup } from '@actions/core';
import { getOctokit, context } from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';
import { StartConfig } from './config';
import { HttpClient, HttpClientResponse } from '@actions/http-client';

class Runner {
  id: number;
  name: string;
  status: string;

  constructor(id: number, name: string, status: string) {
    this.id = id;
    this.name = name;
    this.status = status;
  }
}

export class GithubUtils {
  octokit: InstanceType<typeof GitHub>;

  constructor(githubToken: string) {
    this.octokit = getOctokit(githubToken);
  }

  async getRunnerVersion(config: StartConfig): Promise<string> {
    if (config.github.actionRunnerVersion !== 'latest') {
      return config.github.actionRunnerVersion.replace('v', '');
    }

    const httpClient = new HttpClient('http-client');
    const res: HttpClientResponse = await httpClient.get(
      'https://api.github.com/repos/actions/runner/releases/latest',
    );

    const body: string = await res.readBody();
    const obj = JSON.parse(body);
    return obj.tag_name.replace('v', '');
  }

  // use the unique label to find the runner
  // as we don't have the runner's id, it's not possible to get it in any other way
  async getRunner(label: string): Promise<Runner | undefined> {
    try {
      const runners = await this.octokit.rest.actions.listSelfHostedRunnersForRepo({
        owner: context.repo.owner,
        repo: context.repo.repo,
      });
      const foundRunners = runners.data.runners
        .filter(r => r.labels
          .some(l => l.name === label))
        .map(r => new Runner(r.id, r.name, r.status));
      return foundRunners.length > 0 ? foundRunners[0] : undefined;
    } catch (error) {
      logInfo(`Error while attempting to find the runner: ${JSON.stringify(error)}`);
      return undefined;
    }
  }

  // get GitHub Registration Token for registering a self-hosted runner
  async getRegistrationToken(): Promise<string> {
    try {
      const response = await this.octokit.rest.actions.createRegistrationTokenForRepo({
        owner: context.repo.owner,
        repo: context.repo.repo,
      });
      logInfo('GitHub Registration Token received');
      return response.data.token;
    } catch (error) {
      logError('Error receiving GitHub Registration Token');
      throw error;
    }
  }

  async removeRunner(githubActionRunnerLabel: string): Promise<void> {
    const runner = await this.getRunner(githubActionRunnerLabel);

    // skip the runner removal process if the runner is not found
    if (runner === undefined) {
      logInfo(`GitHub self-hosted runner with label ${githubActionRunnerLabel} was not found, so the removal was skipped`);
      return;
    }

    try {
      await this.octokit.rest.actions.deleteSelfHostedRunnerFromRepo({
        owner: context.repo.owner,
        repo: context.repo.repo,
        runner_id: runner.id,
      });
      logInfo(`GitHub self-hosted runner ${runner.name} removed`);
    } catch (error) {
      logError('Error removing GitHub self-hosted runner');
      throw error;
    }
  }

  async waitForRunnerRegistered(label: string, timeoutMinutes: number): Promise<boolean> {
    const retryIntervalSeconds = 10;
    const quietPeriodSeconds = 30;
    let waitSeconds = 0;

    logInfo(`Waiting ${quietPeriodSeconds}s for the AWS EC2 instance to be registered in GitHub as a new self-hosted runner`);
    try {
      await new Promise(resolve => setTimeout(resolve, quietPeriodSeconds * 1000));
    } catch (error) {
      logGroup('Github registration error details', async () => {
        logError(JSON.stringify(error));
      });
      return false;
    }
    logInfo(`Checking every ${retryIntervalSeconds}s to see if the GitHub self-hosted runner is registered`);

    return await new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        const runner = await this.getRunner(label);

        if (waitSeconds > timeoutMinutes * 60) {
          logError('GitHub self-hosted runner registration error');
          clearInterval(interval);
          reject(`A timeout of ${timeoutMinutes} minutes was exceeded. Your AWS EC2 instance was not able to register itself in GitHub as a new self-hosted runner.`);
          resolve(false);
        }

        if (runner !== undefined && runner.status === 'online') {
          logInfo(`GitHub self-hosted runner ${runner.name} is registered and ready to use`);
          clearInterval(interval);
          resolve(true);
        } else {
          waitSeconds += retryIntervalSeconds;
          logInfo('Checking...');
        }
      }, retryIntervalSeconds * 1000);
    });
  }
}
