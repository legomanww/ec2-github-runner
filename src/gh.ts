import * as core from '@actions/core';
import * as github from '@actions/github';
import { ConfigInterface } from './config';
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
  config: ConfigInterface;

  constructor(config: ConfigInterface) {
    this.config = config;
  }

  async getRunnerVersion(): Promise<string> {
    if (this.config.githubActionRunnerVersion !== 'latest') {
      return this.config.githubActionRunnerVersion.replace('v', '');
    }

    const httpClient = new HttpClient('http-client');
    const res: HttpClientResponse = await httpClient.get(
      'https://api.github.com/repos/actions/runner/releases/latest'
    );

    const body: string = await res.readBody();
    const obj = JSON.parse(body);
    return obj.tag_name.replace('v', '');
  }

  // use the unique label to find the runner
  // as we don't have the runner's id, it's not possible to get it in any other way
  async getRunner(label: string): Promise<Runner | undefined> {
    const octokit = github.getOctokit(this.config.githubToken);

    try {
      const runners = await octokit.rest.actions.listSelfHostedRunnersForRepo({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
      });
      const foundRunners = runners.data.runners
        .filter(r => r.labels
          .some(l => l.name === label))
        .map(r => new Runner(r.id, r.name, r.status));
      return foundRunners.length > 0 ? foundRunners[0] : undefined;
    } catch (error) {
      return undefined;
    }
  }

  // get GitHub Registration Token for registering a self-hosted runner
  async getRegistrationToken(): Promise<string> {
    const octokit = github.getOctokit(this.config.githubToken);

    try {
      const response = await octokit.rest.actions.createRegistrationTokenForRepo({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
      });
      core.info('GitHub Registration Token received');
      return response.data.token;
    } catch (error) {
      core.error('Error receiving GitHub Registration Token');
      throw error;
    }
  }

  async removeRunner(): Promise<void> {
    const runner = await this.getRunner(this.config.githubActionRunnerLabel);
    const octokit = github.getOctokit(this.config.githubToken);

    // skip the runner removal process if the runner is not found
    if (runner === undefined) {
      core.info(`GitHub self-hosted runner with label ${this.config.githubActionRunnerLabel} was not found, so the removal was skipped`);
      return;
    }

    try {
      await octokit.rest.actions.deleteSelfHostedRunnerFromRepo({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        runner_id: runner.id,
      });
      core.info(`GitHub self-hosted runner ${runner.name} removed`);
    } catch (error) {
      core.error('Error removing GitHub self-hosted runner');
      throw error;
    }
  }

  async waitForRunnerRegistered(label: string): Promise<boolean> {
    const timeoutMinutes: number = 5;
    const retryIntervalSeconds: number = 10;
    const quietPeriodSeconds: number = 30;
    let waitSeconds: number = 0;

    core.info(`Waiting ${quietPeriodSeconds}s for the AWS EC2 instance to be registered in GitHub as a new self-hosted runner`);
    try {
      await new Promise(resolve => setTimeout(resolve, quietPeriodSeconds * 1000));
    } catch (error) {
      core.group("Github registration error details", async () => {
        core.error(JSON.stringify(error));
      });
      return false;
    }
    core.info(`Checking every ${retryIntervalSeconds}s to see if the GitHub self-hosted runner is registered`);

    return await new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        const runner = await this.getRunner(label);

        if (waitSeconds > timeoutMinutes * 60) {
          core.error('GitHub self-hosted runner registration error');
          clearInterval(interval);
          reject(`A timeout of ${timeoutMinutes} minutes was exceeded. Your AWS EC2 instance was not able to register itself in GitHub as a new self-hosted runner.`);
          resolve(false);
        }

        if (runner !== undefined && runner.status === 'online') {
          core.info(`GitHub self-hosted runner ${runner.name} is registered and ready to use`);
          clearInterval(interval);
          resolve(true);
        } else {
          waitSeconds += retryIntervalSeconds;
          core.info('Checking...');
        }
      }, retryIntervalSeconds * 1000);
    });
  }
}
