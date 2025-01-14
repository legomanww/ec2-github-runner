import { GithubUtils } from './gh';
import { StartConfig, StopConfig } from './config';
import { setOutput, setFailed, error as logError } from '@actions/core';
import { AwsUtils } from './aws';

function setOutputs(label: string, ec2InstanceId: string): void {
  setOutput('label', label);
  setOutput('ec2-instance-id', ec2InstanceId);
}

async function start(config: StartConfig): Promise<void> {
  const gh = new GithubUtils(config.githubToken);
  const aws = new AwsUtils(config);

  const githubRegistrationToken = await gh.getRegistrationToken();
  const ec2InstanceId = await aws.startEc2Instance(githubRegistrationToken, config.githubToken);
  if (ec2InstanceId === undefined || ec2InstanceId === '') {
    setFailed('Could not get EC2 Instance ID');
    return;
  }
  const label = config.githubActionRunnerLabel;
  setOutputs(label, ec2InstanceId);
  await AwsUtils.waitForInstanceRunning(ec2InstanceId);
  try {
    if (!await gh.waitForRunnerRegistered(label)) {
      setFailed('Runner did not register');
    }
  } catch (error) {
    setFailed(`Error registering runner: ${JSON.stringify(error)}`);
  }
}

async function stop(config: StopConfig): Promise<void> {
  const gh = new GithubUtils(config.githubToken);

  await AwsUtils.terminateEc2Instance(config.githubToken);
  await gh.removeRunner(config.githubActionRunnerLabel);
}

export async function runStart() {
  try {
    const config: StartConfig = new StartConfig();
    await start(config);
  } catch (error) {
    if (error instanceof Error) {
      logError(error);
      setFailed(error.message);
    }
    logError('Unrecoverable error occurred');
  }
}

export async function runStop() {
  try {
    const config: StopConfig = new StopConfig();
    await stop(config);
  } catch (error) {
    if (error instanceof Error) {
      logError(error);
      setFailed(error.message);
    }
    logError('Unrecoverable error occurred');
  }
}
