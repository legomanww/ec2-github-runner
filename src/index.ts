import { GithubUtils } from './gh';
import { Config, ConfigInterface } from './config';
import * as core from '@actions/core';
import { AwsUtils } from './aws';

function setOutput(label: string, ec2InstanceId: string): void {
  core.setOutput('label', label);
  core.setOutput('ec2-instance-id', ec2InstanceId);
}

async function start(config: ConfigInterface): Promise<void> {
  const gh = new GithubUtils(config);
  const aws = new AwsUtils(config);

  const githubRegistrationToken = await gh.getRegistrationToken();
  const ec2InstanceId = await aws.startEc2Instance(githubRegistrationToken);
  if (ec2InstanceId === undefined || ec2InstanceId === '') {
    core.setFailed('Could not get EC2 Instance ID');
    return;
  }
  const label = config.githubActionRunnerLabel;
  setOutput(label, ec2InstanceId);
  await aws.waitForInstanceRunning(ec2InstanceId);
  if (!await gh.waitForRunnerRegistered(label)){
    core.setFailed('Runner did not register');
  }
}

async function stop(config: ConfigInterface): Promise<void> {
  const gh = new GithubUtils(config);
  const aws = new AwsUtils(config);

  await aws.terminateEc2Instance();
  await gh.removeRunner();
}

export async function run() {
  try {
    const config: ConfigInterface = new Config();
    if (config.actionMode === 'start') {
      await start(config);
    } else {
      await stop(config);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.error(error);
      core.setFailed(error.message);
    }
    core.error('Unknown error occurred');
  }
}

run();
